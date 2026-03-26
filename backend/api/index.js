const dotenv = require("dotenv");
const path = require("path");
const app = require("../app");
const connectMongoDB = require("../database/mongodb_connection");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

module.exports = async (req, res) => {
  try {
    await connectMongoDB();
    return app(req, res);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Vercel handler failure:", error.message);
    return res.status(500).json({
      message: "Backend startup failed.",
      details: error.message
    });
  }
};
