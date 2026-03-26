const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { getNextSequence } = require("../utils/sequence");

const userSchema = new mongoose.Schema(
  {
    employeeID: {
      type: String,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 8
    },
    role: {
      type: String,
      enum: ["Admin", "HR Manager", "Employee"],
      default: "Employee"
    },
    accountStatus: {
      type: String,
      enum: ["Active", "Blocked"],
      default: "Active"
    },
    blockedReason: {
      type: String,
      default: null
    },
    blockedAt: {
      type: Date,
      default: null
    },
    blockedBy: {
      type: String,
      default: null
    },
    department: {
      type: String,
      required: true
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.pre("save", async function preSave(next) {
  if (this.isNew && !this.employeeID) {
    let generatedId;
    let exists = true;
    while (exists) {
      const seq = await getNextSequence("employeeID");
      generatedId = `EMP${String(seq).padStart(3, "0")}`;
      // Guard against sequence drift when pre-existing data exists.
      // eslint-disable-next-line no-await-in-loop
      exists = Boolean(await this.constructor.exists({ employeeID: generatedId }));
    }
    this.employeeID = generatedId;
  }

  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
