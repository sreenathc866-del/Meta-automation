/**
 * Meta Ads, Lead Gen, and Click-to-WhatsApp Router
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fs = require('fs');
const path = require('path');
const { db, bucket } = require('../services/firebase');
const metaAdsService = require('../services/meta-ads');
const { generateAdCreatives } = require('../ai/ad-gemini');

// Helper to verify admin token/session if configured (extensible for Firebase auth headers)
function checkAuth(req, res, next) {
  // If FIREBASE_REQUIRE_AUTH is true, verify Authorization bearer token
  const authHeader = req.headers.authorization;
  if (process.env.REQUIRE_ADMIN_AUTH === 'true' && !authHeader) {
    return res.status(401).json({ error: 'Unauthorized. Admin authorization header required.' });
  }
  next();
}

router.use(checkAuth);

/**
 * 1. Connected Accounts Discovery
 */
router.get('/accounts', async (req, res) => {
  try {
    const adAccounts = await metaAdsService.getAdAccounts();
    const pages = await metaAdsService.getPagesAndInstagramAccounts();
    const whatsappConnected = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    res.json({
      success: true,
      adAccounts,
      pages,
      whatsappConnected
    });
  } catch (err) {
    console.error('Meta Accounts fetch error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

/**
 * 2. Search Targeting (Interests and Locations)
 */
router.get('/targeting/search', async (req, res) => {
  try {
    const { type = 'adinterest', q } = req.query;
    if (!q) return res.json({ data: [] });
    const results = await metaAdsService.searchTargeting(type, q);
    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

/**
 * 3. AI Generation of Ad Copy, Headlines, and Angles
 */
router.post('/generate-creative', async (req, res) => {
  try {
    const { productName, description, targetAudience, objective, platform, callToAction } = req.body;
    if (!productName || !description) {
      return res.status(400).json({ error: 'Product name and description are required.' });
    }

    const aiResult = await generateAdCreatives({
      productName,
      description,
      targetAudience,
      objective,
      platform,
      callToAction
    });

    res.json({ success: true, ...aiResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Upload Ad Creative Image
 */
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No image file provided' });
    const { adAccountId } = req.body;

    // 1. Save locally to public/uploads/ad_creatives for guaranteed instant preview
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'ad_creatives');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const localFilename = `ad-${Date.now()}-${sanitizedName}`;
    const localFilePath = path.join(uploadsDir, localFilename);
    fs.writeFileSync(localFilePath, file.buffer);

    let publicUrl = `/uploads/ad_creatives/${localFilename}`;

    // 2. Also try saving to Firebase Storage if bucket is configured
    try {
      const fbFilename = `ad_creatives/${localFilename}`;
      const fileUpload = bucket.file(fbFilename);
      await fileUpload.save(file.buffer, {
        contentType: file.mimetype,
        public: true
      });
      await fileUpload.makePublic();
      publicUrl = `https://storage.googleapis.com/${bucket.name}/${fbFilename}`;
    } catch (e) {
      // Keep local publicUrl as reliable fallback
    }

    // 3. Upload to Meta Ad Account if adAccountId is passed or configured
    let metaImageHash = null;
    const targetAdAccount = adAccountId || process.env.META_AD_ACCOUNT_ID;
    if (targetAdAccount) {
      try {
        const metaRes = await metaAdsService.uploadAdImage(targetAdAccount, file.buffer.toString('base64'), file.originalname);
        metaImageHash = metaRes.hash;
      } catch (metaErr) {
        console.warn('Could not sync image directly to Meta yet:', metaErr.message);
      }
    }

    res.json({
      success: true,
      publicUrl,
      imageHash: metaImageHash
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Campaign Drafts (List, Create, Update)
 */
router.get('/campaigns', async (req, res) => {
  try {
    let storedCampaigns = [];
    try {
      const snapshot = await db.collection('ad_campaigns').orderBy('created_at', 'desc').get();
      storedCampaigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (dbErr) {
      console.warn('[Ads] Note: Could not fetch campaigns from DB:', dbErr.message);
    }

    // Fetch campaigns live from Meta Graph API
    let liveCampaigns = [];
    try {
      const metaCamps = await metaAdsService.getLiveCampaigns();
      liveCampaigns = metaCamps.map(mc => ({
        id: mc.id,
        meta_campaign_id: mc.id,
        name: mc.name,
        destinationType: mc.objective || 'META_CAMPAIGN',
        dailyBudget: mc.daily_budget ? (parseInt(mc.daily_budget, 10) / 100) : 0,
        approved: true,
        published: true,
        status: mc.status || 'PAUSED',
        source: 'META_LIVE'
      }));
    } catch (metaErr) {
      console.warn('[Ads] Note: Could not fetch live campaigns from Meta:', metaErr.message);
    }

    // Merge without duplicates (favor stored campaign for draft metadata)
    const storedIds = new Set(storedCampaigns.map(c => c.meta_campaign_id || c.id));
    const combined = [
      ...storedCampaigns,
      ...liveCampaigns.filter(lc => !storedIds.has(lc.id))
    ];

    res.json(combined);
  } catch (err) {
    res.json([]);
  }
});

router.post('/campaigns/draft', async (req, res) => {
  try {
    const campaignData = {
      ...req.body,
      status: 'DRAFT',
      approved: false, // Strict requirement: Not published without manual approval
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const docRef = await db.collection('ad_campaigns').add(campaignData);
    res.json({ success: true, id: docRef.id, campaign: { id: docRef.id, ...campaignData } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
      approved: false, // Invalidate approval on material setting changes
      updated_at: new Date().toISOString()
    };

    await db.collection('ad_campaigns').doc(id).update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('ad_campaigns').doc(id).delete();
    res.json({ success: true, message: 'Campaign draft deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. Explicit Campaign Manual Approval
 */
router.post('/campaigns/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedBy = 'Admin' } = req.body;

    await db.collection('ad_campaigns').doc(id).update({
      approved: true,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, message: 'Campaign successfully approved and ready for publishing.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. Publish Campaign to Meta Marketing API
 */
router.post('/campaigns/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const campDoc = await db.collection('ad_campaigns').doc(id).get();
    if (!campDoc.exists) return res.status(404).json({ error: 'Campaign draft not found' });

    const c = campDoc.data();

    if (!c.approved) {
      return res.status(400).json({
        error: 'Manual approval required before publishing campaign to Meta. Please review and approve.'
      });
    }

    if (!c.adAccountId || !c.pageId) {
      return res.status(400).json({ error: 'Ad Account ID and Facebook Page ID are required to publish.' });
    }

    // Step 1: Determine Meta Objective & Optimization Goal based on Destination
    const destination = c.destinationType || 'WHATSAPP';
    let metaObjective = c.objective || 'OUTCOME_LEADS';
    let optimizationGoal = 'LEAD_GENERATION';
    let destinationType = destination;

    if (destination === 'WHATSAPP') {
      // Native WhatsApp Message Engagement Campaign (Click-to-WhatsApp Engagement)
      metaObjective = 'OUTCOME_ENGAGEMENT';
      optimizationGoal = 'CONVERSATIONS';
      destinationType = 'WHATSAPP';
    } else if (destination === 'WEBSITE') {
      metaObjective = 'OUTCOME_TRAFFIC';
      optimizationGoal = 'LINK_CLICKS';
      destinationType = 'WEBSITE';
    } else if (destination === 'ENGAGEMENT') {
      metaObjective = 'OUTCOME_ENGAGEMENT';
      optimizationGoal = 'POST_ENGAGEMENT';
      destinationType = 'UNDEFINED';
    }

    // Step 1: Create Meta Campaign
    const metaCamp = await metaAdsService.createCampaign(c.adAccountId, {
      name: c.name,
      objective: metaObjective,
      status: 'PAUSED'
    });

    // Step 2: Create Meta Ad Set
    const dailyBudgetCents = Math.round(Number(c.dailyBudget || 500) * 100);
    const metaAdSet = await metaAdsService.createAdSet(c.adAccountId, {
      campaignId: metaCamp.id,
      name: `${c.name} - AdSet`,
      dailyBudgetInCents: dailyBudgetCents,
      optimizationGoal: optimizationGoal,
      targeting: c.targeting,
      destinationType: destinationType,
      pageId: c.pageId,
      startTime: c.startTime || undefined,
      endTime: c.endTime || undefined
    });

    // Step 3: Create Meta Ad Creative
    const metaCreative = await metaAdsService.createAdCreative(c.adAccountId, {
      name: `${c.name} - Creative`,
      pageId: c.pageId,
      instagramActorId: c.instagramActorId,
      imageHash: c.imageHash,
      imageUrl: c.imageUrl,
      headline: c.headline,
      primaryText: c.primaryText,
      description: c.description,
      callToActionType: c.callToActionType || (c.destinationType === 'WEBSITE' ? 'LEARN_MORE' : 'WHATSAPP_MESSAGE'),
      whatsappPhoneNumber: c.whatsappPhoneNumber || process.env.WHATSAPP_PHONE_NUMBER_ID,
      websiteUrl: c.websiteUrl,
      leadGenFormId: c.leadGenFormId
    });

    // Step 4: Create Meta Ad
    const metaAd = await metaAdsService.createAd(c.adAccountId, {
      name: `${c.name} - Ad`,
      adSetId: metaAdSet.id,
      creativeId: metaCreative.id,
      status: 'PAUSED' // Delivery only activated upon explicit user authorization
    });

    // Step 5: Save Published Details in Firestore
    await db.collection('ad_campaigns').doc(id).update({
      status: 'PAUSED',
      published: true,
      meta_campaign_id: metaCamp.id,
      meta_adset_id: metaAdSet.id,
      meta_creative_id: metaCreative.id,
      meta_ad_id: metaAd.id,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      metaCampaignId: metaCamp.id,
      metaAdSetId: metaAdSet.id,
      metaAdId: metaAd.id
    });
  } catch (err) {
    const metaErr = err.response?.data?.error;
    const errorDetails = metaErr?.error_user_msg || metaErr?.message || err.message;
    console.error('Meta Publish Error:', metaErr || err.message);
    res.status(500).json({ error: errorDetails });
  }
});

/**
 * 8. Pause / Resume Campaign in Meta
 */
router.post('/campaigns/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'ACTIVE' or 'PAUSED'

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'ACTIVE' or 'PAUSED'" });
    }

    const campDoc = await db.collection('ad_campaigns').doc(id).get();
    if (!campDoc.exists) return res.status(404).json({ error: 'Campaign not found' });
    const c = campDoc.data();

    if (c.meta_campaign_id) {
      await metaAdsService.updateCampaignStatus(c.meta_campaign_id, status);
    }

    await db.collection('ad_campaigns').doc(id).update({
      status: status,
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

/**
 * 9. Campaign Insights / Analytics
 */
router.get('/campaigns/:id/insights', async (req, res) => {
  try {
    const { id } = req.params;
    const campDoc = await db.collection('ad_campaigns').doc(id).get();
    if (!campDoc.exists) return res.status(404).json({ error: 'Campaign not found' });
    const c = campDoc.data();

    let metaInsights = null;
    if (c.meta_campaign_id) {
      try {
        metaInsights = await metaAdsService.getCampaignInsights(c.meta_campaign_id);
      } catch (e) {
        console.warn('Meta Insights warning:', e.message);
      }
    }

    // Query CRM Firestore for attributed WhatsApp conversations and leads
    let attributedLeadsCount = 0;
    try {
      const leadsSnap = await db.collection('leads')
        .where('campaign_id', '==', id)
        .get();
      attributedLeadsCount = leadsSnap.size;
    } catch (e) {}

    res.json({
      success: true,
      metaInsights: metaInsights || {
        spend: '0.00',
        impressions: '0',
        reach: '0',
        clicks: '0',
        cpc: '0.00'
      },
      attributedLeadsCount,
      campaign: c
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
