require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const stream = require('stream');

/**
 * Transcribes audio using ElevenLabs STT API.
 * 
 * @param {Buffer} audioBuffer - The audio file buffer to transcribe.
 * @param {string} fileName - The original filename (optional).
 * @returns {Promise<{text: string}>} - The transcribed text.
 */
async function transcribeAudio(audioBuffer, fileName = 'audio.mp3') {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is missing from environment variables.');
  }

  if (!audioBuffer) {
    throw new Error('No audio buffer provided.');
  }

  try {
    const formData = new FormData();
    
    // We can append a buffer directly in form-data by providing filename and content-type
    formData.append('file', audioBuffer, {
      filename: fileName,
      contentType: 'audio/mpeg' // Adjust content type based on expected file if needed
    });
    
    // Default STT model from ElevenLabs
    formData.append('model_id', 'scribe_v1'); 

    const response = await axios.post(
      'https://api.elevenlabs.io/v1/speech-to-text',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      }
    );

    if (response.data && response.data.text) {
      return { text: response.data.text };
    } else {
      throw new Error('ElevenLabs API returned an empty or invalid transcription.');
    }
  } catch (error) {
    console.error('ElevenLabs STT Error:', error.response?.data || error.message);
    throw new Error('Failed to transcribe audio with ElevenLabs STT.');
  }
}

module.exports = {
  transcribeAudio
};
