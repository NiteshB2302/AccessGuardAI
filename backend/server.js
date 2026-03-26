const dotenv = require("dotenv");
const path = require("path");
const connectMongoDB = require("./database/mongodb_connection");
const app = require("./app");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const port = process.env.PORT || 5000;

async function start() {
  await connectMongoDB();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Access Guard AI backend running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Startup failure:", error.message);
  process.exit(1);
});
