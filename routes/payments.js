const express = require("express");
const { ObjectId } = require("mongodb");
const { collections } = require("../db");
const stripe = require("../lib/stripe");
const { verifyToken, verifyCustomer } = require("../middleware/auth");

const savePayment = require("../lib/savePayment");

const router = express.Router();

// POST /api/payments/create-checkout-session  (শুধু customer)
router.post(
  "/create-checkout-session",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    try {
      const { bookingId } = req.body;

      if (!ObjectId.isValid(bookingId)) {
        return res.status(400).send({ message: "Invalid booking" });
      }

      // booking database থেকে আনা হচ্ছে, আর শুধু এই customer-এর নিজের booking
      const booking = await collections.bookings.findOne({
        _id: new ObjectId(bookingId),
        customerEmail: req.user.email,
      });
      if (!booking) {
        return res.status(404).send({ message: "Booking not found" });
      }

      // payment gate: completed না হলে বা আগেই paid হলে আটকাও
      if (booking.status !== "completed") {
        return res
          .status(400)
          .send({ message: "You can pay only after the job is completed" });
      }
      if (booking.paymentStatus === "paid") {
        return res.status(409).send({ message: "This booking is already paid" });
      }

      // payment আগেই save হয়ে থাকলে (দ্বিতীয়বার আটকানো)
      const existingPayment = await collections.payments.findOne({
        bookingId: String(booking._id),
      });
      if (existingPayment) {
        return res.status(409).send({ message: "This booking is already paid" });
      }

      // amount শুধু database-এর finalAmount থেকে, cents-এ
      const amountInCents = Math.round(booking.finalAmount * 100);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: req.user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountInCents,
              product_data: {
                name: booking.serviceTitle,
                description: `Repair by ${booking.technicianName}`,
              },
            },
          },
        ],
        metadata: {
          bookingId: String(booking._id),
          customerEmail: req.user.email,
        },
        success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
      });

      res.send({ url: session.url });
    } catch (error) {
      console.error("Create checkout session error:", error.message);
      res.status(500).send({ message: "Failed to start payment" });
    }
  }
);


// GET /api/payments/verify?session_id=...  (success page এটা ডাকে)
router.get("/verify", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).send({ message: "Session id is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    // অন্য customer-এর session দিয়ে verify করা যাবে না
    if (session.metadata?.customerEmail !== req.user.email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).send({ message: "Payment is not completed" });
    }

    const payment = await savePayment(session);
    if (!payment) {
      return res.status(404).send({ message: "Booking not found" });
    }

    res.send({
      serviceTitle: payment.serviceTitle,
      amount: payment.amount,
      transactionId: payment.transactionId,
    });
  } catch (error) {
    console.error("Verify payment error:", error.message);
    res.status(500).send({ message: "Failed to verify payment" });
  }
});

// GET /api/payments/my  (customer: শুধু নিজের payment)
router.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const payments = await collections.payments
      .find({ customerEmail: req.user.email })
      .sort({ paidAt: -1 })
      .toArray();

    res.send(payments);
  } catch (error) {
    console.error("GET /api/payments/my error:", error.message);
    res.status(500).send({ message: "Failed to load payments" });
  }
});

module.exports = router;