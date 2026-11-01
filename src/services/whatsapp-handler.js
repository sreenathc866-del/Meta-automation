const { db, bucket } = require('./firebase');
const { searchOqulixKnowledge } = require('../rag/search');
const { generateWhatsAppResponse } = require('../ai/whatsapp-gemini');
const axios = require('axios');

// You can use axios to send messages back to WhatsApp API
// const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
// const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

/**
 * Sends a message back to the customer via WhatsApp Cloud API
 */
async function sendWhatsAppMessage(to, text) {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;

  console.log(`[WhatsApp] Sending message to ${to}: "${text}"`);
  
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn('[WhatsApp] Warning: WHATSAPP_TOKEN or WHATSAPP_PHONE_ID missing in .env. Add them to send live outbound messages to WhatsApp customers.');
    return;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const wamid = response.data?.messages?.[0]?.id;
    console.log('[WhatsApp] Outbound message sent successfully! Response ID:', wamid);
    return wamid;
  } catch (error) {
    console.error('[WhatsApp] Failed to send message:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Sends media back to the customer via WhatsApp Cloud API
 * type can be 'image', 'video', 'audio', 'document'
 */
async function sendWhatsAppMedia(to, type, mediaUrl) {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;

  console.log(`[WhatsApp] Sending ${type} to ${to}: ${mediaUrl}`);
  
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn('[WhatsApp] Warning: WHATSAPP_TOKEN or WHATSAPP_PHONE_ID missing.');
    return;
  }

  try {
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: type,
    };
    payload[type] = { link: mediaUrl };

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const wamid = response.data?.messages?.[0]?.id;
    console.log(`[WhatsApp] Outbound ${type} sent successfully! Response ID:`, wamid);
    return wamid;
  } catch (error) {
    console.error(`[WhatsApp] Failed to send ${type}:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Recalls (deletes for everyone) a message sent by the business.
 */
async function recallWhatsAppMessage(wamid) {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID || !wamid) return false;

  try {
    console.log(`[WhatsApp] Recalling message ID: ${wamid}`);
    await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        status: "inactive",
        message_id: wamid
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`[WhatsApp] Successfully recalled message ID: ${wamid}`);
    return true;
  } catch (error) {
    console.error(`[WhatsApp] Failed to recall message:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Sends a read receipt (blue ticks) back to WhatsApp Cloud API
 */
async function markMessageAsRead(messageId) {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID || !messageId) return;

  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('[WhatsApp] Failed to mark as read:', error.response?.data || error.message);
  }
}

/**
 * Download WhatsApp Media and upload to Firebase Storage
 */
async function downloadWhatsAppMedia(mediaId) {
  const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  try {
    const res = await axios.get(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    });
    const mediaUrl = res.data.url;
    let mimeType = res.data.mime_type || 'audio/ogg';
    // Clean mimeType for AI model (strip codecs parameter if present, e.g. "audio/ogg; codecs=opus" -> "audio/ogg")
    const cleanMimeType = mimeType.split(';')[0].trim();
    
    const mediaRes = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    });
    
    const audioBuffer = Buffer.from(mediaRes.data);
    const base64Audio = audioBuffer.toString('base64');

    // Attempt Firebase Storage upload in background or try/catch so storage failure never breaks AI understanding
    let publicUrl = null;
    try {
      const ext = cleanMimeType.split('/')[1] || 'ogg';
      const filename = `whatsapp_media/${Date.now()}-${mediaId}.${ext}`;
      const fileUpload = bucket.file(filename);

      await fileUpload.save(audioBuffer, {
        contentType: cleanMimeType,
        public: true,
        metadata: {
          firebaseStorageDownloadTokens: Date.now()
        }
      });

      try {
        await fileUpload.makePublic();
        publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
      } catch (e) {
        publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media`;
      }
    } catch (storageErr) {
      console.warn("[WhatsApp] Firebase storage upload skipped or failed (audio buffer preserved for AI):", storageErr.message);
    }
    
    return { 
      publicUrl: publicUrl || "", 
      mimeType: cleanMimeType, 
      base64: base64Audio 
    };
  } catch (error) {
    console.error("[WhatsApp] Failed to download media from Meta:", error.message);
    return null;
  }
}

/**
 * Process an incoming WhatsApp message.
 */
async function processIncomingWhatsApp(phoneNumber, customerName, msgObject, messageId) {
  let incomingMessage = "";
  let audioData = null;
  
  if (msgObject.type === 'text') {
    incomingMessage = msgObject.text.body;
  } else if (msgObject.type === 'button') {
    incomingMessage = msgObject.button.text;
  } else if (msgObject.type === 'interactive') {
    if (msgObject.interactive.type === 'button_reply') {
        incomingMessage = msgObject.interactive.button_reply.title;
    } else if (msgObject.interactive.type === 'list_reply') {
        incomingMessage = msgObject.interactive.list_reply.title;
    } else {
        incomingMessage = "[Interactive Message]";
    }
  } else if (msgObject.type === 'audio') {
    console.log(`[WhatsApp] Downloading audio message...`);
    const media = await downloadWhatsAppMedia(msgObject.audio.id);
    if (media) {
      incomingMessage = `[Voice Message] ${media.publicUrl}`;
      audioData = media;
    } else {
      incomingMessage = "[Voice Message - Failed to download]";
    }
  }

  let referralData = null;
  if (msgObject.referral) {
    // Click-to-WhatsApp Ads attribution payload from Meta
    referralData = {
      source_type: msgObject.referral.source_type, // 'ad'
      source_id: msgObject.referral.source_id,     // Meta Ad ID
      source_url: msgObject.referral.source_url,   // Ad URL
      headline: msgObject.referral.headline,       // Ad Headline
      body: msgObject.referral.body,               // Ad Body
      media_type: msgObject.referral.media_type
    };
    console.log(`[WhatsApp CTWA] Incoming message initiated from Meta Ad:`, referralData);
  }

  let lead = null;
  let formattedHistory = [];

  // 1. Try finding or creating lead in Firestore (with fallback if database is offline)
  try {
    const leadsRef = db.collection('leads');
    const existingLeadSnap = await leadsRef.where('phone_number', '==', phoneNumber).limit(1).get();

    if (existingLeadSnap.empty) {
      const newLeadData = {
        phone_number: phoneNumber,
        customer_name: customerName || 'Unknown User',
        lead_status: referralData ? 'WARM' : 'UNQUALIFIED',
        source: referralData ? 'META_CTWA_AD' : 'ORGANIC_WHATSAPP',
        ad_id: referralData ? referralData.source_id : null,
        ad_headline: referralData ? referralData.headline : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const newLeadRef = await leadsRef.add(newLeadData);
      lead = { id: newLeadRef.id, ...newLeadData };
      console.log(`[WhatsApp] Created new lead: ${lead.id}`);
    } else {
      const leadDoc = existingLeadSnap.docs[0];
      lead = { id: leadDoc.id, ...leadDoc.data() };
      console.log(`[WhatsApp] Found existing lead: ${lead.id} (${lead.lead_status})`);

      if (referralData && !lead.ad_id) {
        await leadDoc.ref.update({
          ad_id: referralData.source_id,
          ad_headline: referralData.headline,
          source: 'META_CTWA_AD',
          updated_at: new Date().toISOString()
        });
      }
    }

    // Check human handoff and pause logic
    if (lead && lead.human_needed && lead.assigned_agent) {
      console.log(`[WhatsApp] Human agent is explicitly assigned. AI skipping automatic response.`);
      await db.collection('conversations').add({
        lead_id: lead.id,
        sender: 'customer',
        message: incomingMessage,
        timestamp: new Date().toISOString()
      }).catch(() => {});
      return;
    }

    // Save incoming message
    if (lead) {
      try {
        await db.collection('conversations').add({
          lead_id: lead.id,
          sender: 'customer',
          message: incomingMessage,
          timestamp: new Date().toISOString()
        });
      } catch (insertErr) {
        console.error('[WhatsApp] Failed to save customer message:', insertErr);
      }

      // Update lead with unread counter, last message preview, and latest timestamp
      try {
        const leadDocRef = db.collection('leads').doc(lead.id);
        const currentUnread = Number(lead.unread_count || 0);
        const leadUpdates = {
          unread_count: currentUnread + 1,
          last_message: incomingMessage.startsWith('[Voice Message]') ? '🎤 Voice Note' : (incomingMessage.length > 50 ? incomingMessage.substring(0, 50) + '...' : incomingMessage),
          last_message_sender: 'customer',
          updated_at: new Date().toISOString()
        };
        if (lead.lead_status === 'BROADCAST') {
          leadUpdates.lead_status = 'UNQUALIFIED';
          lead.lead_status = 'UNQUALIFIED';
        }
        await leadDocRef.update(leadUpdates);
        lead.unread_count = currentUnread + 1;
      } catch (leadUpErr) {
        console.error('[WhatsApp] Failed to update lead unread status:', leadUpErr);
      }

      // Fetch history (get latest 10 messages) without requiring a composite index in Firestore
      let chronologicalHistory = [];
      try {
        const historySnap = await db.collection('conversations')
          .where('lead_id', '==', lead.id)
          .get();
        if (!historySnap.empty) {
          const allMsgs = historySnap.docs.map(doc => doc.data());
          allMsgs.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
          chronologicalHistory = allMsgs.slice(-10);
        }
      } catch (convErr) {
        console.warn('[WhatsApp] Failed to fetch conversation history:', convErr.message);
      }

      if (chronologicalHistory.length > 0) {
        
        // Anti-spam / deduplication: if the user sends the exact same message back-to-back within 5 minutes, ignore it.
        const userMessagesOnly = chronologicalHistory.filter(r => r.sender === 'customer');
        if (userMessagesOnly.length >= 2) {
          const currentMsgObj = userMessagesOnly[userMessagesOnly.length - 1];
          const prevMsgObj = userMessagesOnly[userMessagesOnly.length - 2];
          
          const currentMsg = currentMsgObj.message.trim().toLowerCase();
          const prevMsg = prevMsgObj.message.trim().toLowerCase();
          
          if (currentMsg === prevMsg) {
            const timeDiff = new Date(currentMsgObj.timestamp) - new Date(prevMsgObj.timestamp);
            const fiveMinutes = 5 * 60 * 1000;
            
            if (timeDiff < fiveMinutes) {
              console.log(`[WhatsApp] Ignoring consecutive duplicate message from user within 5 mins: "${currentMsg}"`);
              return; // Skip generating an AI response to prevent repeating the bot
            }
          }
        }

        // --- NEW: 10-Minute AI Pause Logic ---
        // Find the last admin interaction (admin message, 'AI_PAUSED', or 'AI_RESUMED')
        const humanInterventions = chronologicalHistory.filter(r => 
          r.sender === 'admin' || (r.sender === 'system' && (r.message === 'AI_PAUSED' || r.message === 'AI_RESUMED'))
        );
        let aiIsPaused = false;
        
        if (humanInterventions.length > 0) {
          const lastIntervention = humanInterventions[humanInterventions.length - 1];
          if (lastIntervention.message !== 'AI_RESUMED') {
            const timeSinceIntervention = new Date() - new Date(lastIntervention.timestamp);
            const tenMinutes = 10 * 60 * 1000;
            
            if (timeSinceIntervention < tenMinutes) {
              aiIsPaused = true;
              console.log(`[WhatsApp] AI is PAUSED. Human agent was active ${Math.round(timeSinceIntervention/1000)} seconds ago. Skipping response.`);
            }
          } else {
            console.log(`[WhatsApp] AI was manually RESUMED. Responding normally.`);
          }
        }
        
        if (aiIsPaused) {
           return; // Stop here, do not generate AI response
        }

        formattedHistory = chronologicalHistory.slice(0, -1).map(row => ({
          role: row.sender === 'customer' ? 'user' : 'model',
          text: row.message
        }));
      }
    }
  } catch (dbErr) {
    console.error('[WhatsApp] Firebase DB Error:', dbErr);
    console.warn('[WhatsApp] Proceeding with AI response using local knowledge base.');
  }

  if (messageId) {
    await markMessageAsRead(messageId);
  }

  const cleanMessage = incomingMessage.trim().toLowerCase();
  const isGreeting = /^(hello|hi|hey|good morning|good afternoon|good evening|good night)$/i.test(cleanMessage);

  if (isGreeting) {
    const instantReply = `Hi ${customerName ? customerName.trim() : 'there'}! 👋 Welcome to OQULIX. How can I help you out today?`;
    const wamid = await sendWhatsAppMessage(phoneNumber, instantReply);
    
    if (lead) {
      await db.collection('conversations').add({
        lead_id: lead.id,
        sender: 'ai',
        message: instantReply,
        wamid: wamid || null,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    }
    return; // Stop here, no need to run RAG for simple greeting
  }

  // 2. RAG Search (searches vector database or falls back to data/oqulix/knowledge.md)
  console.log(`[WhatsApp] Searching company knowledge base...`);
  const context = await searchOqulixKnowledge(incomingMessage);

  // 3. Gemini AI Response & Lead Qualification
  console.log(`[WhatsApp] Generating AI response using company knowledge...`);
  const aiResult = await generateWhatsAppResponse(incomingMessage, context, formattedHistory, audioData);
  
  const responseText = aiResult.response_text;
  const leadData = aiResult.lead_data || {};

  console.log(`[WhatsApp] AI Response: "${responseText}"`);
  console.log(`[WhatsApp] Extracted Lead Data:`, leadData);

  // 4. Send response back to customer on WhatsApp
  let wamid = null;
  if (responseText && responseText.trim().length > 0) {
    wamid = await sendWhatsAppMessage(phoneNumber, responseText);
  } else {
    console.log(`[WhatsApp] AI Response was empty. Skipping sending to WhatsApp.`);
  }

  // 5. Save AI response and update lead in DB (if DB available)
  if (lead && responseText && responseText.trim().length > 0) {
    try {
      await db.collection('conversations').add({
        lead_id: lead.id,
        sender: 'ai',
        message: responseText,
        wamid: wamid || null,
        timestamp: new Date().toISOString()
      });

      const updates = {};
      if (leadData.customer_name && !lead.customer_name) updates.customer_name = leadData.customer_name;
      if (leadData.business_type) updates.business_type = leadData.business_type;
      if (leadData.service_required) updates.service_required = leadData.service_required;
      if (leadData.requirements) updates.requirements = leadData.requirements;
      if (leadData.budget) updates.budget = leadData.budget;
      if (leadData.timeline) updates.timeline = leadData.timeline;
      if (leadData.urgency) updates.urgency = leadData.urgency;
      if (leadData.lead_score !== undefined) updates.lead_score = leadData.lead_score;
      if (leadData.lead_status) updates.lead_status = leadData.lead_status;
      
      let newlyHot = false;
      if (leadData.human_needed || leadData.lead_status === 'HOT') {
        updates.human_needed = true;
        if (!lead.sales_team_notified) {
          updates.sales_team_notified = true;
          newlyHot = true;
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await db.collection('leads').doc(lead.id).update(updates);
      }

      if (newlyHot) {
        notifySalesTeam({ ...lead, ...updates }, incomingMessage);
      }
    } catch (err) {
      console.warn('[WhatsApp] Could not log interaction to Firebase:', err.message);
    }
  }
}

/**
 * Notifies the sales team about a HOT lead.
 */
function notifySalesTeam(leadData, lastMessage) {
  console.log(`\n=========================================`);
  console.log(`🔥 HOT OQULIX LEAD 🔥`);
  console.log(`=========================================`);
  console.log(`Name: ${leadData.customer_name || 'Unknown'}`);
  console.log(`Phone: ${leadData.phone_number}`);
  console.log(`Business: ${leadData.business_type || 'Unknown'}`);
  console.log(`Service: ${leadData.service_required || 'Unknown'}`);
  console.log(`Timeline: ${leadData.timeline || 'Unknown'}`);
  console.log(`Urgency: ${leadData.urgency || 'UNKNOWN'}`);
  console.log(`Lead Score: ${leadData.lead_score || 0}/100`);
  console.log(`\nCustomer message:`);
  console.log(`"${lastMessage}"`);
  console.log(`\n⚡ Recommended action: Contact immediately.`);
  console.log(`=========================================\n`);
  
  // Here you can add logic to send an Email via SendGrid, a Slack webhook, 
  // or a WhatsApp message to the sales manager.
}

module.exports = {
  processIncomingWhatsApp,
  sendWhatsAppMessage,
  sendWhatsAppMedia,
  recallWhatsAppMessage
};
