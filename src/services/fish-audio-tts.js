require('dotenv').config();
const axios = require('axios');

/**
 * Converts text to speech using Fish Audio API.
 * 
 * @param {string} text - The text to synthesize.
 * @returns {Promise<Buffer>} - The generated audio buffer.
 */
async function textToSpeech(text) {
  if (!process.env.FISH_AUDIO_API_KEY) {
    throw new Error('FISH_AUDIO_API_KEY is missing from environment variables.');
  }
  if (!process.env.FISH_AUDIO_VOICE_ID) {
    throw new Error('FISH_AUDIO_VOICE_ID is missing from environment variables.');
  }
  if (!text || text.trim() === '') {
    throw new Error('Text is empty.');
  }

  try {
    const response = await axios.post(
      'https://api.fish.audio/v1/tts',
      {
        text: text,
        reference_id: process.env.FISH_AUDIO_VOICE_ID,
        format: "mp3",
        mp3_bitrate: 64, // Reduce bitrate for phone calls
        latency: "normal"
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FISH_AUDIO_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer' // Request binary audio response
      }
    );

    return Buffer.from(response.data);
  } catch (error) {
    console.error('Fish Audio TTS Error:', error.response?.data?.toString() || error.message);
    throw new Error('Failed to generate audio with Fish Audio TTS.');
  }
}

module.exports = {
  textToSpeech
};
