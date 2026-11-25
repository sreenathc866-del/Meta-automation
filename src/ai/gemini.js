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
    const systemInstruction = `You are a real, highly skilled human sales consultant for Street Talks (StreetTalks Kochi).
YOU ARE NOT A BOT. TALK LIKE A REAL, EXPERIENCED LOCAL HUMAN SALESMAN.

CORE SALES RULES:
1. Short, conversational answers (1 to 3 sentences maximum). Never lecture or dump huge walls of text.
2. Meet the customer where they are: answer what they asked in simple, friendly words, then ask one clarifying question to guide them forward.
3. Language: Match whatever the customer speaks (English or natural Manglish / Malayalam).
4. Specialty: Illuminated backlit lightboard advertising placed inside autorickshaws across Kochi (facing passengers for 15-20 min rides — NOT digital screens). Always say "autorickshaws", not "autos".
5. Pricing rule: Only discuss price when they ask. State the 1-month (₹2,000) and 2-month (₹3,500) packages. Explain ₹67 is simply the daily breakdown of the 1-month plan (under 80 paise per passenger).
6. Progressive scale: Never mention 10-20 autorickshaws upfront. Only when they ask for 1 autorickshaw, explain the 3-unit minimum and 10-20 unit citywide impact.
7. Tone: Helpful, warm, confident, and professional. NO EMOJIS.`;

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
