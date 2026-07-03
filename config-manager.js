import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const CONFIG_PATH = path.resolve(process.cwd(), 'config.yml');

const DEFAULT_CONFIG = `
server:
  port: 3000
  admin_username: "utkarsh"
  admin_password: "2402"
  jwt_secret: "merchant_session_signature_secure_19385"

ai:
  global_gemini_api_key: ""
  global_openai_api_key: ""

twilio:
  enabled: false
  account_sid: ""
  auth_token: ""
  twilio_number: ""
  owner_number: ""
`;

let currentConfig = null;

function ensureConfigExists() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, DEFAULT_CONFIG.trim(), 'utf8');
    console.log('[Config] Created default config.yml');
  }
}

export function loadConfig() {
  ensureConfigExists();
  try {
    const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8');
    currentConfig = yaml.load(fileContents);
    if (!currentConfig) {
      throw new Error('Parsed config is empty');
    }
    return currentConfig;
  } catch (error) {
    console.error('[Config] Error loading config.yml, using default fallback:', error);
    currentConfig = yaml.load(DEFAULT_CONFIG);
    return currentConfig;
  }
}

export function getConfig() {
  if (!currentConfig) {
    return loadConfig();
  }
  return currentConfig;
}

export function updateConfig(newConfig) {
  try {
    if (!currentConfig) {
      loadConfig();
    }
    
    for (const key of Object.keys(newConfig)) {
      if (typeof newConfig[key] === 'object' && newConfig[key] !== null && currentConfig[key]) {
        currentConfig[key] = { ...currentConfig[key], ...newConfig[key] };
      } else {
        currentConfig[key] = newConfig[key];
      }
    }

    const yamlStr = yaml.dump(currentConfig, { indent: 2 });
    fs.writeFileSync(CONFIG_PATH, yamlStr, 'utf8');
    console.log('[Config] Successfully updated config.yml');
    return true;
  } catch (error) {
    console.error('[Config] Error saving config.yml:', error);
    return false;
  }
}
