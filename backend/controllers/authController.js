const jwt = require("jsonwebtoken");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      employeeID: user.employeeID,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

async function bootstrapAdmin(req, res) {
  const usersCount = await User.countDocuments();
  if (usersCount > 0) {
    return res.status(400).json({
      message: "Users already exist. Bootstrap admin is disabled."
    });
  }

  const payload = {
    name: req.body.name || "Platform Admin",
    email: (req.body.email || "admin@accessguard.ai").toLowerCase(),
    password: req.body.password || "Admin@123",
    role: "Admin",
    department: req.body.department || "Security"
  };

  const admin = await User.create(payload);

  return res.status(201).json({
    message: "Admin account bootstrapped successfully.",
    employeeID: admin.employeeID,
    credentials: {
      email: payload.email,
      password: payload.password
    }
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  if (user.accountStatus === "Blocked") {
    return res.status(403).json({
      message: `Your account is blocked by security admin.${user.blockedReason ? ` Reason: ${user.blockedReason}` : ""}`
    });
  }

  await UserActivity.create({
    employeeID: user.employeeID,
    loginTime: new Date(),
    actionType: "login",
    timestamp: new Date(),
    department: user.department
  });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      employeeID: user.employeeID,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      accountStatus: user.accountStatus
    }
  });
}

async function getMe(req, res) {
  return res.json({ user: req.user });
}

module.exports = {
  bootstrapAdmin,
  login,
  getMe
};
