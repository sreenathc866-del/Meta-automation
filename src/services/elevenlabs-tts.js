require('dotenv').config();
const axios = require('axios');

/**
 * Converts text to speech using ElevenLabs API.
 * 
 * @param {string} text - The text to synthesize.
 * @returns {Promise<Buffer>} - The generated audio buffer.
 */
async function textToSpeech(text) {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is missing from environment variables.');
  }
  
  if (!text || text.trim() === '') {
    throw new Error('Text is empty.');
  }

  // Default to Rachel if no voice ID is provided
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; 

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: text,
        model_id: "eleven_turbo_v2_5", // Fast and good for conversational AI
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    return Buffer.from(response.data);
  } catch (error) {
    console.error('ElevenLabs TTS Error:', error.response?.data?.toString() || error.message);
    throw new Error('Failed to generate audio with ElevenLabs TTS.');
  }
}

module.exports = {
  textToSpeech
};
