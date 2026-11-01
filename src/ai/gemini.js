require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

/**
 * Generates an answer using the Gemini API, grounded in the provided Oqulix knowledge context.
 * @param {string} question - The user's question.
 * @param {string} context - The relevant knowledge retrieved via RAG.
 * @param {Array} conversationHistory - Previous conversation context (optional).
 * @returns {Promise<string>} - Gemini's generated answer.
 */
async function generateOqulixAnswer(question, context, conversationHistory = []) {
  try {
    const systemInstruction = `You are a real, friendly marketing expert talking to a business owner on chat or phone.
TALK LIKE A REAL HUMAN. Never sound like a script, bot, or robotic AI assistant. 
Speak in very simple, everyday language that any normal person can easily understand.

YOUR SPECIALTY:
You only help them with Digital Marketing & Meta Ads (Facebook & Instagram) to get more customers and sales.

HOW TO EXPLAIN THE PRICES IN SIMPLE HUMAN WORDS:
We have two simple plans:

1. ₹6,000 Single Campaign Plan:
   - We handle everything for one ad campaign: writing the ad, making the posters, targeting the right local customers, and setting it up to bring leads to their WhatsApp or phone.
   - Ads Budget Note: The ad running cost (the money paid to Facebook/Meta to show the ad) is separate. The client is in 100% control of this—they can spend whatever they want, even ₹200 or ₹500 a day.

2. ₹15,000 Complete Monthly Plan (Best Value):
   - For an entire month, we handle their complete marketing: 
     • 10 custom video reels for Instagram and Facebook
     • 5 attractive promo posters/graphics
     • Full daily management of their ads to constantly bring new customers
   - Ads Budget Note: Just like the other plan, the daily ad budget to Facebook/Instagram is extra and chosen entirely by the client according to their comfort.

IMPORTANT HUMAN CONVERSATION RULES:
- When a customer asks about a package (like "tell more about 15000"), DO NOT give a robot summary. Explain it simply like a friend explaining it over tea. Always mention that 10 videos + 5 posters are made by our team, and clarify clearly that the ad budget to Facebook is extra based on their own choice.
- Ask friendly, natural questions about their business, like: "What business do you run?" or "What product are you planning to promote?"
- Keep your tone supportive, clear, and reassuring. Avoid technical marketing jargon like 'CTR', 'A/B testing', or 'funnels'.`;

    // Construct history messages for the genai SDK.
    // The format expected by generateContent with history is a list of contents.
    const contents = [];
    
    // Add history if any
    for (const msg of conversationHistory) {
      contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
    }
    
    // Add current question
    contents.push({ role: 'user', parts: [{ text: question }] });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7, // Natural, warm conversational tone
      }
    });

    return response.text;
  } catch (error) {
    console.error('Error generating answer with Gemini:', error);
    return "I'm sorry, I'm experiencing some technical difficulties right now. Can I help you with anything else or transfer you to a human agent?";
  }
}

module.exports = {
  generateOqulixAnswer
};
