/**
 * Meta Marketing API Service
 * Supports Facebook & Instagram Ads creation, editing, pausing/resuming,
 * insights reporting, Click-to-WhatsApp ads, and Lead Gen forms.
 */
require('dotenv').config();
const axios = require('axios');

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v20.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Returns access token from env or user context.
 * Falls back to WHATSAPP_ACCESS_TOKEN if META_ADS_ACCESS_TOKEN is not defined.
 */
function getMetaAccessToken() {
  return process.env.META_ADS_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
}

/**
 * Get connected Ad Accounts accessible by the access token.
 */
async function getAdAccounts() {
  const token = getMetaAccessToken();
  if (!token) throw new Error('Meta Access Token missing in server configuration');

  try {
    const response = await axios.get(`${GRAPH_BASE_URL}/me/adaccounts`, {
      params: {
        fields: 'id,account_id,name,account_status,currency,timezone_name,amount_spent,balance,min_daily_budget',
        access_token: token
      }
    });

    const accounts = response.data?.data || [];
    if (accounts.length > 0) return accounts;
  } catch (err) {
    console.warn('[Meta Ads] /me/adaccounts call warning:', err.response?.data?.error?.message || err.message);
  }

  // Fallback to directly fetching the configured META_AD_ACCOUNT_ID (System User token support)
  const configuredId = process.env.META_AD_ACCOUNT_ID;
  if (configuredId) {
    const actId = configuredId.startsWith('act_') ? configuredId : `act_${configuredId}`;
    try {
      const directRes = await axios.get(`${GRAPH_BASE_URL}/${actId}`, {
        params: {
          fields: 'id,account_id,name,account_status,currency,timezone_name,amount_spent,balance,min_daily_budget',
          access_token: token
        }
      });
      if (directRes.data && directRes.data.id) {
        return [directRes.data];
      }
    } catch (directErr) {
      console.warn('[Meta Ads] Direct ad account lookup warning:', directErr.response?.data?.error?.message || directErr.message);
    }
  }

  return [];
}

/**
 * Get connected Facebook Pages and their linked Instagram Professional Accounts.
 */
async function getPagesAndInstagramAccounts() {
  const token = getMetaAccessToken();
  if (!token) throw new Error('Meta Access Token missing in server configuration');

  const response = await axios.get(`${GRAPH_BASE_URL}/me/accounts`, {
    params: {
      fields: 'id,name,phone,access_token,category,instagram_business_account{id,username,profile_picture_url}',
      access_token: token
    }
  });

  return response.data?.data || [];
}

/**
 * Search interest targeting or location targeting using Meta's search API.
 */
async function searchTargeting(type = 'adinterest', query) {
  const token = getMetaAccessToken();
  if (!token) throw new Error('Meta Access Token missing in server configuration');

  const response = await axios.get(`${GRAPH_BASE_URL}/search`, {
    params: {
      type: type, // 'adinterest' or 'adgeolocation'
      q: query,
      access_token: token
    }
  });

  return response.data?.data || [];
}

/**
 * Upload an ad image to the Ad Account's image library.
 */
async function uploadAdImage(adAccountId, imageBase64, filename = 'ad-creative.jpg') {
  const token = getMetaAccessToken();
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const response = await axios.post(
    `${GRAPH_BASE_URL}/${cleanAccountId}/adimages`,
    {
      filename: filename,
      bytes: imageBase64
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const images = response.data?.images;
  if (!images) throw new Error('Failed to retrieve uploaded image hash from Meta');
  
  // Format is { [filename]: { hash: '...', url: '...' } }
  const firstKey = Object.keys(images)[0];
  return images[firstKey];
}

/**
 * Create a Campaign
 */
async function createCampaign(adAccountId, { name, objective, status = 'PAUSED', dailyBudget }) {
  const token = getMetaAccessToken();
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const payload = {
    name: name,
    objective: objective, // e.g. OUTCOME_LEADS, OUTCOME_TRAFFIC, OUTCOME_SALES
    status: status, // Defaults to PAUSED until verified & published
    special_ad_categories: ['NONE']
  };

  const response = await axios.post(`${GRAPH_BASE_URL}/${cleanAccountId}/campaigns`, payload, {
    params: { access_token: token }
  });

  return response.data; // { id: '...' }
}

/**
 * Create an Ad Set (Targeting, Placements, Budget)
 */
async function createAdSet(adAccountId, {
  campaignId,
  name,
  dailyBudgetInCents,
  billingEvent = 'IMPRESSIONS',
  optimizationGoal = 'LEAD_GENERATION', // or 'LINK_CLICKS', 'CONVERSATIONS'
  targeting,
  startTime,
  endTime,
  destinationType = 'WHATSAPP' // 'WHATSAPP', 'LEAD_GENERATION', 'WEBSITE'
}) {
  const token = getMetaAccessToken();
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const payload = {
    campaign_id: campaignId,
    name: name,
    daily_budget: dailyBudgetInCents, // e.g., 500 for $5.00 or local currency sub-units
    billing_event: billingEvent,
    optimization_goal: optimizationGoal,
    status: 'PAUSED',
    targeting: targeting || {
      geo_locations: { countries: ['IN'] },
      age_min: 18,
      age_max: 65,
      publisher_platforms: ['facebook', 'instagram']
    }
  };

  if (startTime) payload.start_time = startTime;
  if (endTime) payload.end_time = endTime;

  if (destinationType === 'WHATSAPP') {
    payload.destination_type = 'WHATSAPP';
  }

  const response = await axios.post(`${GRAPH_BASE_URL}/${cleanAccountId}/adsets`, payload, {
    params: { access_token: token }
  });

  return response.data;
}

/**
 * Create an Ad Creative
 */
async function createAdCreative(adAccountId, {
  name,
  pageId,
  instagramActorId,
  imageHash,
  imageUrl,
  headline,
  primaryText,
  description,
  callToActionType = 'WHATSAPP_MESSAGE', // or 'LEARN_MORE', 'SIGN_UP'
  whatsappPhoneNumber,
  websiteUrl,
  leadGenFormId
}) {
  const token = getMetaAccessToken();
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const linkData = {
    message: primaryText,
    name: headline,
    description: description,
    call_to_action: {
      type: callToActionType
    }
  };

  if (imageHash) {
    linkData.image_hash = imageHash;
  } else if (imageUrl) {
    linkData.picture = imageUrl;
  }

  // Handle destination specifics
  if (callToActionType === 'WHATSAPP_MESSAGE') {
    const cleanDigits = (whatsappPhoneNumber || process.env.WHATSAPP_PHONE_NUMBER_ID || '').replace(/[^0-9]/g, '');
    linkData.link = `https://wa.me/${cleanDigits}`;
  } else if (leadGenFormId) {
    linkData.lead_gen_form_id = leadGenFormId;
  } else {
    linkData.link = websiteUrl || process.env.COMPANY_WEBSITE_URL || 'https://oqulix.com';
  }

  const payload = {
    name: name,
    object_story_spec: {
      page_id: pageId,
      link_data: linkData
    }
  };

  if (instagramActorId) {
    payload.object_story_spec.instagram_actor_id = instagramActorId;
  }

  const response = await axios.post(`${GRAPH_BASE_URL}/${cleanAccountId}/adcreatives`, payload, {
    params: { access_token: token }
  });

  return response.data;
}

/**
 * Create an Ad
 */
async function createAd(adAccountId, {
  name,
  adSetId,
  creativeId,
  status = 'PAUSED'
}) {
  const token = getMetaAccessToken();
  const cleanAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const payload = {
    name: name,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: status
  };

  const response = await axios.post(`${GRAPH_BASE_URL}/${cleanAccountId}/ads`, payload, {
    params: { access_token: token }
  });

  return response.data;
}

/**
 * Fetch all campaigns directly from Meta Graph API
 */
async function getLiveCampaigns(adAccountId) {
  const token = getMetaAccessToken();
  if (!token) return [];
  const configuredId = adAccountId || process.env.META_AD_ACCOUNT_ID;
  if (!configuredId) return [];
  const cleanAccountId = configuredId.startsWith('act_') ? configuredId : `act_${configuredId}`;

  try {
    const res = await axios.get(`${GRAPH_BASE_URL}/${cleanAccountId}/campaigns`, {
      params: {
        fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time,start_time',
        access_token: token,
        limit: 50
      }
    });
    return res.data?.data || [];
  } catch (err) {
    console.warn('[Meta Ads] getLiveCampaigns error:', err.response?.data?.error?.message || err.message);
    return [];
  }
}

/**
 * Update Campaign Status (ACTIVE, PAUSED)
 */
async function updateCampaignStatus(campaignId, status) {
  const token = getMetaAccessToken();
  const response = await axios.post(
    `${GRAPH_BASE_URL}/${campaignId}`,
    { status: status },
    { params: { access_token: token } }
  );
  return response.data;
}

/**
 * Fetch Campaign Insights / Performance
 */
async function getCampaignInsights(campaignId, datePreset = 'last_30d') {
  const token = getMetaAccessToken();
  const response = await axios.get(`${GRAPH_BASE_URL}/${campaignId}/insights`, {
    params: {
      fields: 'impressions,reach,spend,clicks,cpc,cpm,actions,cost_per_action_type',
      date_preset: datePreset,
      access_token: token
    }
  });

  return response.data?.data?.[0] || null;
}

/**
 * Fetch Lead Details from Meta Lead Gen Webhook ID
 */
async function getLeadDetails(leadgenId) {
  const token = getMetaAccessToken();
  const response = await axios.get(`${GRAPH_BASE_URL}/${leadgenId}`, {
    params: {
      fields: 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data',
      access_token: token
    }
  });

  return response.data;
}

module.exports = {
  getAdAccounts,
  getPagesAndInstagramAccounts,
  searchTargeting,
  uploadAdImage,
  createCampaign,
  createAdSet,
  createAdCreative,
  createAd,
  updateCampaignStatus,
  getCampaignInsights,
  getLeadDetails,
  getLiveCampaigns
};
