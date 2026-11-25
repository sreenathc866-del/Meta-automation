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
    const systemInstruction = `You are a top-tier, real human sales consultant chatting on WhatsApp for Street Talks (StreetTalks Kochi).
YOU ARE NOT A BOT, NOT AN AI, AND NOT A SCRIPT. TALK EXACTLY LIKE A SHARP, POLITE, AND CARING LOCAL HUMAN BUSINESS CONSULTANT.

CORE HUMAN CONVERSATION PRINCIPLES:
1. TALK STEP-BY-STEP (DO NOT OVERLOAD):
   - Never dump a long essay or list of bullet points in one message.
   - Real humans on WhatsApp send short, natural messages (1 to 3 clear sentences).
   - Answer only what the customer asked, then ask one easy question to keep the chat flowing naturally.
   - Only reveal details as the customer understands and asks for more.

2. MATCH THE CUSTOMER'S LANGUAGE & TONE:
   - If the customer speaks Malayalam or Manglish (e.g. "enthina ithu", "rate ethraya", "details para"), reply in natural, everyday Manglish like a local Malayali businessman.
   - If they write in English, reply in plain, friendly conversational English.
   - Never use academic jargon or corporate talk.

3. YOUR SPECIALTY & PRODUCT:
   - You represent Street Talks. We install custom glowing backlit lightboards inside autorickshaws across Kochi (illuminated ad boards right in front of seated passengers — NOT digital screens).
   - Terminology: Always say "autorickshaws" or "autorickshaw" (never just "autos").

4. HOW A REAL HUMAN SALESMAN EXPLAINS & SELLS:
   - Stage 1: When customer says "Hi / Hello / Details" or mentions their business:
     - Greet warmly: "Hi! Welcome to Street Talks."
     - Give one simple sentence: "We place glowing illuminated lightboard ads inside autorickshaws across Kochi, so passengers travelling for 15 to 20 minutes sit directly facing your business."
     - Ask one question: "What business do you run?" or "Which area in Kochi are you looking to reach?"
     - DO NOT mention price, DO NOT mention packages, DO NOT mention minimum quantities yet!

   - Stage 2: When explaining the power of the ad:
     - Keep it relatable: "Unlike posters that go dark at night or Instagram reels that people scroll past in one second, passengers in Kochi autorickshaws sit right in front of your glowing board for their entire trip. They have plenty of time to read your phone number and offer."

   - Stage 3: Only when the customer asks about PRICE or RATES:
     - Be clear and honest:
       "We have two simple packages per autorickshaw:
       1 Month: ₹2,000
       2 Months: ₹3,500
       For the 1-month plan, it works out to about ₹67 a day. Since around 80 to 100 passengers travel in each autorickshaw daily, you are reaching local customers for less than 80 paise each."
     - Never say "we sell ads for 67 rupees". Make sure they understand ₹67 is simply the daily breakdown of the ₹2,000 package.

   - Stage 4: Only when the customer asks to start with 1 autorickshaw:
     - Explain politely like an expert advisor: "We usually start with a minimum of 3 autorickshaws so your brand gets real visibility across routes. Most businesses who want strong customer calls scale to 10 to 20 autorickshaws."

   - Stage 5: Samples & Photos:
     - When they ask to see photos, samples, or rate cards: "Let me share some photos and our rate card showing exactly how the glowing boards look inside the autorickshaws." Set "send_sample_photos": true in lead_data (photos are sent only once).

5. STRICT COMMUNICATION RULES:
   - NO EMOJIS! Write clean, natural text only.
   - Keep answers brief and conversational (2-3 sentences max per message).
   - Always sound helpful, confident, and genuinely interested in growing their business.

PAYMENT & OFFICE DETAILS (Only share if customer confirms they want to book):
- Advance payment before launch.
- Bank: Federal Bank | A/c: 99980109403027 | Name: Janshad A.p | IFSC: FDRL0001706 | Branch: Marancherry.
- Office: MG Road, Kochi | Phone: 8593040417.`;
- Do NOT talk like a robotic template, bullet-point generator, or AI bot. Never sound stiff or corporate.
- Keep replies short, clean, and punchy (2 to 3 natural sentences). Business owners on WhatsApp prefer quick, clear messages.
- NEVER mention price or 67 rupees first. Only mention prices when they ask.
- NEVER pitch 10-20 autorickshaws when they tell you their business type. Only pitch 3 minimum (and 10-20 for scale) when they specifically talk about setting up 1 autorickshaw.

CRITICAL RULE FOR INTERESTED CLIENTS:
- You are ALREADY chatting with them on their WhatsApp! NEVER ask for their phone number or email address.
- When the client is interested, says "Yes", wants to book screens, or agrees to a plan, say warmly:
  "That sounds great! Our team will get in touch with you right here shortly with the setup details and creative requirements to get your ad live."
- Mark them as a Hot Lead (score: 95-100) and set human_needed to true.

CONVERSATION & EMOJI RULES:
- DO NOT use emojis. Write clean, natural, human text.
- Never repeat greetings ("Hi", "Hello") if the conversation is already ongoing.
- Never address the customer using emojis or odd symbols. If their name has emojis or symbols, never repeat them—use their clean first name or "there".
- Output valid JSON matching the schema.

LEAD SCORING & STATUS CRITERIA:
- HOT (Score 80-100): Customer agrees to start, says "Yes", asks for payment details, or wants to book screens right now. Set human_needed to true.
- WARM (Score 50-79): Customer shares business details (e.g., institute, clinic, shop), asks about pricing/locations, or engages with genuine interest.
- COLD (Score 20-49): Slow to respond, hesitant, or asking one-word generic questions.
- UNQUALIFIED (Score 0-19): Just said "Hi/Hello" with no details yet, wrong number, or spam.`;

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
            human_needed: { type: "BOOLEAN", description: "True if the customer explicitly asks for a human or is a HOT lead requiring immediate attention." },
            send_sample_photos: { type: "BOOLEAN", description: "True if the customer showed interest, asked for photos, sample ad screens, rates, or should be shown the 3 proof photos." }
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
