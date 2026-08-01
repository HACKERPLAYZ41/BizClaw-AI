import { callOpenRouterAI, cleanAIOutput } from '../ai-service.js';

/**
 * 1. Google Business Profile Agent
 * Helps small business owners dominate local Google search & Maps.
 */

/**
 * Generate SEO-Optimized Google Business Post
 */
export async function generateGooglePost({ businessName, category, services, targetKeywords = '', offerDetails = '', tone = 'engaging' }) {
  const prompt = `You are an expert Local SEO & Google Business Profile Specialist.
Create an engaging, high-converting Google Business Profile post for a local business.

Business Details:
- Name: ${businessName || 'Local Business'}
- Category: ${category || 'Services'}
- Services / Offerings: ${services || 'Quality services'}
- Key Offer / Highlight: ${offerDetails || 'Special deals for new customers'}
- Local Keywords to include: ${targetKeywords || 'near me, top rated'}
- Tone: ${tone}

Post Structure Requirements:
1. Catchy headline with emoji
2. Clear benefit & service description (2-3 short paragraphs)
3. Strong call to action (e.g. Call today / Visit store / Book online)
4. 3-5 relevant local hashtags (e.g. #${(category || 'Business').replace(/\s+/g, '')} #LocalBusiness)

Keep the total length between 100 to 200 words. Do not duplicate links or repeat sentences.`;

  try {
    const rawPost = await callOpenRouterAI({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are an elite Google Business Profile copywriter.',
      temperature: 0.7,
      maxTokens: 500
    });

    return cleanAIOutput(rawPost);
  } catch (error) {
    console.error('[GoogleAgent] Failed to generate post:', error.message);
    throw new Error(`Failed to generate Google Business post: ${error.message}`);
  }
}

/**
 * Suggest Local SEO Keywords & Ranking Tips
 */
export async function suggestLocalKeywords({ businessName, category, cityLocation = 'India', services = '' }) {
  const prompt = `You are a Google Maps & Local SEO Expert.
Analyze this local business and provide strategic local search optimization recommendations.

Business Information:
- Name: ${businessName}
- Category: ${category}
- Location: ${cityLocation}
- Core Services: ${services}

Output Format:
1. Top 8 High-Intent Local Keywords (e.g. "best salon in [city]", "[service] near me")
2. 3 Google Maps Ranking Action Tips for this specific business category.

Keep response structured with clean Markdown headings and bullet points.`;

  try {
    const rawSuggestions = await callOpenRouterAI({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a Google Local SEO Strategist.',
      temperature: 0.5,
      maxTokens: 600
    });

    return cleanAIOutput(rawSuggestions);
  } catch (error) {
    console.error('[GoogleAgent] Failed to suggest keywords:', error.message);
    throw new Error(`Failed to generate keyword suggestions: ${error.message}`);
  }
}

/**
 * Generate Review Request Message to send to satisfied customers via WhatsApp/SMS
 */
export async function generateReviewRequestMessage({ businessName, googleReviewLink = '', customerName = 'Valued Customer' }) {
  const prompt = `Create a polite, warm, and professional WhatsApp message asking a happy customer to leave a 5-star Google review.

Business Name: ${businessName}
Customer Name: ${customerName}
Review Link: ${googleReviewLink || '[Google Review Link]'}

Requirements:
- Short, polite, non-pushy message (2-3 sentences)
- Include the review link EXACTLY ONCE
- Include a warm thank you`;

  try {
    const rawMsg = await callOpenRouterAI({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a customer relationship expert.',
      temperature: 0.6,
      maxTokens: 200
    });

    return cleanAIOutput(rawMsg);
  } catch (error) {
    console.error('[GoogleAgent] Failed to generate review request:', error.message);
    return `Hi ${customerName}! Thank you for visiting ${businessName}. We would really appreciate it if you could share your experience on Google: ${googleReviewLink || 'Google Maps'}. Thank you!`;
  }
}
