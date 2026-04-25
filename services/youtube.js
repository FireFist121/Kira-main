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

// FIX 1: These are now persisted to MongoDB so they survive server restarts
let nextActiveRefreshAt = Date.now();
let activeNoChangeCount = 0;
let lastResetDate = new Date().toDateString();
let quotaDailyUsage = 0;
let youtubeLogs = [];

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
    await Settings.findOneAndUpdate(
      { key: 'youtube_cache' },
      { $set: { data: memoryCache } },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (e) {
    console.error('Error saving YouTube cache to MongoDB', e);
  }
}

async function loadState() {
  try {
    const settings = await getSettings('youtube_state', serviceState);
    const savedData = settings.data;

    // Restore core state
    serviceState = {
      archiveBatchIndex: savedData.archiveBatchIndex || 0,
      lastActiveRefreshAt: savedData.lastActiveRefreshAt || null,
      lastArchiveRefreshAt: savedData.lastArchiveRefreshAt || null,
      lastManualRefreshAt: savedData.lastManualRefreshAt || null,
      lastPoolRebuildAt: savedData.lastPoolRebuildAt || null,
    };

    // FIX 1: Restore backoff state so it survives restarts
    activeNoChangeCount = savedData.activeNoChangeCount || 0;
    const savedNext = savedData.nextActiveRefreshAt;
    if (savedNext && !isNaN(new Date(savedNext).getTime())) {
      nextActiveRefreshAt = new Date(savedNext).getTime();
      // If the saved next time is in the past, set to now so we don't wait forever
      if (nextActiveRefreshAt < Date.now()) {
        nextActiveRefreshAt = Date.now();
      }
    } else {
      nextActiveRefreshAt = Date.now();
    }

    console.log('🟢 YouTube state loaded from MongoDB');
  } catch (e) {
    console.error('Error loading YouTube state from MongoDB', e);
  }
}

async function saveState() {
  try {
    await Settings.findOneAndUpdate(
      { key: 'youtube_state' },
      { $set: { data: {
        ...serviceState,
        activeNoChangeCount,
        nextActiveRefreshAt: new Date(nextActiveRefreshAt).toISOString(),
      }}},
      { upsert: true, returnDocument: 'after' }
    );
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

    ytProjects.forEach(p => {
      const vid = extractVideoId(p.link);
      const cache = memoryCache[vid] || {};
      p._engagement = cache.lastDelta || 0;
      p._lastUpdate = cache.updatedAt || p.createdAt || 0;
    });

    ytProjects.sort((a, b) => {
      if (b._engagement !== a._engagement) return b._engagement - a._engagement;
      return new Date(b._lastUpdate) - new Date(a._lastUpdate);
    });

    const active = ytProjects.slice(0, 15);
    const archive = ytProjects.slice(15);

    return { active, archive };
  } catch (e) {
    console.error('Error getting YouTube tasks:', e);
    return { active: [], archive: [] };
  }
}

function getBackoffDelay() {
  // No backoff — always refresh every 60s (1440 units/day = 14.4% of quota)
  // Only throttle if quota is critically high
  if (quotaDailyUsage >= 8000) return 300000; // 5 min if near quota limit
  return 60000;
}

function getActiveRefreshInterval() {
  return getBackoffDelay();
}

function shouldRunActiveRefresh() {
  return Date.now() >= nextActiveRefreshAt;
}

function updateActiveBackoff(updated) {
  // Always refresh every 60s regardless of whether stats changed
  // Still track streak for display purposes only
  activeNoChangeCount = updated ? 0 : activeNoChangeCount + 1;
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
    await saveYoutubeStats();
  }

  if (quotaDailyUsage >= 9500) {
    console.warn('⛔ YouTube Daily Quota CRITICAL (>9500). Stopping all requests.');
    return { skipped: true, reason: 'quota_critical' };
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

    const startTime = Date.now();
    try {
      const res = await axios.get(API_URL, {
        params: {
          part: 'statistics,snippet',
          id: chunk.join(','),
          key: YOUTUBE_API_KEY,
        },
      });

      const responseTime = Date.now() - startTime;
      const items = res.data.items || [];
      let updated = false;
      items.forEach(item => {
        const oldRecord = memoryCache[item.id] || {};
        const newViews = parseInt(item.statistics?.viewCount || 0, 10);
        const newLikes = parseInt(item.statistics?.likeCount || 0, 10);
        const newComments = parseInt(item.statistics?.commentCount || 0, 10);

        if (oldRecord.views !== newViews || oldRecord.likes !== newLikes || oldRecord.comments !== newComments) {
          const delta = newViews - (oldRecord.views || 0);
          memoryCache[item.id] = {
            title: item.snippet?.title || oldRecord.title || 'Unknown Title',
            views: newViews,
            likes: newLikes,
            comments: newComments,
            lastDelta: delta > 0 ? delta : (oldRecord.lastDelta || 0),
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
      await addYoutubeLog('success', `Fetched ${chunk.length} videos, updated ${items.length} records.`, {
        responseTime,
        units: 1,
        statusCode: 200
      });
    } catch (e) {
      const responseTime = Date.now() - startTime;
      const statusCode = e.response?.status || 500;
      const errMsg = e.response?.data?.error?.message || e.message || e;
      console.error('Error fetching YouTube API', errMsg);
      await addYoutubeLog('error', `API Fetch Error: ${errMsg}`, {
        responseTime,
        units: 1,
        statusCode
      });
    }
  }

  summary.dailyQuota = quotaDailyUsage;
  await saveYoutubeStats();
  return summary;
}

async function refreshActiveVideoData(force = false) {
  const { active } = await getYouTubeTasks();
  const ids = active.map(w => extractVideoId(w.link)).filter(Boolean);

  // FIX 2: Always include nextRunAt even when no videos
  if (ids.length === 0) {
    return {
      fetched: 0,
      updated: 0,
      skipped: false,
      active: 0,
      refreshIntervalMs: getActiveRefreshInterval(),
      nextRunAt: new Date(nextActiveRefreshAt).toISOString(),
    };
  }

  serviceState.lastPoolRebuildAt = new Date().toISOString();
  await saveState();

  if (!force && !shouldRunActiveRefresh()) {
    return {
      skipped: true,
      reason: 'backoff',
      nextRunAt: new Date(nextActiveRefreshAt).toISOString(),
      refreshIntervalMs: getActiveRefreshInterval(),
    };
  }

  const result = await fetchYouTubeStats(ids, { force });
  updateActiveBackoff(result.updated > 0);
  serviceState.lastActiveRefreshAt = new Date().toISOString();
  if (force) {
    serviceState.lastManualRefreshAt = serviceState.lastActiveRefreshAt;
  }
  await saveState();

  return {
    ...result,
    active: ids.length,
    nextRunAt: new Date(nextActiveRefreshAt).toISOString(),
    refreshIntervalMs: getActiveRefreshInterval(),
  };
}

async function refreshArchiveBatch() {
  if (quotaDailyUsage >= 8000) {
    return { skipped: true, reason: 'quota_throttle', message: 'Archive updates paused due to high quota usage (>8000)' };
  }
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

// FIX 3: refreshYouTubeData now uses refreshArchiveBatch() instead of fetching all archive directly
async function refreshYouTubeData({ includeArchive = true, force = false } = {}) {
  const activeResult = await refreshActiveVideoData(force);
  let archiveResult = null;

  if (includeArchive) {
    archiveResult = await refreshArchiveBatch();
  }

  return {
    activeResult,
    archiveResult,
    quotaDailyUsage,
    lastResetDate,
    status: await getYouTubeStatus(),
  };
}

async function loadYoutubeStats() {
  try {
    const stats = await getSettings('youtube_stats', { quotaDailyUsage: 0, lastResetDate: new Date().toDateString() });
    quotaDailyUsage = stats.data.quotaDailyUsage || 0;
    lastResetDate = stats.data.lastResetDate || new Date().toDateString();

    const today = new Date().toDateString();
    if (today !== lastResetDate) {
      quotaDailyUsage = 0;
      lastResetDate = today;
      await saveYoutubeStats();
    }
    console.log(`🟢 YouTube stats loaded: ${quotaDailyUsage} units used today.`);
  } catch (e) {
    console.error('Error loading YouTube stats from MongoDB', e);
  }
}

async function saveYoutubeStats() {
  try {
    await Settings.findOneAndUpdate(
      { key: 'youtube_stats' },
      { $set: { data: { quotaDailyUsage, lastResetDate } } },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (e) {
    console.error('Error saving YouTube stats to MongoDB', e);
  }
}

async function addYoutubeLog(type, message, details = {}) {
  try {
    const logEntry = {
      type,
      message,
      timestamp: new Date().toISOString(),
      ...details
    };
    youtubeLogs.unshift(logEntry);
    if (youtubeLogs.length > 50) youtubeLogs = youtubeLogs.slice(0, 50);

    if (global.io) {
      global.io.emit('youtube_log', logEntry);
      global.io.emit('youtube_status_update', await getYouTubeStatus());
    }

    await Settings.findOneAndUpdate(
      { key: 'youtube_logs' },
      { $set: { data: youtubeLogs } },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (e) {
    console.error('Error saving YouTube log:', e);
  }
}

async function loadYoutubeLogs() {
  try {
    const settings = await getSettings('youtube_logs', []);
    youtubeLogs = settings.data || [];
    console.log('🟢 YouTube logs loaded from MongoDB');
  } catch (e) {
    console.error('Error loading YouTube logs:', e);
  }
}

async function initCronJobs() {
  await loadCache();
  await loadState();
  await loadYoutubeStats();
  await loadYoutubeLogs();

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
    isThrottled: quotaDailyUsage >= 8000,
    engineMode: quotaDailyUsage >= 8000 ? 'Throttled (High Usage)' : activeNoChangeCount > 0 ? 'Backoff (Low Activity)' : 'Active',
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

async function updateQuotaUsage(usage) {
  quotaDailyUsage = usage;
  await saveYoutubeStats();
  await addYoutubeLog('info', `Quota manually synced to ${usage} units.`);
}

function getYoutubeLogs() {
  return youtubeLogs;
}

module.exports = {
  initCronJobs,
  getEnrichedViews,
  extractVideoId,
  refreshYouTubeData,
  getYouTubeStatus,
  updateQuotaUsage,
  getYoutubeLogs,
};
