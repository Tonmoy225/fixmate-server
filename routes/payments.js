const express = require("express");
const { ObjectId } = require("mongodb");
const { collections } = require("../db");
const stripe = require("../lib/stripe");
const { verifyToken, verifyCustomer } = require("../middleware/auth");

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

module.exports = router;