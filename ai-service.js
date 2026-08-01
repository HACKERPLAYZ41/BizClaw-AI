import { keyManager } from './key-manager.js';
import { getConfig } from './config-manager.js';
import { getUserConfig } from './database.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || process.env.AI_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

/**
 * Clean AI Output Helper
 * - Fixes link duplication issues (removes duplicate URLs in response)
 * - Trims extra whitespace and formats clean output for WhatsApp
 */
export function cleanAIOutput(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.trim();

  // Deduplicate URLs in text
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = cleaned.match(urlRegex);

  if (urls && urls.length > 1) {
    const seenUrls = new Set();
    cleaned = cleaned.replace(urlRegex, (match) => {
      const normalized = match.toLowerCase().replace(/\/$/, '');
      if (seenUrls.has(normalized)) {
        return '';
      }
      seenUrls.add(normalized);
      return match;
    });
  }

  // Clean up double spaces or dangling link artifacts
  cleaned = cleaned
    .replace(/  +/g, ' ')
    .replace(/\(\s*\)/g, '')
    .trim();

  return cleaned;
}

/**
 * Core OpenRouter API Request Engine with Multi-Key Failover
 */
export async function callOpenRouterAI({ messages, systemPrompt, temperature = 0.7, maxTokens = 1000, modelOverride = null }) {
  const model = modelOverride || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  
  // Format message payload
  const fullMessages = [];
  if (systemPrompt) {
    fullMessages.push({ role: 'system', content: systemPrompt });
  }

  if (Array.isArray(messages)) {
    for (const msg of messages) {
      fullMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
  }

  // Determine retry attempts based on key pool size
  const keyStats = keyManager.getStats();
  const maxAttempts = Math.max(1, keyStats.totalKeys);
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let keyState = null;
    try {
      keyState = keyManager.getAvailableKey();
    } catch (err) {
      throw new Error(`OpenRouter Key Error: ${err.message}`);
    }

    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keyState.key}`,
          'HTTP-Referer': 'https://bizclaw.ai',
          'X-Title': 'BizClaw AI Marketing Platform',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: fullMessages,
          temperature: temperature,
          max_tokens: maxTokens
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;
        keyManager.markFailure(keyState, statusCode, errorText);

        lastError = new Error(`OpenRouter HTTP ${statusCode}: ${errorText}`);

        // If rate limit (429) or server error, continue loop to try next key in pool
        if (statusCode === 429 || statusCode >= 500) {
          console.warn(`[AI Service] Retrying request with next available API key (Attempt ${attempt + 1}/${maxAttempts})...`);
          continue;
        } else {
          // Unrecoverable error (e.g. invalid payload)
          throw lastError;
        }
      }

      const data = await response.json();
      keyManager.markSuccess(keyState);

      const replyContent = data.choices?.[0]?.message?.content || '';
      return cleanAIOutput(replyContent);

    } catch (err) {
      lastError = err;
      if (keyState) {
        keyManager.markFailure(keyState, 500, err.message);
      }
      console.warn(`[AI Service] Exception on key ${keyState?.maskedKey}: ${err.message}. Retrying...`);
    }
  }

  console.error('[AI Service] All OpenRouter API keys failed or exhausted.');
  throw lastError || new Error('All OpenRouter API keys failed.');
}

/**
 * Generate Customer WhatsApp Chat Reply
 */
export async function generateChatReply(username, phone, messageText, history) {
  const clientConfig = getUserConfig(username) || {};

  const businessAgent = clientConfig.business_agent || {};
  const businessName = businessAgent.name || 'BizClaw AI Assistant';
  
  // Custom or default concise system prompt
  const defaultPrompt = `You are ${businessName}, a friendly and helpful AI assistant for a local small business. 
Answer customer questions accurately, politely, and extremely concisely (1-2 sentences maximum). 
Never output long paragraphs or bullet lists. 
If a user asks for a website link or location, provide the exact link ONLY ONCE. Never duplicate links or text. 
Respond in the same language as the user (English, Hindi, or Hinglish).`;

  const systemPrompt = businessAgent.system_prompt || defaultPrompt;
  const temperature = clientConfig.ai?.temperature ?? 0.7;
  const modelName = clientConfig.ai?.model || DEFAULT_MODEL;

  const messagesPayload = [
    ...history.slice(-10).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    })),
    { role: 'user', content: messageText }
  ];

  try {
    const rawReply = await callOpenRouterAI({
      messages: messagesPayload,
      systemPrompt,
      temperature,
      maxTokens: 300,
      modelOverride: modelName
    });

    return cleanAIOutput(rawReply);
  } catch (error) {
    console.error(`[AI Service] Chat reply generation failed for user "${username}":`, error.message);
    return `Hello! Thank you for contacting ${businessName}. We have received your message and will respond shortly!`;
  }
}

/**
 * Extract CRM Lead Info from Chat History
 */
export async function extractLeadInfo(username, phone, name, history) {
  const formattedHistory = history
    .slice(-10)
    .map(msg => `${msg.role === 'user' ? 'Customer' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const extractionPrompt = `You are an AI CRM parser. Analyze the conversation with customer "${name}" (Phone: "${phone}").
Summarize their core request, product interest, or service booking in a single, short sentence (maximum 12 words).
If they are only greeting, output "Initial Greeting".

Conversation History:
${formattedHistory}

Reply ONLY with the single line summary. Do not include markdown, prefix titles, or quotes.`;

  try {
    const rawSummary = await callOpenRouterAI({
      messages: [{ role: 'user', content: extractionPrompt }],
      systemPrompt: 'You are a precise data extractor. Reply only with the requested summary line.',
      temperature: 0.3,
      maxTokens: 60
    });

    return rawSummary.replace(/['"“”]/g, '').trim() || 'Inquired about store services';
  } catch (error) {
    console.error(`[AI Service] Lead extraction failed for user "${username}":`, error.message);
    return 'Inquired about store services';
  }
}
