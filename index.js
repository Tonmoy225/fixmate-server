require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");
const servicesRoutes = require("./routes/services");
const bookingsRoutes = require("./routes/bookings");
const adminRoutes = require("./routes/admin");
const paymentsRoutes = require("./routes/payments");
const webhookHandler = require("./routes/webhook");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [process.env.CLIENT_URL],
    credentials: true,
  })
);

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

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`FixMate server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });