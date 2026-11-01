const googleTTS = require('google-tts-api');
const axios = require('axios');

/**
 * Converts text to speech using Google Translate TTS API (Free).
 * 
 * @param {string} text - The text to synthesize.
 * @returns {Promise<Buffer>} - The generated audio buffer.
 */
async function textToSpeech(text) {
  if (!text || text.trim() === '') {
    throw new Error('Text is empty.');
  }

  try {
    // google-tts-api handles text > 200 chars by splitting it
    const audioData = await googleTTS.getAllAudioBase64(text, {
      lang: 'en',
      slow: false,
      host: 'https://translate.google.com',
      splitPunct: ',.?',
    });

    // Combine all base64 chunks into a single Buffer
    const buffers = audioData.map(chunk => Buffer.from(chunk.base64, 'base64'));
    return Buffer.concat(buffers);
  } catch (error) {
    console.error('Google TTS Error:', error.message);
    throw new Error('Failed to generate audio with Google TTS.');
  }
}

module.exports = {
  textToSpeech
};
