const mongoose = require("mongoose");

const globalCache = globalThis.__accessGuardMongo || {
  conn: null,
  promise: null
};
globalThis.__accessGuardMongo = globalCache;

async function connectMongoDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment variables.");
  }

  if (globalCache.conn) {
    return globalCache.conn;
  }

  if (!globalCache.promise) {
    mongoose.set("strictQuery", true);
    globalCache.promise = mongoose
      .connect(mongoUri)
      .then((mongooseInstance) => mongooseInstance)
      .catch((error) => {
        globalCache.promise = null;
        throw error;
      });
  }

  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}

module.exports = connectMongoDB;
