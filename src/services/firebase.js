// Firebase configuration and initialization
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');
const fs = require('fs');

const projectId = process.env.FIREBASE_PROJECT_ID || 'meta-automation-66cb3';
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 'meta-automation-66cb3.firebasestorage.app';

let db;
let bucket;

if (getApps().length === 0) {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
    ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : path.resolve(process.cwd(), 'serviceAccountKey.json');

  let hasValidCredentials = false;
  if (fs.existsSync(serviceAccountPath)) {
    console.log(`[Firebase] Initializing with service account key: ${serviceAccountPath}`);
    const serviceAccount = require(serviceAccountPath);
    initializeApp({
      credential: cert(serviceAccount),
      projectId: projectId,
      storageBucket: storageBucket
    });
    hasValidCredentials = true;
  } else {
    console.warn(`[Firebase] Warning: ${serviceAccountPath} not found. Running in fallback mode without crashing.`);
  }

  // Helper for in-memory leads/campaigns fallback
  if (hasValidCredentials) {
    db = getFirestore();
    bucket = getStorage().bucket();
  } else {
    // Persistent local file storage fallback (ensures data survives server restarts)
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const getCollectionFile = (colName) => path.join(dataDir, `${colName}.json`);

    const readCollection = (colName) => {
      try {
        const file = getCollectionFile(colName);
        if (!fs.existsSync(file)) return [];
        const raw = fs.readFileSync(file, 'utf8');
        return JSON.parse(raw || '[]');
      } catch (e) {
        return [];
      }
    };

    const writeCollection = (colName, items) => {
      try {
        const file = getCollectionFile(colName);
        fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf8');
      } catch (e) {
        console.error(`[Local DB] Error writing ${colName}:`, e.message);
      }
    };

    const createCollectionRef = (colName) => ({
      where: (field, op, val) => ({
        ...createCollectionRef(colName),
        get: async () => {
          const items = readCollection(colName);
          const filtered = items.filter(item => {
            if (op === '==') return item[field] === val;
            return true;
          });
          return {
            empty: filtered.length === 0,
            size: filtered.length,
            docs: filtered.map(item => ({
              id: item.id,
              data: () => item
            }))
          };
        }
      }),
      orderBy: () => createCollectionRef(colName),
      limit: () => createCollectionRef(colName),
      get: async () => {
        const items = readCollection(colName);
        return {
          empty: items.length === 0,
          size: items.length,
          docs: items.map(item => ({
            id: item.id,
            data: () => item
          }))
        };
      },
      add: async (data) => {
        const id = 'camp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const item = { id, ...data };
        const items = readCollection(colName);
        items.unshift(item);
        writeCollection(colName, items);
        return { id };
      },
      doc: (docId) => ({
        get: async () => {
          const items = readCollection(colName);
          const found = items.find(i => i.id === docId);
          return {
            exists: !!found,
            id: docId,
            data: () => found || {}
          };
        },
        update: async (updates) => {
          const items = readCollection(colName);
          const idx = items.findIndex(i => i.id === docId);
          if (idx !== -1) {
            items[idx] = { ...items[idx], ...updates };
            writeCollection(colName, items);
          }
        },
        delete: async () => {
          const items = readCollection(colName);
          writeCollection(colName, items.filter(i => i.id !== docId));
        }
      })
    });

    db = {
      collection: (name) => createCollectionRef(name)
    };
    bucket = {
      name: storageBucket,
      file: (filename) => ({
        save: async () => {},
        makePublic: async () => {}
      })
    };
  }
}

module.exports = {
  db,
  bucket,
  projectId,
  storageBucket
};
