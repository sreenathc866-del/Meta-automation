const { searchOqulixKnowledge } = require('../rag/search');
const { generateOqulixAnswer } = require('../ai/gemini');
const { transcribeAudio } = require('./elevenlabs-stt');
const { textToSpeech } = require('./google-tts');

/**
 * Processes user audio through the entire AI pipeline.
 * @param {Buffer} audioBuffer - The raw audio buffer from the user.
 * @param {string} fileName - The filename to tell ElevenLabs what format this is (e.g., audio.webm or audio.wav).
 * @param {Object} session - The session object for the caller/websocket.
 * @param {Array} session.conversationHistory - The conversation history array.
 * @param {Function} [onTranscription] - Optional callback when transcription is ready.
 * @param {Function} [onAnswer] - Optional callback when text answer is ready.
 * @returns {Buffer|null} - The generated audio buffer response, or null if no transcription.
 */
async function processUserAudio(audioBuffer, fileName, session, onTranscription, onAnswer) {
  try {
    // 1. STT
    console.log(`[Pipeline] Transcribing audio...`);
    const sttResult = await transcribeAudio(audioBuffer, fileName);
    const transcription = sttResult.text;
    console.log(`[Pipeline] Transcription: "${transcription}"`);

    if (!transcription || transcription.trim() === '') {
      console.log(`[Pipeline] Empty transcription, ignoring.`);
      return null;
    }

    if (onTranscription) {
      onTranscription(transcription);
    }

    // 2. RAG
    console.log(`[Pipeline] Searching knowledge base...`);
    const context = await searchOqulixKnowledge(transcription);

    // 3. Gemini
    console.log(`[Pipeline] Generating answer with Gemini...`);
    if (!session.conversationHistory) session.conversationHistory = [];
    
    const answer = await generateOqulixAnswer(transcription, context, session.conversationHistory);
    console.log(`[Pipeline] Answer: "${answer}"`);

    // Update history
    session.conversationHistory.push({ role: 'user', text: transcription });
    session.conversationHistory.push({ role: 'model', text: answer });

    if (onAnswer) {
      onAnswer(answer);
    }

    // 4. TTS
    console.log(`[Pipeline] Converting answer to speech...`);
    const audioResponseBuffer = await textToSpeech(answer);
    console.log(`[Pipeline] Audio generation complete.`);

    return audioResponseBuffer;
  } catch (error) {
    console.error('[Pipeline] Error processing audio:', error);
    throw error;
  }
}

/**
 * Processes user text input through RAG, Gemini, and TTS.
 * @param {string} text - The user's text message.
 * @param {Object} session - The session object.
 * @param {Function} [onAnswer] - Optional callback when text answer is ready.
 * @returns {Buffer|null} - The generated audio buffer response.
 */
async function processUserText(text, session, onAnswer) {
  try {
    console.log(`[Pipeline] Processing text message: "${text}"`);
    if (!session.conversationHistory) session.conversationHistory = [];

    // 1. RAG Search
    const context = await searchOqulixKnowledge(text);

    // 2. Gemini
    const answer = await generateOqulixAnswer(text, context, session.conversationHistory);

    // Update history
    session.conversationHistory.push({ role: 'user', text: text });
    session.conversationHistory.push({ role: 'model', text: answer });

    if (onAnswer) {
      onAnswer(answer);
    }

    // 3. TTS
    const audioResponseBuffer = await textToSpeech(answer);
    return audioResponseBuffer;
  } catch (error) {
    console.error('[Pipeline] Error processing text:', error);
    throw error;
  }
}

module.exports = {
  processUserAudio,
  processUserText
};
