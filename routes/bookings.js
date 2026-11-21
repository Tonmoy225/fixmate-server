const express = require("express");
const { ObjectId } = require("mongodb");
const { collections } = require("../db");
const { verifyToken, verifyCustomer } = require("../middleware/auth");

const router = express.Router();

// POST /api/bookings  (শুধু customer)
router.post("/", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const { serviceId, phone, address, preferredDate, problemDescription } =
      req.body;

    // ১. ফিল্ড যাচাই
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

    // ২. তারিখ আজকের বা ভবিষ্যতের হতে হবে
    // (timezone-এর ফারাকের জন্য এক দিনের ছাড় রাখা হয়েছে, client-এ আজকের তারিখ থেকেই বাছাই করা যায়)
    const date = new Date(preferredDate);
    const limit = new Date();
    limit.setUTCDate(limit.getUTCDate() - 1);
    limit.setUTCHours(0, 0, 0, 0);
    if (isNaN(date.getTime()) || date < limit) {
      return res
        .status(400)
        .send({ message: "Preferred date must be today or a future date" });
    }

    // ৩. service থাকতে হবে এবং approved + available হতে হবে
    const service = await collections.services.findOne({
      _id: new ObjectId(serviceId),
      approvalStatus: "approved",
      isAvailable: true,
    });
    if (!service) {
      return res.status(404).send({ message: "Service not found" });
    }

    // ৪. নিজের service-এ request করা যাবে না
    if (service.technicianEmail === req.user.email) {
      return res
        .status(403)
        .send({ message: "You cannot request your own service" });
    }

    // ৫. একই service-এ আগের কোনো active request থাকলে আটকাও
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

    // ৬. booking তৈরি (service আর technician-এর তথ্য কপি করে)
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

module.exports = router;