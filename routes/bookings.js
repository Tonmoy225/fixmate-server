const express = require("express");
const { ObjectId } = require("mongodb");
const { collections } = require("../db");
const {
  verifyToken,
  verifyCustomer,
  verifyTechnician,
} = require("../middleware/auth");

const router = express.Router();

// কোন status থেকে কোন status-এ যাওয়া যাবে (technician-এর জন্য)
const technicianTransitions = {
  requested: ["accepted", "rejected"],
  accepted: ["in-progress"],
  "in-progress": ["completed"],
};

// POST /api/bookings  (শুধু customer)
router.post("/", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const { serviceId, phone, address, preferredDate, problemDescription } =
      req.body;

    if (!ObjectId.isValid(serviceId)) {
      return res.status(400).send({ message: "Invalid service" });
    }
    if (!phone || !/^[0-9+\-\s]{10,15}$/.test(phone.trim())) {
      return res.status(400).send({ message: "Enter a valid phone number" });
    }
    if (!address || !address.trim()) {
      return res.status(400).send({ message: "Address is required" });
    }
    if (!problemDescription || problemDescription.trim().length < 20) {
      return res
        .status(400)
        .send({ message: "Problem description must be at least 20 characters" });
    }

    const date = new Date(preferredDate);
    const limit = new Date();
    limit.setUTCDate(limit.getUTCDate() - 1);
    limit.setUTCHours(0, 0, 0, 0);
    if (isNaN(date.getTime()) || date < limit) {
      return res
        .status(400)
        .send({ message: "Preferred date must be today or a future date" });
    }

    const service = await collections.services.findOne({
      _id: new ObjectId(serviceId),
      approvalStatus: "approved",
      isAvailable: true,
    });
    if (!service) {
      return res.status(404).send({ message: "Service not found" });
    }

    if (service.technicianEmail === req.user.email) {
      return res
        .status(403)
        .send({ message: "You cannot request your own service" });
    }

    const activeBooking = await collections.bookings.findOne({
      serviceId: String(service._id),
      customerEmail: req.user.email,
      status: { $in: ["requested", "accepted", "in-progress"] },
    });
    if (activeBooking) {
      return res
        .status(409)
        .send({ message: "You already have an active request for this service" });
    }

    const now = new Date();
    const booking = {
      serviceId: String(service._id),
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: phone.trim(),
      address: address.trim(),
      preferredDate: date,
      problemDescription: problemDescription.trim(),
      status: "requested",
      finalAmount: service.basePrice,
      paymentStatus: "unpaid",
      statusHistory: [{ status: "requested", changedAt: now }],
      createdAt: now,
    };

    const result = await collections.bookings.insertOne(booking);
    res.status(201).send({ message: "Request sent", bookingId: result.insertedId });
  } catch (error) {
    console.error("POST /api/bookings error:", error.message);
    res.status(500).send({ message: "Failed to create booking" });
  }
});

// PATCH /api/bookings/:id/status  (শুধু job-এর মালিক technician)
router.patch("/:id/status", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, finalAmount } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: "Booking not found" });
    }

    // _id আর technicianEmail দুটোই মেলাচ্ছি, তাই অন্যের job ছোঁয়া যাবে না
    const booking = await collections.bookings.findOne({
      _id: new ObjectId(id),
      technicianEmail: req.user.email,
    });
    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    // এই status থেকে পরের কোন কোন status-এ যাওয়া যায়
    const allowed = technicianTransitions[booking.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).send({
        message: `Cannot change status from ${booking.status} to ${status}`,
      });
    }

    const changes = { status };

    // completed করতে হলে final amount দিতে হবে (০ এর বেশি সংখ্যা)
    if (status === "completed") {
      const amount = Number(finalAmount);
      if (!(amount > 0)) {
        return res
          .status(400)
          .send({ message: "Final amount must be a number greater than 0" });
      }
      changes.finalAmount = amount;
    }

    // filter-এ আগের status-ও রাখা হয়েছে: একই সময়ে দুইবার চাপলেও একবারই কাজ করবে
    const result = await collections.bookings.updateOne(
      { _id: booking._id, status: booking.status },
      {
        $set: changes,
        $push: { statusHistory: { status, changedAt: new Date() } },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(409)
        .send({ message: "Booking was updated already, please refresh" });
    }

    res.send({ message: `Booking marked as ${status}` });
  } catch (error) {
    console.error("PATCH booking status error:", error.message);
    res.status(500).send({ message: "Failed to update booking status" });
  }
});

// PATCH /api/bookings/:id/cancel  (শুধু নিজের booking, শুধু requested অবস্থায়)
router.patch("/:id/cancel", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: "Booking not found" });
    }

    const booking = await collections.bookings.findOne({
      _id: new ObjectId(id),
      customerEmail: req.user.email,
    });
    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    if (booking.status !== "requested") {
      return res.status(400).send({
        message: "Only a requested booking can be cancelled",
      });
    }

    const result = await collections.bookings.updateOne(
      { _id: booking._id, status: "requested" },
      {
        $set: { status: "cancelled" },
        $push: { statusHistory: { status: "cancelled", changedAt: new Date() } },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(409)
        .send({ message: "Booking was updated already, please refresh" });
    }

    res.send({ message: "Booking cancelled" });
  } catch (error) {
    console.error("PATCH booking cancel error:", error.message);
    res.status(500).send({ message: "Failed to cancel booking" });
  }
});


// GET /api/bookings/my  (customer: শুধু নিজের booking)
router.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const bookings = await collections.bookings
      .find({ customerEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(bookings);
  } catch (error) {
    console.error("GET /api/bookings/my error:", error.message);
    res.status(500).send({ message: "Failed to load your bookings" });
  }
});

// GET /api/bookings/technician?status=  (technician: শুধু নিজের job)
router.get("/technician", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const validStatuses = [
      "requested",
      "accepted",
      "rejected",
      "in-progress",
      "completed",
      "cancelled",
    ];

    const query = { technicianEmail: req.user.email };

    // status দিলে এবং সেটা সঠিক হলে filter হবে, "all" বা ভুল মান হলে সব আসবে
    if (req.query.status && validStatuses.includes(req.query.status)) {
      query.status = req.query.status;
    }

    const bookings = await collections.bookings
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(bookings);
  } catch (error) {
    console.error("GET /api/bookings/technician error:", error.message);
    res.status(500).send({ message: "Failed to load requests" });
  }
});

module.exports = router;
