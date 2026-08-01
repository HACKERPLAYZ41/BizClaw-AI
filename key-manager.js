import dotenv from 'dotenv';
dotenv.config();

/**
 * OpenRouter API Key Pool & Rate Limiter Manager
 * - Supports 12 explicit API key slots (OPENROUTER_API_KEY_1 to OPENROUTER_API_KEY_12)
 * - Also supports OPENROUTER_API_KEYS (comma separated) & OPENROUTER_API_KEY
 * - If Key 1 fails or rate-limits (429/5xx), automatically falls back to Key 2, Key 3... up to Key 12
 * - Enforces max 20 requests per minute per key window
 */

class KeyManager {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.MAX_REQUESTS_PER_MINUTE = 20;
    this.COOLDOWN_MS = 60 * 1000; // 1 minute cooldown on 429
    this.initKeys();
  }

  initKeys() {
    const rawKeysArray = [];

    // 1. Check 12 explicit key slots: OPENROUTER_API_KEY_1 to OPENROUTER_API_KEY_12
    for (let i = 1; i <= 12; i++) {
      const keyVal = process.env[`OPENROUTER_API_KEY_${i}`];
      if (keyVal && keyVal.trim()) {
        rawKeysArray.push(keyVal.trim());
      }
    }

    // 2. Check comma-separated list OPENROUTER_API_KEYS
    if (process.env.OPENROUTER_API_KEYS) {
      process.env.OPENROUTER_API_KEYS.split(',').forEach(k => {
        if (k && k.trim()) rawKeysArray.push(k.trim());
      });
    }

    // 3. Check single key OPENROUTER_API_KEY
    if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()) {
      rawKeysArray.push(process.env.OPENROUTER_API_KEY.trim());
    }

    // Deduplicate keys while maintaining slot sequence
    const uniqueKeys = [...new Set(rawKeysArray)];

    this.keys = uniqueKeys.map((key, idx) => ({
      slot: idx + 1,
      key,
      maskedKey: this.maskKey(key),
      requestCountWindow: 0,
      windowResetTime: Date.now() + 60000,
      failureCount: 0,
      isCoolingDown: false,
      cooldownUntil: 0,
      totalSuccess: 0,
      totalFailures: 0
    }));

    if (this.keys.length === 0) {
      console.warn('[KeyManager] Warning: No OpenRouter API keys found in OPENROUTER_API_KEY_1..12 or OPENROUTER_API_KEYS.');
    } else {
      console.log(`[KeyManager] Initialized 12-Slot Key Engine with ${this.keys.length} active key(s).`);
    }
  }

  maskKey(key) {
    if (!key || key.length < 10) return 'sk-or-***';
    return key.substring(0, 8) + '...' + key.substring(key.length - 4);
  }

  setKeys(keyList) {
    if (!Array.isArray(keyList) || keyList.length === 0) return;
    const existingMap = new Map(this.keys.map(k => [k.key, k]));
    
    this.keys = keyList.map((keyStr, idx) => {
      const trimmed = keyStr.trim();
      if (existingMap.has(trimmed)) {
        const existing = existingMap.get(trimmed);
        existing.slot = idx + 1;
        return existing;
      }
      return {
        slot: idx + 1,
        key: trimmed,
        maskedKey: this.maskKey(trimmed),
        requestCountWindow: 0,
        windowResetTime: Date.now() + 60000,
        failureCount: 0,
        isCoolingDown: false,
        cooldownUntil: 0,
        totalSuccess: 0,
        totalFailures: 0
      };
    });
  }

  refreshWindow(keyState) {
    const now = Date.now();
    if (now >= keyState.windowResetTime) {
      keyState.requestCountWindow = 0;
      keyState.windowResetTime = now + 60000;
    }
    if (keyState.isCoolingDown && now >= keyState.cooldownUntil) {
      keyState.isCoolingDown = false;
      keyState.failureCount = 0;
      console.log(`[KeyManager] Key Slot ${keyState.slot} (${keyState.maskedKey}) cooldown ended. Re-activated.`);
    }
  }

  // Get available key in sequence (Slot 1 -> Slot 2 -> ... -> Slot 12) with failover
  getAvailableKey() {
    if (this.keys.length === 0) {
      this.initKeys();
      if (this.keys.length === 0) {
        throw new Error('No OpenRouter API keys found. Please set OPENROUTER_API_KEY_1..12 in .env file.');
      }
    }

    const startIdx = this.currentIndex;
    let attempts = 0;

    while (attempts < this.keys.length) {
      const keyState = this.keys[this.currentIndex];
      this.refreshWindow(keyState);

      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      attempts++;

      if (!keyState.isCoolingDown && keyState.requestCountWindow < this.MAX_REQUESTS_PER_MINUTE) {
        keyState.requestCountWindow++;
        return keyState;
      }
    }

    // Fallback: pick key with lowest window count among non-cooldown keys
    const availableKeys = this.keys.filter(k => {
      this.refreshWindow(k);
      return !k.isCoolingDown;
    });

    if (availableKeys.length > 0) {
      availableKeys.sort((a, b) => a.requestCountWindow - b.requestCountWindow);
      const chosen = availableKeys[0];
      chosen.requestCountWindow++;
      return chosen;
    }

    // Emergency: pick key with earliest cooldown expiry
    const sorted = [...this.keys].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
    const earliest = sorted[0];
    earliest.requestCountWindow++;
    return earliest;
  }

  markSuccess(keyState) {
    if (!keyState) return;
    keyState.totalSuccess++;
    keyState.failureCount = 0;
  }

  markFailure(keyState, statusCode, errorMsg = '') {
    if (!keyState) return;
    keyState.totalFailures++;
    keyState.failureCount++;

    console.warn(`[KeyManager] Slot ${keyState.slot} (${keyState.maskedKey}) failed (Status ${statusCode}): ${errorMsg}`);

    // If 429 (Rate Limit) or repeated failures, put key in 60s cooldown and trigger failover to next key
    if (statusCode === 429 || keyState.failureCount >= 2) {
      keyState.isCoolingDown = true;
      keyState.cooldownUntil = Date.now() + this.COOLDOWN_MS;
      console.warn(`[KeyManager] Slot ${keyState.slot} placed in 60s cooldown. Failing over to next key slot.`);
    }
  }

  getStats() {
    const now = Date.now();
    return {
      totalKeys: this.keys.length,
      activeKeys: this.keys.filter(k => !k.isCoolingDown).length,
      coolingDownKeys: this.keys.filter(k => k.isCoolingDown).length,
      maxRequestsPerMinute: this.MAX_REQUESTS_PER_MINUTE,
      keys: this.keys.map(k => {
        this.refreshWindow(k);
        return {
          slot: k.slot,
          maskedKey: k.maskedKey,
          requestsInCurrentWindow: k.requestCountWindow,
          isCoolingDown: k.isCoolingDown,
          cooldownRemainingSec: k.isCoolingDown ? Math.max(0, Math.ceil((k.cooldownUntil - now) / 1000)) : 0,
          totalSuccess: k.totalSuccess,
          totalFailures: k.totalFailures
        };
      })
    };
  }
}

export const keyManager = new KeyManager();
