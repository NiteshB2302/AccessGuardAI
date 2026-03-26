const mongoose = require("mongoose");
const { getNextSequence } = require("../utils/sequence");

const documentSchema = new mongoose.Schema(
  {
    documentID: {
      type: String,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    department: {
      type: String,
      required: true
    },
    sensitivityLevel: {
      type: String,
      enum: ["Public", "Internal", "Confidential", "Top Secret"],
      default: "Internal"
    },
    content: {
      type: String,
      default: ""
    },
    tags: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

documentSchema.pre("save", async function preSave(next) {
  if (this.isNew && !this.documentID) {
    let generatedId;
    let exists = true;
    while (exists) {
      const seq = await getNextSequence("documentID");
      generatedId = `DOC${String(seq).padStart(3, "0")}`;
      // eslint-disable-next-line no-await-in-loop
      exists = Boolean(await this.constructor.exists({ documentID: generatedId }));
    }
    this.documentID = generatedId;
  }
  next();
});

module.exports = mongoose.model("Document", documentSchema);
