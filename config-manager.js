import dotenv from 'dotenv';
import path from 'path';

// Initialize dotenv configuration
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const globalConfig = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    dashboard_password: process.env.ADMIN_PASSWORD || '2402',
    jwt_secret: process.env.JWT_SECRET || 'merchant_session_signature_secure_19385'
  },
  ai: {
    global_gemini_api_key: process.env.GLOBAL_GEMINI_API_KEY || '',
    global_openai_api_key: process.env.GLOBAL_OPENAI_API_KEY || ''
  }
};

export function loadConfig() {
  return globalConfig;
}

export function getConfig() {
  return globalConfig;
}
