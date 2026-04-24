const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { requireAdmin } = require('./admin');

/** Helper to get settings or return default object */
async function getSettings() {
  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) {
    settings = await Settings.create({ key: 'global', data: {
      stats: { projects: "0", clients: "0", years: "0" },
      tagline: "",
      bio1: "",
      bio2: "",
      skills: [],
      marqueeText: "",
      available: true
    }});
  }
  return settings;
}

// GET /api/portfolio
router.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const settings = await getSettings();
    res.json({ success: true, data: settings.data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/portfolio/stats
router.put('/stats', requireAdmin, async (req, res) => {
  try {
    const { projects, clients, years } = req.body;
    const settings = await getSettings();
    
    if (projects) settings.data.stats.projects = projects;
    if (clients)  settings.data.stats.clients  = clients;
    if (years)    settings.data.stats.years    = years;
    
    settings.markModified('data');
    await settings.save();
    res.json({ success: true, data: settings.data.stats });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// PUT /api/portfolio/content
router.put('/content', requireAdmin, async (req, res) => {
  try {
    const { tagline, bio1, bio2, skills, marqueeText, available } = req.body;
    const settings = await getSettings();
    
    if (tagline !== undefined)   settings.data.tagline   = tagline;
    if (bio1    !== undefined)   settings.data.bio1      = bio1;
    if (bio2    !== undefined)   settings.data.bio2      = bio2;
    if (skills  !== undefined)   settings.data.skills    = skills;
    if (marqueeText !== undefined) settings.data.marqueeText = marqueeText;
    if (available !== undefined) settings.data.available = available;
    
    settings.markModified('data');
    await settings.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

module.exports = router;

