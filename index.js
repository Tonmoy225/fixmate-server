require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");
const servicesRoutes = require("./routes/services");
const bookingsRoutes = require("./routes/bookings");
const adminRoutes = require("./routes/admin");
const paymentsRoutes = require("./routes/payments");
const usersRoutes = require("./routes/users");
const webhookHandler = require("./routes/webhook");

const app = express();
const port = process.env.PORT || 5000;

// CLIENT_URL এ কমা দিয়ে একাধিক URL দেওয়া যায়: http://localhost:3000,https://your-site.vercel.app
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// database সংযোগ একবারই হবে (serverless-এ প্রতি request-এ নতুন করে না)
let dbPromise = null;
const ensureDB = (req, res, next) => {
  if (!dbPromise) {
    dbPromise = connectDB();
  }
  dbPromise
    .then(() => next())
    .catch((error) => {
      dbPromise = null;
      console.error("MongoDB connection failed:", error.message);
      res.status(500).send({ message: "Database connection failed" });
    });
};
app.use(ensureDB);

// webhook আগে, raw body সহ (express.json এর আগে হতেই হবে)
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  webhookHandler
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("FixMate server is running");
});

app.use("/api/services", servicesRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/users", usersRoutes);

// লোকাল কম্পিউটারে সরাসরি চালালে port খুলবে, Vercel-এ খুলবে না
if (require.main === module) {
  app.listen(port, () => {
    console.log(`FixMate server running on port ${port}`);
  });
}

module.exports = app;