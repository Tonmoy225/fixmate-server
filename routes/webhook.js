const stripe = require("../lib/stripe");
const savePayment = require("../lib/savePayment");

// Stripe-এর সরাসরি call, তাই JWT লাগে না। বদলে signature যাচাই হয়।
async function webhookHandler(req, res) {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body (express.raw দিয়ে)
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    try {
      await savePayment(event.data.object);
    } catch (error) {
      console.error("Webhook save error:", error.message);
      // 500 দিলে Stripe পরে আবার চেষ্টা করবে
      return res.status(500).send("Failed to save payment");
    }
  }

  res.send({ received: true });
}

module.exports = webhookHandler;