const { ObjectId } = require("mongodb");
const { collections } = require("../db");

// Stripe session থেকে payment save করে। বারবার চালালেও একবারই save হয়।
async function savePayment(session) {
  if (session.payment_status !== "paid") return null;

  const bookingId = session.metadata?.bookingId;
  if (!bookingId || !ObjectId.isValid(bookingId)) return null;

  const booking = await collections.bookings.findOne({
    _id: new ObjectId(bookingId),
  });
  if (!booking) return null;

  const payment = {
    bookingId: String(booking._id),
    serviceTitle: booking.serviceTitle,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,
    amount: session.amount_total / 100,
    currency: "usd",
    transactionId: session.payment_intent,
    stripeSessionId: session.id,
    paymentStatus: "paid",
    paidAt: new Date(),
  };

  try {
    await collections.payments.insertOne(payment);
  } catch (error) {
    // 11000 = duplicate key: payment আগেই save হয়ে গেছে, তাই এটা error না
    if (error.code !== 11000) throw error;
  }

  // booking এখনো unpaid থাকলেই paid করা (বারবার চালালে ক্ষতি নেই)
  await collections.bookings.updateOne(
    { _id: booking._id, paymentStatus: "unpaid" },
    { $set: { paymentStatus: "paid" } }
  );

  return collections.payments.findOne({ bookingId: String(booking._id) });
}

module.exports = savePayment;