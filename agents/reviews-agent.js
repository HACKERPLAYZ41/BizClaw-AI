import { callOpenRouterAI, cleanAIOutput } from '../ai-service.js';

/**
 * 3. Reviews & Feedback Agent
 * Monitors online reviews, drafts professional replies, and alerts business owner on negative feedback.
 */

/**
 * Draft Reply for a Customer Review
 */
export async function generateReviewReply({ businessName, reviewerName = 'Customer', rating = 5, reviewText = '', category = '' }) {
  const isNegative = rating <= 3;
  
  const prompt = `You are a professional Reputation Management Agent for "${businessName || 'Our Business'}".
Draft an appropriate public response to the following customer review.

Reviewer Name: ${reviewerName}
Star Rating: ${rating}/5 Stars
Review Text: "${reviewText || (isNegative ? 'Unsatisfactory experience' : 'Great service!')}"
Business Category: ${category}

Guidelines:
- If Rating is 4-5 stars: Be warm, appreciative, mention looking forward to welcoming them back, and naturally mention a core service keyword.
- If Rating is 1-3 stars: Be empathetic, polite, non-defensive. Apologize for any inconvenience and kindly invite them to contact support directly to resolve the issue.
- Keep response concise (2-4 sentences max).
- Do not repeat URLs or text.`;

  try {
    const rawReply = await callOpenRouterAI({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are an empathetic, professional customer service manager.',
      temperature: 0.6,
      maxTokens: 250
    });

    const reply = cleanAIOutput(rawReply);

    return {
      reply,
      rating,
      sentiment: isNegative ? 'Negative' : 'Positive',
      needsEscalation: isNegative
    };
  } catch (error) {
    console.error('[ReviewsAgent] Failed to generate review reply:', error.message);
    return {
      reply: isNegative 
        ? `Dear ${reviewerName}, we sincerely apologize for your experience. Please contact our manager directly so we can make things right.`
        : `Thank you so much, ${reviewerName}! We truly appreciate your support and look forward to serving you again soon!`,
      rating,
      sentiment: isNegative ? 'Negative' : 'Positive',
      needsEscalation: isNegative
    };
  }
}
