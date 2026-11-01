require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

/**
 * Generates compelling advertising copies and creative suggestions for Meta Ads.
 * @param {Object} params
 * @param {string} params.productName
 * @param {string} params.description
 * @param {string} params.targetAudience
 * @param {string} params.objective - e.g., 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'MESSAGES'
 * @param {string} params.platform - 'FACEBOOK', 'INSTAGRAM', 'BOTH'
 * @param {string} params.callToAction - e.g., 'WHATSAPP_MESSAGE', 'LEARN_MORE', 'SIGN_UP'
 */
async function generateAdCreatives({
  productName,
  description,
  targetAudience,
  objective = 'OUTCOME_LEADS',
  platform = 'BOTH',
  callToAction = 'WHATSAPP_MESSAGE'
}) {
  try {
    const prompt = `You are a high-performance Meta Ads (Facebook & Instagram) copywriter and growth marketer.
Generate 3 distinct high-converting ad variations for the following offering:

Product / Service Name: "${productName}"
Description & Unique Value Proposition: "${description}"
Target Audience: "${targetAudience || 'Relevant professionals and potential buyers'}"
Advertising Objective: "${objective}"
Target Placements: "${platform}"
Call To Action: "${callToAction}"

Generate your response in strictly VALID JSON format without extra commentary or markdown codeblocks outside JSON.
Return an object matching this JSON structure:
{
  "variations": [
    {
      "angle": "e.g., Direct Benefit / Urgency / Social Proof",
      "primaryText": "Primary text copy for Facebook/Instagram feed (compelling hook, value proposition, emoji-friendly)",
      "headline": "Short, punchy headline under 40 characters",
      "description": "Short description for link preview under 30 characters",
      "callToAction": "${callToAction}",
      "suggestedImagePrompt": "Detailed visual description prompt for an AI image generator or designer for the creative image",
      "whatsappOpeningMessage": "Pre-filled starter greeting that the user sends when clicking Click-to-WhatsApp"
    }
  ],
  "targetingRecommendations": {
    "recommendedAges": {"min": 21, "max": 55},
    "interests": ["keyword 1", "keyword 2", "keyword 3"],
    "placementTips": "Best placement recommendation (e.g., Instagram Reels + FB Feed)"
  }
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    console.error('[AI Ad Creative] Generation error:', err);
    throw new Error('Failed to generate ad creatives: ' + err.message);
  }
}

module.exports = {
  generateAdCreatives
};
