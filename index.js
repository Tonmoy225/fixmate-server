require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

const servicesRoutes = require("./routes/services");

const app = express();
const port = process.env.PORT || 5000;

const bookingsRoutes = require("./routes/bookings");

app.use(
  cors({
    origin: [process.env.CLIENT_URL],
    credentials: true,
  })
);
app.use(express.json());
const { verifyToken } = require("./middleware/auth");

app.get("/api/test", verifyToken, (req, res) => {
  res.send({ message: "Token OK", email: req.decoded.email });
});

app.get("/", (req, res) => {
  res.send("FixMate server is running");
});
app.use("/api/services", servicesRoutes);

app.use("/api/bookings", bookingsRoutes);

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`FixMate server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });