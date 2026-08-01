import { callOpenRouterAI, cleanAIOutput } from '../ai-service.js';

/**
 * 4. Lead Manager Agent
 * Collects, qualifies, and re-engages leads captured from WhatsApp & web conversations.
 */

/**
 * Generate Re-engagement / Follow-up Message for a Lead
 */
export async function generateLeadFollowUp({ businessName, leadName = 'Customer', summary = 'service inquiry', offerDetails = '' }) {
  const prompt = `You are a friendly sales assistant for "${businessName}".
Draft a warm, non-spammy WhatsApp follow-up message to re-engage a customer who previously inquired about services.

Customer Name: ${leadName}
Previous Inquiry Summary: "${summary}"
Special Offer / Incentive: "${offerDetails || 'Complimentary consultation / special discount'}"

Requirements:
- 2-3 short, friendly sentences
- Directly reference their previous inquiry
- Clear, low-pressure call to action (e.g. "Let us know if you'd like to book a slot this week!")
- Do not repeat URLs or text.`;

  try {
    const rawMsg = await callOpenRouterAI({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a warm, helpful sales consultant.',
      temperature: 0.7,
      maxTokens: 200
    });

    return cleanAIOutput(rawMsg);
  } catch (error) {
    console.error('[LeadAgent] Failed to generate follow-up:', error.message);
    return `Hi ${leadName}! We wanted to check back regarding your inquiry about ${summary} at ${businessName}. ${offerDetails ? offerDetails + ' ' : ''}Feel free to reply here if you have any questions or would like to book a slot!`;
  }
}
