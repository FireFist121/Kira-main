require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('../db');

const app = express();

// Ensure DB is connected on each request (silent - server.js handles the log)
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

const cookieParser = require('cookie-parser');

app.use(cors({ 
  origin: ['http://localhost:5173', 'https://kira-portfolio-six.vercel.app', '*'], 
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

// ─── API Routes ───
app.use('/api/portfolio', require('../routes/portfolio'));
app.use('/api/work',      require('../routes/work'));
app.use('/api/contact',   require('../routes/contact'));
app.use('/api/admin',     require('../routes/admin'));
app.use('/api/upload',    require('../routes/upload'));

// ─── Health check ───
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date(), env: process.env.VERCEL ? 'vercel' : 'local' }));

module.exports = app;
