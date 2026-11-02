require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { URL } = require('url');
const { transcribeAudio } = require('./src/services/elevenlabs-stt');
const { processUserAudio, processUserText } = require('./src/services/voice-pipeline');
const { processIncomingWhatsApp } = require('./src/services/whatsapp-handler');
const { db, bucket } = require('./src/services/firebase');
const axios = require('axios');

// --- In-Memory Cache for WhatsApp Webhook Deduplication ---
const processedMessages = new Set();
setInterval(() => {
  processedMessages.clear();
}, 60 * 60 * 1000); // Clear every hour
// --------------------------------------------------------

// --- In-Memory Queue for Sequential Processing per User ---
const userQueues = new Map();

async function processSequentially(phoneNumber, task) {
  if (!userQueues.has(phoneNumber)) {
    userQueues.set(phoneNumber, Promise.resolve());
  }
  
  const queue = userQueues.get(phoneNumber);
  const nextTask = queue.then(() => task()).catch(err => console.error(err));
  
  userQueues.set(phoneNumber, nextTask);
  
  nextTask.finally(() => {
    if (userQueues.get(phoneNumber) === nextTask) {
      userQueues.delete(phoneNumber);
    }
  });
}
// --------------------------------------------------------

const app = express();
const server = http.createServer(app);

// WebSocket server for browser voice endpoints
const wssBrowser = new WebSocket.Server({ noServer: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Plivo sends webhook data as URL encoded form data
app.use(express.static('public', {
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
}));
const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// Browser WebSocket Connection Logic (/ws/voice)
// ============================================
wssBrowser.on('connection', (ws) => {
  console.log('New Browser WebSocket connection established.');
  
  // Session object for this browser connection
  const session = { conversationHistory: [] };

  ws.on('message', async (message) => {
    try {
      // Check if message is a JSON text message from the web client
      let textPayload = null;
      try {
        const msgString = message.toString();
        if (msgString.startsWith('{') && msgString.endsWith('}')) {
          const parsed = JSON.parse(msgString);
          if (parsed.type === 'text' && parsed.text) {
            textPayload = parsed.text;
          }
        }
      } catch (e) {}

      if (textPayload) {
        console.log(`\n=== Browser WebSocket: Received text ("${textPayload}") ===`);
        const audioBuffer = await processUserText(
          textPayload,
          session,
          (answer) => {
            ws.send(JSON.stringify({ type: 'answer', text: answer }));
          }
        );

        if (audioBuffer) {
          ws.send(audioBuffer);
          console.log(`[Browser WS] Audio answer sent to client.`);
        }
        console.log(`=====================================================\n`);
        return;
      }

      console.log(`\n=== Browser WebSocket: Received audio (${message.length} bytes) ===`);
      
      const audioBuffer = await processUserAudio(
        message, 
        'audio.webm',
        session,
        (transcription) => {
          ws.send(JSON.stringify({ type: 'transcription', text: transcription }));
        },
        (answer) => {
          ws.send(JSON.stringify({ type: 'answer', text: answer }));
        }
      );

      if (audioBuffer) {
        ws.send(audioBuffer);
        console.log(`[Browser WS] Audio sent to client.`);
      }
      
      console.log(`=====================================================\n`);
    } catch (error) {
      console.error('WebSocket Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('Browser WebSocket connection closed.');
  });
});


// ============================================
// WhatsApp Webhook Endpoints
// ============================================

const adsRouter = require('./src/routes/ads');
const { getLeadDetails } = require('./src/services/meta-ads');

// Mount Meta Ads Integration API
app.use('/api/ads', adsRouter);

// Public Privacy Policy & Terms of Service for Meta Developer App Review
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head><title>Privacy Policy - OQULIX</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}h1{color:#111}h2{color:#333;margin-top:30px}</style></head>
<body>
<h1>Privacy Policy</h1>
<p>Last updated: November 2026</p>
<p>At OQULIX, we are committed to protecting your privacy. This Privacy Policy explains how our marketing and customer communication systems collect, use, and protect your information.</p>
<h2>1. Information We Collect</h2>
<p>When you contact us via WhatsApp or submit a form through our advertising campaigns, we collect: your name, contact phone number, and any inquiries regarding our products and services.</p>
<h2>2. How We Use Information</h2>
<p>We use the collected information solely to respond to your inquiries, provide customer support, and manage advertising campaigns authorized by you.</p>
<h2>3. Data Protection & Security</h2>
<p>We do not sell, rent, or trade your personal information with third parties. All communication data is stored securely in encrypted cloud infrastructure.</p>
<h2>4. Contact Us</h2>
<p>For any questions regarding this Privacy Policy or your personal data, please contact our administrative team at support@oqulix.com.</p>
</body>
</html>`);
});

app.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head><title>Terms of Service - OQULIX</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}h1{color:#111}</style></head>
<body>
<h1>Terms of Service</h1>
<p>By using our services and communicating through our platforms, you agree to comply with and be bound by standard terms of use.</p>
</body>
</html>`);
});

// 1. Webhook Verification (Meta WhatsApp & Leads requirement)
function verifyWebhook(req, res) {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || 'oqulix_secure_token';

  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verify_token) {
      console.log("[Meta Webhook] Webhook verified!");
      res.status(200).send(challenge);
    } else {
      console.warn(`[Meta Webhook] Token mismatch. Expected: ${verify_token}, Got: ${token}`);
      res.sendStatus(403);
    }
  } else {
    res.status(400).send("Invalid verification request");
  }
}

app.get('/webhook', verifyWebhook);
app.get('/api/whatsapp/webhook', verifyWebhook);

// Also alias /api/meta/webhook for Facebook Page / Leadgen subscriptions
app.get('/api/meta/webhook', (req, res) => {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || 'oqulix_secure_token';
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === verify_token) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

// 2. Receive Incoming WhatsApp Messages & Meta Leadgen Webhooks
async function handleMetaWebhook(req, res) {
  try {
    const body = req.body;
    console.log("=== INCOMING META WEBHOOK ===");
    console.log(JSON.stringify(body, null, 2));

    // A. Meta Lead Generation (Page leadgen change event)
    if (body.object === 'page') {
      if (body.entry && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.field === 'leadgen' && change.value) {
                const { leadgen_id, form_id, page_id, ad_id } = change.value;
                console.log(`[Meta LeadGen] Received new lead notification for lead ID: ${leadgen_id}`);

                // Process lead in background
                (async () => {
                  try {
                    const leadDetails = await getLeadDetails(leadgen_id);
                    if (leadDetails && leadDetails.field_data) {
                      let customerName = 'Lead Ad User';
                      let phoneNumber = '';
                      let email = '';
                      const extraFields = {};

                      leadDetails.field_data.forEach(field => {
                        const name = field.name.toLowerCase();
                        const val = field.values?.[0] || '';
                        if (name.includes('name') || name.includes('full_name')) customerName = val;
                        else if (name.includes('phone') || name.includes('mobile')) phoneNumber = val.replace(/\D/g, '');
                        else if (name.includes('email')) email = val;
                        else extraFields[field.name] = val;
                      });

                      if (phoneNumber) {
                        // Check deduplication
                        const existingSnap = await db.collection('leads')
                          .where('phone_number', '==', phoneNumber)
                          .limit(1)
                          .get();

                        if (existingSnap.empty) {
                          const newLeadRef = await db.collection('leads').add({
                            phone_number: phoneNumber,
                            customer_name: customerName,
                            email: email || null,
                            lead_status: 'HOT', // Lead ads represent direct intent
                            lead_score: 85,
                            source: 'META_LEAD_AD',
                            leadgen_id: leadgen_id,
                            form_id: form_id || leadDetails.form_id || null,
                            campaign_id: leadDetails.campaign_id || null,
                            campaign_name: leadDetails.campaign_name || null,
                            ad_id: ad_id || leadDetails.ad_id || null,
                            ad_name: leadDetails.ad_name || null,
                            requirements: JSON.stringify(extraFields),
                            human_needed: true,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                          });

                          // Add system conversation entry
                          await db.collection('conversations').add({
                            lead_id: newLeadRef.id,
                            sender: 'system',
                            message: `[Meta Lead Form Received] Ad: "${leadDetails.ad_name || 'Meta Ad'}" | Campaign: "${leadDetails.campaign_name || 'Campaign'}"`,
                            timestamp: new Date().toISOString()
                          });

                          console.log(`[Meta LeadGen] Stored new lead from form in CRM: ${newLeadRef.id}`);
                        } else {
                          console.log(`[Meta LeadGen] Lead with phone ${phoneNumber} already exists in CRM.`);
                        }
                      }
                    }
                  } catch (leadFetchErr) {
                    console.error('[Meta LeadGen] Error retrieving lead data from Graph API:', leadFetchErr.message);
                  }
                })();
              }
            }
          }
        }
      }
      return res.sendStatus(200);
    }

    // B. WhatsApp Cloud API event
    if (body.object === 'whatsapp_business_account' || body.entry) {
      if (Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          if (Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              const value = change.value;
              if (value && Array.isArray(value.messages)) {
                const contact = value.contacts?.[0] || {};
                const phoneNumber = contact.wa_id || value.messages[0].from;
                const customerName = contact.profile?.name || 'WhatsApp Customer';

                for (const msg of value.messages) {
                  if (msg.type === "text" || msg.type === "audio" || msg.type === "button" || msg.type === "interactive") {
                    const messageId = msg.id;

                    if (processedMessages.has(messageId)) {
                      console.log(`[WhatsApp] Ignoring duplicate message ID: ${messageId}`);
                      continue;
                    }
                    processedMessages.add(messageId);

                    console.log(`[WhatsApp Incoming] Message from ${phoneNumber} (${customerName}):`, msg.text?.body || msg.type);

                    // Process message sequentially per user
                    processSequentially(phoneNumber, () => 
                      processIncomingWhatsApp(phoneNumber, customerName, msg, messageId)
                    );
                  }
                }
              }
            }
          }
        }
      }
      return res.sendStatus(200);
    }

    res.sendStatus(404);
  } catch (error) {
    console.error("[Meta Webhook] Error:", error);
    res.sendStatus(500);
  }
}

app.post('/webhook', handleMetaWebhook);
app.post('/api/whatsapp/webhook', handleMetaWebhook);
app.post('/api/meta/webhook', handleMetaWebhook);

// ============================================
// Admin Dashboard API
// ============================================
app.get('/api/admin/leads', async (req, res) => {
  try {
    const snapshot = await db.collection('leads').orderBy('updated_at', 'desc').get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(data);
  } catch (error) {
    console.warn('[Admin] Failed with orderBy updated_at, trying unordered get:', error.message);
    try {
      const snap = await db.collection('leads').get();
      const fallbackData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fallbackData.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      return res.json(fallbackData);
    } catch (e2) {
      console.error('[Admin] Could not read leads from database:', e2.message);
      res.json([]);
    }
  }
});

app.get('/api/admin/leads/:id/conversations', async (req, res) => {
  try {
    const { id } = req.params;
    const snapshot = await db.collection('conversations')
      .where('lead_id', '==', id)
      .get();
      
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    data.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    res.json(data);
  } catch (error) {
    console.warn('[Admin] Could not read conversations from Firestore:', error.message);
    res.json([]);
  }
});

app.post('/api/admin/leads/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('leads').doc(id).update({
      unread_count: 0
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/leads/:id/conversations', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Fetch all conversations for this lead
    const snapshot = await db.collection('conversations')
      .where('lead_id', '==', id)
      .get();
      
    const batch = db.batch();
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const deletedRef = db.collection('deleted_messages').doc(docSnap.id);
      batch.set(deletedRef, { ...data, deleted_at: new Date().toISOString() });
      batch.delete(docSnap.ref);
    });

    await batch.commit();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/conversations/:msgId', async (req, res) => {
  try {
    const { msgId } = req.params;
    
    // 1. Fetch the message
    const msgDoc = await db.collection('conversations').doc(msgId).get();
    if (!msgDoc.exists) {
      return res.json({ success: true });
    }

    const msgData = msgDoc.data();

    // 2. Insert into deleted_messages and remove from conversations
    await db.collection('deleted_messages').doc(msgId).set({
      ...msgData,
      deleted_at: new Date().toISOString()
    });

    // Attempt to recall from WhatsApp if it's our own message AND recall was requested
    const shouldRecall = req.query.recall === 'true';
    if (shouldRecall && msgData.wamid && msgData.sender !== 'customer') {
      const { recallWhatsAppMessage } = require('./src/services/whatsapp-handler');
      await recallWhatsAppMessage(msgData.wamid);
    }

    // 3. Delete from conversations
    await db.collection('conversations').doc(msgId).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/leads/:id/takeover', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('leads').doc(id).update({
      human_needed: true,
      updated_at: new Date().toISOString()
    });
      
    // Also insert a system message to mark the exact pause time for the 10-minute logic
    await db.collection('conversations').add({
      lead_id: id,
      sender: 'system',
      message: 'AI_PAUSED',
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/leads/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('leads').doc(id).update({
      human_needed: false,
      updated_at: new Date().toISOString()
    });
      
    await db.collection('conversations').add({
      lead_id: id,
      sender: 'system',
      message: 'AI_RESUMED',
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const FormData = require('form-data');

app.post('/api/admin/bulk-send', upload.single('imageFile'), async (req, res) => {
  try {
    const { templateName, language, imageUrl, numbersRaw, variables, messageText } = req.body;
    let numbers;
    try {
      numbers = JSON.parse(numbersRaw);
    } catch(e) {
      numbers = numbersRaw.split(',').map(n => n.trim());
    }

    if (!templateName || !numbers || !Array.isArray(numbers)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
    const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    
    let mediaId = null;

    if (req.file) {
      const form = new FormData();
      form.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
      form.append('messaging_product', 'whatsapp');
      form.append('type', req.file.mimetype);

      try {
        const mediaRes = await axios.post(
          `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/media`,
          form,
          { headers: { ...form.getHeaders(), Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
        );
        mediaId = mediaRes.data.id;
      } catch (err) {
        console.error('Failed to upload media to Meta:', err.response?.data || err.message);
        return res.status(400).json({ error: 'Failed to upload image to Meta: ' + (err.response?.data?.error?.message || err.message) });
      }
    }

    let successCount = 0;
    let failCount = 0;
    let lastError = "";

    for (const num of numbers) {
      try {
        const payload = {
          messaging_product: "whatsapp",
          to: num,
          type: "template",
          template: {
            name: templateName,
            language: { code: language || 'en' }
          }
        };

        if (mediaId) {
          payload.template.components = [
            {
              type: "header",
              parameters: [{ type: "image", image: { id: mediaId } }]
            }
          ];
        } else if (imageUrl) {
          payload.template.components = [
            {
              type: "header",
              parameters: [{ type: "image", image: { link: imageUrl } }]
            }
          ];
        }
        
        if (variables) {
          if (!payload.template.components) {
            payload.template.components = [];
          }
          const bodyParams = variables.split(',').map(v => ({
            type: "text",
            text: v.trim()
          }));
          payload.template.components.push({
            type: "body",
            parameters: bodyParams
          });
        }
        
        const response = await axios.post(
          `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
          payload,
          { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        successCount++;

        // --- NEW: Automatically create lead and conversation on bulk send ---
        try {
          const wamid = response.data?.messages?.[0]?.id;
          const leadQuery = await db.collection('leads').where('phone_number', '==', num).limit(1).get();
          
          let leadId;
          if (leadQuery.empty) {
            const newLeadRef = await db.collection('leads').add({
              phone_number: num,
              customer_name: 'Broadcast Recipient',
              lead_status: 'BROADCAST',
              has_received_broadcast: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            leadId = newLeadRef.id;
          } else {
            const leadDoc = leadQuery.docs[0];
            leadId = leadDoc.id;
            // Update existing lead to mark them as a broadcast recipient
            await leadDoc.ref.update({
              has_received_broadcast: true,
              updated_at: new Date().toISOString()
            });
          }

          if (leadId) {
            let msgText = messageText || `[Broadcast] Template: ${templateName}`;
            if (!messageText && variables) msgText += ` | Variables: ${variables}`;
             
            await db.collection('conversations').add({
              lead_id: leadId,
              sender: 'ai', // 'ai' instead of 'admin' so it doesn't pause the AI logic
              message: msgText,
              wamid: wamid || null,
              timestamp: new Date().toISOString()
            });
          }
        } catch (dbErr) {
          console.error("Failed to save broadcast to DB:", dbErr);
        }
        // -------------------------------------------------------------------
      } catch (err) {
        const metaError = err.response?.data?.error?.message || err.message;
        console.error(`[Bulk Send] Failed for ${num}:`, metaError);
        lastError = metaError;
        failCount++;
      }
    }

    res.json({ success: true, successCount, failCount, lastError });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/leads/:id/message', async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    // Get lead phone number
    const leadDoc = await db.collection('leads').doc(id).get();
    if (!leadDoc.exists) throw new Error("Lead not found");
    const lead = leadDoc.data();

    // Send via WhatsApp
    const { sendWhatsAppMessage } = require('./src/services/whatsapp-handler');
    const wamid = await sendWhatsAppMessage(lead.phone_number, text);

    // Save to conversation history as admin
    const newMsgRef = await db.collection('conversations').add({
      lead_id: id,
      sender: 'admin',
      message: text,
      wamid: wamid || null,
      timestamp: new Date().toISOString()
    });
    
    // Ensure human_needed is true
    await db.collection('leads').doc(id).update({
      human_needed: true,
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, id: newMsgRef.id });
  } catch (error) {
    console.error("Admin message error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/leads/:id/media', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'image', 'video', 'audio', 'document'
    const file = req.file;
    
    if (!file) throw new Error("No file provided");

    // Get lead phone number
    const leadDoc = await db.collection('leads').doc(id).get();
    if (!leadDoc.exists) throw new Error("Lead not found");
    const lead = leadDoc.data();

    // Upload to Firebase Storage
    const ext = path.extname(file.originalname) || '';
    const filename = `whatsapp_media/admin-${Date.now()}-${id}${ext}`;
    const fileUpload = bucket.file(filename);

    await fileUpload.save(file.buffer, {
      contentType: file.mimetype,
      public: true,
      metadata: {
        firebaseStorageDownloadTokens: Date.now()
      }
    });

    let publicUrl;
    try {
      await fileUpload.makePublic();
      publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    } catch (e) {
      publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media`;
    }

    // Send via WhatsApp
    const { sendWhatsAppMedia } = require('./src/services/whatsapp-handler');
    const wamid = await sendWhatsAppMedia(lead.phone_number, type, publicUrl);

    // Save to conversation history as admin
    const textLabel = `[${type.charAt(0).toUpperCase() + type.slice(1)}] ${publicUrl}`;
    const newMsgRef = await db.collection('conversations').add({
      lead_id: id,
      sender: 'admin',
      message: textLabel,
      wamid: wamid || null,
      timestamp: new Date().toISOString()
    });
    
    // Ensure human_needed is true
    await db.collection('leads').doc(id).update({
      human_needed: true,
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, url: publicUrl, id: newMsgRef.id });
  } catch (error) {
    console.error("Admin media error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WebSocket Routing
// ============================================
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws/voice') {
    wssBrowser.handleUpgrade(request, socket, head, (ws) => {
      wssBrowser.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});


app.post('/api/test-ai', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Missing 'question' in request body." });
  }

  try {
    console.log(`\n--- New Request ---`);
    console.log(`Question: "${question}"`);

    // 1. Search Oqulix Knowledge base
    console.log(`Searching knowledge base...`);
    const context = await searchOqulixKnowledge(question);
    
    if (context) {
      console.log(`Context found (length: ${context.length} chars).`);
    } else {
      console.log(`No relevant context found.`);
    }

    // 2. Generate answer using Gemini
    console.log(`Generating answer with Gemini...`);
    const answer = await generateOqulixAnswer(question, context);

    console.log(`Answer: "${answer}"`);
    console.log(`-------------------\n`);

    res.json({ answer });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post('/api/test-stt', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided. Please upload an 'audio' file." });
  }

  try {
    console.log(`\n--- New STT Request ---`);
    console.log(`File: ${req.file.originalname} (${req.file.size} bytes)`);

    // 1. Transcribe Audio
    console.log(`Transcribing audio with ElevenLabs...`);
    const sttResult = await transcribeAudio(req.file.buffer, req.file.originalname);
    const transcription = sttResult.text;
    console.log(`Transcription: "${transcription}"`);

    if (!transcription || transcription.trim() === '') {
      return res.status(400).json({ error: "Transcription resulted in empty text." });
    }

    // 2. Search RAG
    console.log(`Searching knowledge base...`);
    const context = await searchOqulixKnowledge(transcription);

    // 3. Generate Answer
    console.log(`Generating answer with Gemini...`);
    const answer = await generateOqulixAnswer(transcription, context);

    console.log(`Answer: "${answer}"`);
    console.log(`-----------------------\n`);

    res.json({
      transcription,
      answer
    });
  } catch (error) {
    console.error("Error processing STT request:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

app.post('/api/test-tts', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing 'text' in request body." });
  }

  try {
    console.log(`\n--- New TTS Request ---`);
    console.log(`Generating audio for: "${text}"`);
    const audioBuffer = await textToSpeech(text);
    
    // Save locally for testing
    const filePath = path.join(__dirname, 'temp-tts.mp3');
    fs.writeFileSync(filePath, audioBuffer);
    console.log(`Audio saved to ${filePath}`);
    console.log(`-----------------------\n`);

    res.json({ success: true, file: filePath });
  } catch (error) {
    console.error("Error processing TTS request:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

app.post('/api/test-voice', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided. Please upload an 'audio' file." });
  }

  try {
    console.log(`\n=== New Complete Voice Pipeline Request ===`);
    console.log(`File: ${req.file.originalname} (${req.file.size} bytes)`);

    // 1. ElevenLabs STT
    console.log(`[1] Transcribing audio with ElevenLabs...`);
    const sttResult = await transcribeAudio(req.file.buffer, req.file.originalname);
    const transcription = sttResult.text;
    console.log(`Transcription: "${transcription}"`);

    if (!transcription || transcription.trim() === '') {
      return res.status(400).json({ error: "Transcription resulted in empty text." });
    }

    // 2. RAG
    console.log(`[2] Searching knowledge base...`);
    const context = await searchOqulixKnowledge(transcription);

    // 3. Gemini
    console.log(`[3] Generating answer with Gemini...`);
    const answer = await generateOqulixAnswer(transcription, context);
    console.log(`Answer: "${answer}"`);

    // 4. Google TTS
    console.log(`[4] Converting answer to speech with Google TTS...`);
    const audioBuffer = await textToSpeech(answer);
    
    const filePath = path.join(__dirname, 'response-voice.mp3');
    fs.writeFileSync(filePath, audioBuffer);
    console.log(`Generated audio saved to ${filePath}`);
    console.log(`===========================================\n`);

    res.json({
      transcription,
      answer,
      contextUsed: !!context, // simple boolean to know if context was found
      audioFile: filePath
    });
  } catch (error) {
    console.error("Error processing complete voice pipeline request:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
