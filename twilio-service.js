import { getUserConfig } from './database.js';

export async function triggerTwilioAlert(username, customerName, message) {
  const clientConfig = getUserConfig(username);
  const twilioConf = clientConfig ? clientConfig.twilio : null;
  
  if (!twilioConf || !twilioConf.enabled) {
    return { success: false, reason: 'Twilio is disabled' };
  }

  const { account_sid, auth_token, twilio_number, owner_number } = twilioConf;
  if (!account_sid || !auth_token || !twilio_number || !owner_number) {
    console.warn('[Twilio] [%s] Missing configurations in database. Skipping voice alert.', username);
    return { success: false, reason: 'Missing credentials' };
  }

  try {
    // TwiML payload reads the text-to-speech message dynamically
    const cleanMsg = (message || '').replace(/[<>&'"]/g, '');
    const twiml = `<Response><Say voice="alice">Hello! This is a BizClaw AI Voice Alert. Customer ${customerName} has requested support or placed an order on your WhatsApp Business Assistant. Please check your CRM dashboard. Goodbye.</Say></Response>`;
    
    const auth = Buffer.from(`${account_sid}:${auth_token}`).toString('base64');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Calls.json`;
    
    const params = new URLSearchParams();
    params.append('To', owner_number);
    params.append('From', twilio_number);
    params.append('Twiml', twiml);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (res.ok) {
      console.log('[Twilio] [%s] Outbound voice call alert triggered successfully to %s', username, owner_number);
      return { success: true };
    } else {
      const errorText = await res.text();
      console.error('[Twilio] [%s] Outbound call request failed: %s', username, errorText);
      return { success: false, reason: errorText };
    }
  } catch (err) {
    console.error('[Twilio] [%s] Error triggering voice call: %s', username, err.message || err);
    return { success: false, error: err.message };
  }
}
