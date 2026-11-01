require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { db } = require('../services/firebase');

const fs = require('fs');
const path = require('path');

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-2';

// Read local knowledge file on demand so updates reflect immediately
function getLocalKnowledge() {
  const knowledgePath = path.join(__dirname, '../../data/oqulix/knowledge.md');
  if (fs.existsSync(knowledgePath)) {
    return fs.readFileSync(knowledgePath, 'utf8');
  }
  return '';
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Searches the knowledge base for relevant Oqulix information.
 * Uses Firestore document embeddings with cosine similarity,
 * and falls back to local data/oqulix/knowledge.md if not populated or on error.
 * @param {string} question - The user's question
 * @returns {Promise<string>} - The concatenated relevant context
 */
async function searchOqulixKnowledge(question) {
  try {
    const docsSnap = await db.collection('documents').get();
    if (!docsSnap.empty) {
      // 1. Create embedding for the question
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: question,
      });
      const queryEmbedding = response.embeddings[0].values;

      const scoredDocs = [];
      docsSnap.forEach(doc => {
        const data = doc.data();
        if (data.embedding && Array.isArray(data.embedding)) {
          const score = cosineSimilarity(queryEmbedding, data.embedding);
          if (score >= 0.30) {
            scoredDocs.push({ content: data.content, score });
          }
        }
      });

      scoredDocs.sort((a, b) => b.score - a.score);
      const topDocs = scoredDocs.slice(0, 3);

      if (topDocs.length > 0) {
        return topDocs.map(doc => doc.content).join('\n\n---\n\n');
      }
    }
  } catch (err) {
    console.error('Vector search error, falling back to local knowledge:', err.message);
  }

  // Fallback to local knowledge base file
  console.log('[RAG] Using local knowledge.md context fallback.');
  return getLocalKnowledge();
}

module.exports = {
  searchOqulixKnowledge
};
