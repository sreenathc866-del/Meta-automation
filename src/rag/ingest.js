require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { db } = require('../services/firebase');

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-2';

async function ingestKnowledge() {
  console.log('Starting ingestion into Firebase Firestore...');
  const knowledgePath = path.join(__dirname, '../../data/oqulix/knowledge.md');
  
  if (!fs.existsSync(knowledgePath)) {
    console.error('Knowledge file not found at', knowledgePath);
    return;
  }

  const content = fs.readFileSync(knowledgePath, 'utf8');
  
  // Split content by '\n# ' to get major sections
  const chunks = content.split('\n# ').filter(chunk => chunk.trim() !== '');
  
  let totalInserted = 0;

  for (let i = 0; i < chunks.length; i++) {
    // Re-add '# ' to all chunks except the first one (which might be '# OQULIX...')
    const chunkContent = (i === 0 || chunks[i].startsWith('#')) ? chunks[i].trim() : '# ' + chunks[i].trim();
    
    // Extract category (the heading text)
    const lines = chunkContent.split('\n');
    let category = 'General';
    if (lines[0].startsWith('## ')) {
      category = lines[0].replace('## ', '').trim();
    } else if (lines[0].startsWith('# ')) {
      category = lines[0].replace('# ', '').trim();
    }

    try {
      console.log(`Processing chunk: ${category}`);
      
      // Check if chunk already exists in Firestore to prevent duplication
      const existingSnap = await db.collection('documents')
        .where('category', '==', category)
        .where('source', '==', 'knowledge.md')
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        console.log(`Chunk '${category}' already exists. Skipping.`);
        continue;
      }

      // Generate embedding
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: chunkContent,
      });
      
      const embedding = response.embeddings[0].values;

      // Insert into Firestore
      await db.collection('documents').add({
        content: chunkContent,
        source: 'knowledge.md',
        category: category,
        embedding: embedding,
        metadata: { ingestedAt: new Date().toISOString() }
      });

      console.log(`Inserted chunk '${category}' successfully.`);
      totalInserted++;
      
      // Slight delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`Failed to process chunk '${category}':`, err);
    }
  }
  
  console.log(`Ingestion complete! Inserted ${totalInserted} new chunks.`);
}

if (require.main === module) {
  ingestKnowledge();
}

module.exports = { ingestKnowledge };
