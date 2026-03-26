let mongoose;
try {
  mongoose = require("mongoose");
} catch (error) {
  mongoose = require("../backend/node_modules/mongoose");
}

async function connectMongoDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment variables.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  // eslint-disable-next-line no-console
  console.log("MongoDB connected");
}

module.exports = connectMongoDB;
