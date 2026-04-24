const axios = require('axios');
const cron = require('node-cron');
const Work = require('../models/Work');
const Settings = require('../models/Settings');
require('dotenv').config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const API_URL = 'https://www.googleapis.com/youtube/v3/videos';

let memoryCache = {};
let serviceState = {
  archiveBatchIndex: 0,
  lastActiveRefreshAt: null,
  lastArchiveRefreshAt: null,
  lastManualRefreshAt: null,
  lastPoolRebuildAt: null,
};
let quotaDailyUsage = 0;
let lastResetDate = new Date().toDateString();
let activeNoChangeCount = 0;
let nextActiveRefreshAt = Date.now();

/** Helper to get or create settings */
async function getSettings(key, defaultValue = {}) {
  let settings = await Settings.findOne({ key });
  if (!settings) {
    settings = await Settings.create({ key, data: defaultValue });
  }
  return settings;
}

async function loadCache() {
  try {
    const settings = await getSettings('youtube_cache', {});
    memoryCache = settings.data;
    console.log('🟢 YouTube cache loaded from MongoDB');
  } catch (e) {
    console.error('Error loading YouTube cache from MongoDB', e);
  }
}

async function saveCache() {
  try {
    const settings = await getSettings('youtube_cache', {});
    settings.data = memoryCache;
    settings.markModified('data');
    await settings.save();
  } catch (e) {
    console.error('Error saving YouTube cache to MongoDB', e);
  }
}

async function loadState() {
  try {
    const settings = await getSettings('youtube_state', serviceState);
    serviceState = settings.data;
    console.log('🟢 YouTube state loaded from MongoDB');
  } catch (e) {
    console.error('Error loading YouTube state from MongoDB', e);
  }
}

async function saveState() {
  try {
    const settings = await getSettings('youtube_state', serviceState);
    settings.data = serviceState;
    settings.markModified('data');
    await settings.save();
  } catch (e) {
    console.error('Error saving YouTube state to MongoDB', e);
  }
}

function extractVideoId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) return match[2];

  const shortsReg = /youtube\.com\/shorts\/([^#\&\?]*)/;
  const matchShorts = url.match(shortsReg);
  if (matchShorts && matchShorts[1]) return matchShorts[1];

  return null;
}

async function getYouTubeTasks() {
  try {
    const works = await Work.find({ type: { $in: ['video', 'short', 'clip'] } }).lean();
    const ytProjects = works.filter(w => extractVideoId(w.link));

    const active = ytProjects.slice(0, 15);
    const archive = ytProjects.slice(15);

    return { active, archive };
  } catch (e) {
    console.error('Error getting YouTube tasks:', e);
    return { active: [], archive: [] };
  }
}

function getBackoffDelay() {
  if (activeNoChangeCount >= 10) return 600000;
  if (activeNoChangeCount >= 5) return 300000;
  if (activeNoChangeCount >= 2) return 120000;
  return 60000;
}

function getActiveRefreshInterval() {
  return getBackoffDelay();
}

function shouldRunActiveRefresh() {
  return Date.now() >= nextActiveRefreshAt;
}

function updateActiveBackoff(updated) {
  if (updated) {
    activeNoChangeCount = 0;
    nextActiveRefreshAt = Date.now() + 60000;
    return;
  }

  activeNoChangeCount += 1;
  nextActiveRefreshAt = Date.now() + getBackoffDelay();
}

async function fetchYouTubeStats(ids, options = { force: false }) {
  if (!YOUTUBE_API_KEY) {
    return { skipped: true, reason: 'missing_api_key' };
  }
  if (ids.length === 0) {
    return { fetched: 0, updated: 0 };
  }

  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    quotaDailyUsage = 0;
    lastResetDate = today;
  }

  if (quotaDailyUsage >= 8000) {
    console.warn('⛔ YouTube Daily Quota Limit Reached (>8000). Pausing requests.');
    return { skipped: true, reason: 'quota_limit' };
  }

  const summary = { fetched: 0, updated: 0, skipped: false, quotaUsed: 0 };
  const chunked = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunked.push(ids.slice(i, i + 50));
  }

  for (const chunk of chunked) {
    if (quotaDailyUsage >= 8000) {
      summary.skipped = true;
      summary.reason = 'quota_limit';
      break;
    }

    quotaDailyUsage += 1;
    summary.quotaUsed += 1;

    try {
      const res = await axios.get(API_URL, {
        params: {
          part: 'statistics,snippet',
          id: chunk.join(','),
          key: YOUTUBE_API_KEY,
        },
      });

      const items = res.data.items || [];
      let updated = false;
      items.forEach(item => {
        const oldRecord = memoryCache[item.id] || {};
        const newViews = parseInt(item.statistics?.viewCount || 0, 10);
        const newLikes = parseInt(item.statistics?.likeCount || 0, 10);
        const newComments = parseInt(item.statistics?.commentCount || 0, 10);

        if (oldRecord.views !== newViews || oldRecord.likes !== newLikes || oldRecord.comments !== newComments) {
          memoryCache[item.id] = {
            title: item.snippet?.title || oldRecord.title || 'Unknown Title',
            views: newViews,
            likes: newLikes,
            comments: newComments,
            updatedAt: new Date().toISOString(),
          };
          updated = true;
        }
      });

      if (updated) {
        summary.updated += items.length;
        await saveCache();
      }

      summary.fetched += chunk.length;
    } catch (e) {
      console.error('Error fetching YouTube API', e.message || e);
    }
  }

  summary.dailyQuota = quotaDailyUsage;
  return summary;
}

async function refreshActiveVideoData(force = false) {
  const { active } = await getYouTubeTasks();
  const ids = active.map(w => extractVideoId(w.link)).filter(Boolean);
  if (ids.length === 0) {
    return { fetched: 0, updated: 0, skipped: false, active: 0, refreshIntervalMs: getActiveRefreshInterval() };
  }

  serviceState.lastPoolRebuildAt = new Date().toISOString();
  await saveState();

  if (!force && !shouldRunActiveRefresh()) {
    return { skipped: true, reason: 'backoff', nextRunAt: new Date(nextActiveRefreshAt).toISOString(), refreshIntervalMs: getActiveRefreshInterval() };
  }

  const result = await fetchYouTubeStats(ids, { force });
  updateActiveBackoff(result.updated > 0);
  serviceState.lastActiveRefreshAt = new Date().toISOString();
  if (force) {
    serviceState.lastManualRefreshAt = serviceState.lastActiveRefreshAt;
  }
  await saveState();

  return { ...result, active: ids.length, nextRunAt: new Date(nextActiveRefreshAt).toISOString(), refreshIntervalMs: getActiveRefreshInterval() };
}

async function refreshArchiveBatch() {
  const { archive } = await getYouTubeTasks();
  const ids = archive.map(w => extractVideoId(w.link)).filter(Boolean);
  if (ids.length === 0) {
    return { fetched: 0, updated: 0, skipped: true, reason: 'no_archive' };
  }

  const batchSize = 50;
  const totalBatches = Math.max(1, Math.ceil(ids.length / batchSize));
  const batchIndex = serviceState.archiveBatchIndex % totalBatches;
  const batchIds = ids.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize);
  if (batchIds.length === 0) {
    return { fetched: 0, updated: 0, skipped: true, reason: 'empty_batch' };
  }

  const result = await fetchYouTubeStats(batchIds, { force: false });
  serviceState.archiveBatchIndex = (batchIndex + 1) % totalBatches;
  serviceState.lastArchiveRefreshAt = new Date().toISOString();
  await saveState();

  return { ...result, archiveBatchIndex: serviceState.archiveBatchIndex, batchSize: batchIds.length, totalBatches };
}

async function refreshYouTubeData({ includeArchive = true, force = false } = {}) {
  const activeResult = await refreshActiveVideoData(force);
  let archiveResult = null;

  if (includeArchive) {
    const tasks = await getYouTubeTasks();
    archiveResult = await fetchYouTubeStats(
      tasks.archive
        .map(w => extractVideoId(w.link))
        .filter(Boolean),
      { force }
    );
  }

  return {
    activeResult,
    archiveResult,
    quotaDailyUsage,
    lastResetDate,
    status: await getYouTubeStatus(),
  };
}

async function initCronJobs() {
  await loadCache();
  await loadState();

  cron.schedule('* * * * *', async () => {
    const result = await refreshActiveVideoData(false);
    if (result.skipped) {
      console.log(`[YouTube Active Job] Skipped due to backoff until ${result.nextRunAt}`);
    } else {
      console.log(`[YouTube Active Job] Refreshed ${result.active} ids. Updated at least ${result.updated} items. Next run at ${result.nextRunAt}`);
    }
  });

  cron.schedule('0 3 * * *', async () => {
    const result = await refreshArchiveBatch();
    if (result.skipped) {
      console.log('[YouTube Archive Job] Skipped:', result.reason);
    } else {
      console.log(`[YouTube Archive Job] Updated batch of ${result.batchSize} videos. Next batch index: ${result.archiveBatchIndex}`);
    }
  });

  console.log('⏱️ YouTube Cron Service initialized (MongoDB backed)');
}

async function getYouTubeStatus() {
  const { active, archive } = await getYouTubeTasks();
  const batchSize = 50;
  const totalBatches = Math.max(1, Math.ceil(archive.length / batchSize));
  const currentBatch = (serviceState.archiveBatchIndex % totalBatches) + 1;

  return {
    dailyQuotaUsage: quotaDailyUsage,
    dailyQuotaLimit: 10000,
    throttleAt: 8000,
    activePoolSize: active.length,
    activePoolLimit: 15,
    refreshIntervalMs: getActiveRefreshInterval(),
    noChangeStreak: activeNoChangeCount,
    archiveBatches: totalBatches,
    currentArchiveBatch: currentBatch,
    batchSize: batchSize,
    lastActiveRefreshAt: serviceState.lastActiveRefreshAt,
    lastArchiveRefreshAt: serviceState.lastArchiveRefreshAt,
    lastPoolRebuildAt: serviceState.lastPoolRebuildAt,
    lastManualRefreshAt: serviceState.lastManualRefreshAt,
    nextActiveRefreshAt: new Date(nextActiveRefreshAt).toISOString(),
  };
}

function getEnrichedViews(projects) {
  return projects.map(p => {
    const pObj = p.toObject ? p.toObject() : { ...p };
    
    // Maintain frontend compatibility: map _id to id
    if (pObj._id) pObj.id = pObj._id.toString();

    if (pObj.type === 'thumbnail') return pObj;
    const vid = extractVideoId(pObj.link);
    if (vid && memoryCache[vid]) {
      const count = memoryCache[vid].views;
      pObj.views = count >= 1000000 ? (count / 1000000).toFixed(1) + 'M' :
                  count >= 1000 ? (count / 1000).toFixed(1) + 'K' : count;
      pObj.liveData = memoryCache[vid];
    }
    return pObj;
  });
}

module.exports = {
  initCronJobs,
  getEnrichedViews,
  extractVideoId,
  refreshYouTubeData,
  getYouTubeStatus,
};
