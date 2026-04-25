const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    isConnected = true;
    console.log(`🟢 MongoDB Connected: ${mongoose.connection.host}`);
    return mongoose.connection;
  } catch (error) {
    console.error(`🔴 Error: ${error.message}`);
    console.warn(`⚠️ Running without MongoDB. Caching features may be disabled.`);
  }
};

module.exports = connectDB;
