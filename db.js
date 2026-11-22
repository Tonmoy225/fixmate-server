const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI);

// shared object, filled after connectDB() runs
const collections = {};

async function connectDB() {
  await client.connect();
  const db = client.db(process.env.DB_NAME);

  // BetterAuth stores users in the "user" collection, we use it as our users collection
  collections.users = db.collection("user");
  collections.services = db.collection("services");
  collections.bookings = db.collection("bookings");
  collections.payments = db.collection("payments");

  // the same Stripe session must never be saved twice
  await collections.payments.createIndex(
    { stripeSessionId: 1 },
    { unique: true }
  );
  // একটা booking-এর সর্বোচ্চ একটাই payment
  await collections.payments.createIndex({ bookingId: 1 }, { unique: true });

  console.log("MongoDB connected");
}

module.exports = { connectDB, collections };