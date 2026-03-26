const Counter = require("../models/Counter");

let legacyIndexChecked = false;

async function cleanupLegacyCounterIndex() {
  if (legacyIndexChecked) return;
  legacyIndexChecked = true;
  try {
    await Counter.collection.dropIndex("name_1");
  } catch (error) {
    // Ignore when index does not exist or cannot be dropped.
  }
}

async function getNextSequence(sequenceName) {
  await cleanupLegacyCounterIndex();
  const updated = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return updated.seq;
}

module.exports = { getNextSequence };
