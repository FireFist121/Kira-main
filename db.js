const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
  if (cachedConnection) {
    console.log('🟢 Using cached MongoDB connection');
    return cachedConnection;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    cachedConnection = conn;
    console.log(`🟢 MongoDB Connected: ${mongoose.connection.host}`)
    return conn;
  } catch (error) {
    console.error(`🔴 Error: ${error.message}`);
    console.warn(`⚠️ Running without MongoDB. Caching features may be disabled.`);
  }
};

module.exports = connectDB;
