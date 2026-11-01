require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

/**
 * Handles the WhatsApp AI conversation and extracts lead qualification data using structured output.
 * @param {string} incomingMessage - The customer's latest WhatsApp message.
 * @param {string} context - RAG knowledge base context.
 * @param {Array} conversationHistory - Array of previous { role, text } objects.
 * @returns {Promise<Object>} - Contains { response_text, lead_data }
 */
async function generateWhatsAppResponse(incomingMessage, context, conversationHistory = [], audioData = null) {
  try {
    const systemInstruction = `You are a real, friendly marketing consultant chatting with business owners on WhatsApp.
TALK LIKE A REAL HUMAN. Never talk like a robot or textbook. Speak in simple, everyday words that any normal business owner can understand immediately.

YOUR ONLY FOCUS:
You exclusively help clients get more customers, phone calls, and sales using Digital Marketing & Meta Ads (Facebook & Instagram).

HOW TO EXPLAIN OUR PACKAGES IN SIMPLE WORDS:

1. ₹6,000 Single Campaign Plan:
   - Perfect for testing: We design the ad, write the text, target the exact audience in their city/area, and set up everything so customers contact them directly on WhatsApp or phone.
   - Note about Ad Budget: The ₹6,000 is our service charge for doing all the work. The actual ad running cost (paid to Facebook/Meta to show the ad to people) is separate, and the client decides whatever budget they are comfortable with (like ₹200 or ₹500 a day).

2. ₹15,000 Monthly Complete Plan (Most Popular & Best Value):
   - Perfect for steady growth: For the full month, we handle their entire marketing:
     • 10 custom video reels edited for Instagram & Facebook
     • 5 eye-catching promo posters
     • Complete daily management and optimization of their ads so leads keep coming in
   - Note about Ad Budget: Just like the single plan, the ad spend paid to Facebook is extra, and the client chooses the daily budget according to their comfort.

HOW TO TALK LIKE A HUMAN SALES EXPERT:
- Be warm, helpful, and conversational.
- Keep replies crisp and easy to read (2-4 simple sentences). Don't send huge walls of text.
- If they ask about the ₹15,000 package, explain clearly: we create 10 videos + 5 posters + manage the ads, and remind them in a friendly way that the Facebook ad budget is extra based on what they want to spend.
- Gently ask about their business: "What kind of business or service do you run?" to give customized advice.
- Guide them to take action: "Would you like to start with the ₹15,000 monthly plan to get all 10 videos and posters, or test with a single campaign at ₹6,000 first?"

CONVERSATION RULES:
- Never repeat greetings ("Hi", "Hello") if already talking.
- Output valid JSON matching the schema.
- Extract lead score (0-100), urgency, business_type, budget, and timeline.
- Hot Lead (80-100): If they want to get started or ask how to pay, set human_needed to true.`;

    // Construct history messages ensuring it alternates correctly and starts with user
    const contents = [];
    
    // Filter out any starting 'model' messages which Gemini API rejects
    let historyToUse = [...conversationHistory];
    while (historyToUse.length > 0 && historyToUse[0].role !== 'user') {
      historyToUse.shift();
    }

    for (const msg of historyToUse) {
      contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
    }
    let finalParts = [];
    if (audioData) {
      finalParts.push({ 
        text: "User sent a WhatsApp voice message. Listen closely to what the user says in the audio (which may be in Malayalam, Manglish, or English). Reply naturally to what they asked or said in the same language they spoke." 
      });
      finalParts.push({
        inlineData: {
          mimeType: audioData.mimeType,
          data: audioData.base64
        }
      });
    } else {
      finalParts.push({ text: incomingMessage });
    }
    contents.push({ role: 'user', parts: finalParts });

    // We define the JSON schema we want Gemini to return
    const responseSchema = {
      type: "OBJECT",
      properties: {
        response_text: {
          type: "STRING",
          description: "The natural conversational reply to send to the customer on WhatsApp."
        },
        lead_data: {
          type: "OBJECT",
          properties: {
            customer_name: { type: "STRING", nullable: true },
            business_type: { type: "STRING", nullable: true },
            service_required: { type: "STRING", nullable: true },
            requirements: { type: "STRING", nullable: true },
            budget: { type: "STRING", nullable: true },
            timeline: { type: "STRING", nullable: true },
            urgency: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
            lead_score: { type: "INTEGER" },
            lead_status: { type: "STRING", enum: ["HOT", "WARM", "COLD", "UNQUALIFIED"] },
            human_needed: { type: "BOOLEAN", description: "True if the customer explicitly asks for a human or is a HOT lead requiring immediate attention." }
          },
          required: ["urgency", "lead_score", "lead_status", "human_needed"]
        }
      },
      required: ["response_text", "lead_data"]
    };

    let retries = 5;
    while (retries > 0) {
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.2, // Low temperature for consistent JSON extraction
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          }
        });

        // Parse the JSON output
        const jsonOutput = JSON.parse(response.text);
        return jsonOutput;
      } catch (error) {
        console.error(`[WhatsApp] Gemini API Error (Retries left: ${retries - 1}):`, error.message || error);
        retries--;
        if (retries === 0) {
          console.error('[WhatsApp] Gemini API failed after all retries. Silently ignoring to prevent AI-like fallback messages.');
          return {
            response_text: "", // Empty string so we don't send a robotic fallback
            lead_data: {}
          };
        }
        // Wait 12 seconds before retrying to ensure we pass Google's 1-minute rate limit window
        await new Promise(resolve => setTimeout(resolve, 12000));
      }
    }
  } catch (outerError) {
    console.error('[WhatsApp] Unhandled error in generateWhatsAppResponse:', outerError.message || outerError);
    return { response_text: "", lead_data: {} };
  }
}

module.exports = {
  generateWhatsAppResponse
};
