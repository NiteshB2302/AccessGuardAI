const dotenv = require("dotenv");
dotenv.config();

const connectMongoDB = require("../database/mongodb_connection");
const User = require("./models/User");
const Counter = require("./models/Counter");

const USERS = [
  {
    employeeID: "ADM001",
    name: "Nitesh Gupta",
    email: "admin@accessguard.ai",
    password: "Admin@123",
    role: "Admin",
    department: "Security"
  },
  {
    employeeID: "EMP000",
    name: "Riya Sharma",
    email: "hr@accessguard.ai",
    password: "Hr@123456",
    role: "HR Manager",
    department: "HR"
  },
  {
    employeeID: "EMP001",
    name: "Arjun Mehta",
    email: "engineering@accessguard.ai",
    password: "Emp@123456",
    role: "Employee",
    department: "Engineering"
  },
  {
    employeeID: "EMP002",
    name: "Kavya Iyer",
    email: "finance@accessguard.ai",
    password: "Emp@123456",
    role: "Employee",
    department: "Finance"
  },
  {
    employeeID: "EMP003",
    name: "Aman Verma",
    email: "operations@accessguard.ai",
    password: "Emp@123456",
    role: "Employee",
    department: "Operations"
  }
];

async function resetUsers() {
  await connectMongoDB();

  await User.deleteMany({});

  for (const user of USERS) {
    // Use create() so password hashing middleware runs.
    // eslint-disable-next-line no-await-in-loop
    await User.create(user);
  }

  await Counter.updateOne(
    { _id: "employeeID" },
    { $set: { seq: 3 } },
    { upsert: true }
  );

  // eslint-disable-next-line no-console
  console.log("Users reset complete. Active accounts:");

  USERS.forEach((user) => {
    // eslint-disable-next-line no-console
    console.log(`- ${user.employeeID} | ${user.role} | ${user.email}`);
  });

  process.exit(0);
}

resetUsers().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("User reset failed:", error.message);
  process.exit(1);
});