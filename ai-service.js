import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { getConfig } from './config-manager.js';
import { getUserConfig } from './database.js';

// Verify if client has custom key or if system has global fallback key in .env
function getApiKey(provider, clientConfig, globalConfig) {
  if (provider === 'gemini') {
    return clientConfig.ai?.gemini_api_key || globalConfig.ai?.global_gemini_api_key || '';
  }
  if (provider === 'openai') {
    return clientConfig.ai?.openai_api_key || globalConfig.ai?.global_openai_api_key || '';
  }
  return '';
}

function isApiKeyConfigured(provider, clientConfig, globalConfig) {
  const key = getApiKey(provider, clientConfig, globalConfig);
  if (!key || key.trim() === '') return false;
  
  if (provider === 'gemini' && (key.includes('AIzaSy...') || key.trim() === '')) return false;
  if (provider === 'openai' && (key.includes('sk-...') || key.trim() === '')) return false;
  
  return true;
}

// Generate chatbot responses for a specific client tenant
export async function generateChatReply(username, phone, messageText, history) {
  const globalConfig = getConfig();
  const clientConfig = getUserConfig(username);

  const provider = clientConfig.ai?.provider || 'gemini';
  const systemPrompt = clientConfig.business_agent?.system_prompt || 'You are a helpful business assistant.';
  const temperature = clientConfig.ai?.temperature ?? 0.7;

  if (!isApiKeyConfigured(provider, clientConfig, globalConfig)) {
    console.warn(`[AI Service] Warning: API key for "${provider}" (Client: ${username}) is not configured globally or locally.`);
    return `Hello! This is ${clientConfig.business_agent?.name || 'Assistant'}. We are currently updating our automated customer service system. A human representative will get back to you shortly!`;
  }

  const apiKey = getApiKey(provider, clientConfig, globalConfig);

  try {
    if (provider === 'gemini') {
      const modelName = clientConfig.ai?.gemini_model || 'gemini-2.5-flash';
      
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: systemPrompt 
      });

      const contents = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
      contents.push({ role: 'user', parts: [{ text: messageText }] });

      const result = await model.generateContent({
        contents,
        generationConfig: { temperature }
      });

      return result.response.text().trim();
    } else {
      const modelName = clientConfig.ai?.openai_model || 'gpt-4o-mini';
      const openai = new OpenAI({ apiKey });
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        { role: 'user', content: messageText }
      ];

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        temperature
      });

      return completion.choices[0].message.content.trim();
    }
  } catch (error) {
    console.error(`[AI Service] Error generating response for user "${username}" from provider "${provider}":`, error);
    return `I apologize for the delay. We are experiencing high volume at the moment, but we have received your message and will respond as soon as possible.`;
  }
}

// Dynamically extract CRM lead interests for a specific client tenant
export async function extractLeadInfo(username, phone, name, history) {
  const globalConfig = getConfig();
  const clientConfig = getUserConfig(username);
  const provider = clientConfig.ai?.provider || 'gemini';

  if (!isApiKeyConfigured(provider, clientConfig, globalConfig)) {
    return 'Inquired about store services';
  }

  const apiKey = getApiKey(provider, clientConfig, globalConfig);
  const formattedHistory = history.map(msg => `${msg.role === 'user' ? 'Customer' : 'AI Assistant'}: ${msg.content}`).join('\n');
  
  const extractionPrompt = `
You are a CRM parser. Analyze the conversation history with this customer (profile name: "${name}", phone: "${phone}").
Identify if they are expressing a clear inquiry, ordering products, booking appointments, or asking FAQs. Summarize their core request or interest in a short, single-line, professional sentence (maximum 15 words).
If they are only starting the conversation, summarize as "Initial contact / Greeting".

Conversation History:
${formattedHistory}

Reply ONLY with the single summary sentence. Do not include markdown, greetings, prefix titles, or notes.
`;

  try {
    if (provider === 'gemini') {
      const modelName = clientConfig.ai?.gemini_model || 'gemini-2.5-flash';
      
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent(extractionPrompt);
      return result.response.text().trim().replace(/['"“”]/g, '');
    } else {
      const modelName = clientConfig.ai?.openai_model || 'gpt-4o-mini';
      const openai = new OpenAI({ apiKey });
      
      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: extractionPrompt }],
        temperature: 0.3
      });

      return completion.choices[0].message.content.trim().replace(/['"“”]/g, '');
    }
  } catch (error) {
    console.error(`[AI Service] Lead extraction failed for client "${username}":`, error);
    return 'Inquired about store services';
  }
}
