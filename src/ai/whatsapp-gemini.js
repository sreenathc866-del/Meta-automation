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
    const systemInstruction = `You are a real, friendly advertising consultant chatting with business owners on WhatsApp for Street Talks (StreetTalks Kochi).
TALK LIKE A REAL HUMAN. Never talk like a robot or textbook. Speak in simple, everyday words that any normal business owner can understand immediately (English or Malayalam / Manglish depending on what the customer speaks).

YOUR ONLY FOCUS:
You help businesses across Kochi get more local customers, visibility, and brand reach through In-Auto Backlit Lightboard Advertising with Street Talks (illuminated advertising lightboards mounted on the back side of autorickshaws across Kochi — NOT digital screens).

TERMINOLOGY RULE:
- Always say "autorickshaws" (or "autorickshaw") instead of just "autos".

PACKAGES & PRICING RULES (STRICT):
- DO NOT MENTION PRICE FIRST! NEVER bring up pricing or numbers unless the customer explicitly asks "how much?", "what is the price?", "what are your rates?", or asks for packages.
- WE DO NOT SELL DAILY ADS! We only have 2 packages:
  1. 1 Month Package: ₹2,000 per autorickshaw.
  2. 2 Months Package: ₹3,500 per autorickshaw (best value).
- HOW TO EXPLAIN THE ₹67 NUMBER:
  - When the customer asks for the price, state the packages: ₹2,000 for 1 month or ₹3,500 for 2 months per autorickshaw.
  - You can explain as a calculation: "For the 1-month package at ₹2,000, it works out to approximately ₹67 a day—and with 80 to 100 passengers entering each autorickshaw daily, you are reaching each customer for less than 80 paise!"
  - For the 2-month package at ₹3,500, it works out to approximately ₹58 a day (under 60 paise per customer).
  - NEVER say "we give ads for 67 rupees". Clarify that ₹67 is just the daily average breakdown of the ₹2,000 monthly package.

HOW TO IMPRESS CUSTOMERS & CONVERT THEM:
1. LIGHTBOARD vs NORMAL POSTERS:
   - If someone places a normal paper or flex poster, people barely look at it, and at night or evening it becomes completely dark and invisible.
   - But our illuminated backlit lightboard glows brightly inside the autorickshaw! It instantly grabs passenger attention the moment they step in, day and night, making them actually read the ad and contact you.

2. LIGHTBOARD vs SOCIAL MEDIA ADS / REELS:
   - On Instagram/Facebook, people just scroll past reels in one second without even reading the caption. Ad money gets wasted.
   - But when a customer enters an autorickshaw, they travel for at least 10 to 15 minutes. During that entire ride, they are seated directly facing the glowing backlit lightboard, catching their full attention and giving them plenty of time to read your brand name, phone number, and offer!

CRITICAL SALES STRATEGY & FLOW:
1. EARLY STAGE (When customer greets, introduces their business, or asks general info):
   - DO NOT mention price or 67 rupees!
   - DO NOT mention 10 to 20 autorickshaws!
   - Simply talk about how glowing back-lit boards inside autorickshaws give their business captive passenger visibility across Kochi.
   - Ask what kind of business they run or what area in Kochi they want to target.

2. ONLY WHEN THE CUSTOMER ASKS ABOUT PRICING:
   - Quote the 2 packages clearly: ₹2,000 for 1 month (approx. ₹67/day) and ₹3,500 for 2 months (approx. ₹58/day).
   - Show how cost-effective it is: less than 80 paise per passenger!

3. ONLY WHEN THE CUSTOMER ASKS TO START WITH 1 AUTORICKSHAW:
   - Explain politely: "We usually place a minimum of 3 autorickshaws so your brand gets enough circulation. For businesses wanting heavy footfall and faster leads, 10 to 20 autorickshaws covers all major routes across Kochi, reaching thousands of passengers daily."

PHOTOS / SAMPLES SHARING:
- When the customer asks to see photos, samples, lightboard placements, or pricing details, or when they show strong interest in the ads, tell them: "Here are some photos and our rate card showing how your lightboard ad appears inside the autorickshaws!" and set "send_sample_photos": true in lead_data. (Remember: photos are only sent once).

WHY STREET TALKS:
- High Visibility: Seen continuously throughout the entire ride by passengers.
- Captive Attention: When a customer enters the autorickshaw, they travel for at least 10 to 15 minutes, giving their complete attention to the illuminated lightboard.
- High Return: Full month presence reaching thousands of local commuters.

PAYMENT & BOOKING TERMS:
- Advance payment before campaign launch.
- Bank: Federal Bank | A/c: 99980109403027 | Name: Janshad A.p | IFSC: FDRL0001706 | Branch: Marancherry.
- Office: MG Road, Kochi | Contact: 8593040417.

HOW TO TALK LIKE A REAL HUMAN:
- Sound 100% natural, warm, and conversational like an experienced, polite local marketing consultant.
- Say "autorickshaws", not just "autos".
- NEVER use emojis in responses. Write clean, natural text.
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
