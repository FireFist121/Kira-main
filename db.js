const mongoose = require('mongoose');

let connectionPromise = null;

const connectDB = async () => {
  // If already connected, return immediately
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If a connection is in progress, wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  // Start a new connection
  connectionPromise = mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log(`🟢 MongoDB Connected: ${mongoose.connection.host}`);
      return mongoose.connection;
    })
    .catch((error) => {
      connectionPromise = null; // Reset so retry is possible
      console.error(`🔴 MongoDB Error: ${error.message}`);
      console.warn(`⚠️ Running without MongoDB. Caching features may be disabled.`);
    });

  return connectionPromise;
};

module.exports = connectDB;
