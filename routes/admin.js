const express = require("express");
const { ObjectId } = require("mongodb");
const { collections } = require("../db");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

const router = express.Router();

// এই router-এর সব route শুধু admin-এর জন্য
router.use(verifyToken, verifyAdmin);

const validRoles = ["customer", "technician", "admin"];
const validStatuses = [
  "requested",
  "accepted",
  "rejected",
  "in-progress",
  "completed",
  "cancelled",
];

// BetterAuth-এর user id ObjectId বা string, দুই রকম হতে পারে, তাই দুটোই মেলানো হয়
const userFilter = (id) =>
  ObjectId.isValid(id)
    ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
    : { _id: id };

// GET /api/admin/stats  (Overview-র stats আর chart-এর data)
router.get("/stats", async (req, res) => {
  try {
    const [totalUsers, totalTechnicians, pendingServices, statusGroups, revenueGroup] =
      await Promise.all([
        collections.users.countDocuments({}),
        collections.users.countDocuments({ role: "technician" }),
        collections.services.countDocuments({ approvalStatus: "pending" }),
        collections.bookings
          .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
          .toArray(),
        collections.payments
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray(),
      ]);

    // সব status-এর সংখ্যা, যে status-এ কিছু নেই সেখানে 0
    const bookingsByStatus = {};
    validStatuses.forEach((status) => (bookingsByStatus[status] = 0));
    statusGroups.forEach((group) => {
      bookingsByStatus[group._id] = group.count;
    });

    res.send({
      totalUsers,
      totalTechnicians,
      pendingServices,
      bookingsByStatus,
      totalRevenue: revenueGroup[0]?.total || 0,
    });
  } catch (error) {
    console.error("GET /api/admin/stats error:", error.message);
    res.status(500).send({ message: "Failed to load stats" });
  }
});

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const users = await collections.users
      .find(
        {},
        { projection: { name: 1, email: 1, image: 1, role: 1, createdAt: 1 } }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.send(users);
  } catch (error) {
    console.error("GET /api/admin/users error:", error.message);
    res.status(500).send({ message: "Failed to load users" });
  }
});

// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;

    if (!validRoles.includes(role)) {
      return res.status(400).send({ message: "Invalid role" });
    }

    const target = await collections.users.findOne(userFilter(req.params.id));
    if (!target) {
      return res.status(404).send({ message: "User not found" });
    }

    // admin নিজের role বদলাতে পারবে না
    if (target.email === req.user.email) {
      return res
        .status(403)
        .send({ message: "You cannot change your own role" });
    }

    await collections.users.updateOne({ _id: target._id }, { $set: { role } });

    res.send({ message: `${target.name} is now a ${role}` });
  } catch (error) {
    console.error("PATCH user role error:", error.message);
    res.status(500).send({ message: "Failed to update role" });
  }
});

// GET /api/admin/services?approvalStatus=  (pending সবার আগে)
router.get("/services", async (req, res) => {
  try {
    const query = {};
    if (["pending", "approved", "rejected"].includes(req.query.approvalStatus)) {
      query.approvalStatus = req.query.approvalStatus;
    }

    const services = await collections.services
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    // pending service গুলো উপরে আনা
    const rank = { pending: 0, approved: 1, rejected: 2 };
    services.sort((a, b) => rank[a.approvalStatus] - rank[b.approvalStatus]);

    res.send(services);
  } catch (error) {
    console.error("GET /api/admin/services error:", error.message);
    res.status(500).send({ message: "Failed to load services" });
  }
});

// PATCH /api/admin/services/:id/approval
router.patch("/services/:id/approval", async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: "Service not found" });
    }
    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res
        .status(400)
        .send({ message: "Status must be approved or rejected" });
    }

    const result = await collections.services.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approvalStatus } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send({ message: `Service ${approvalStatus}` });
  } catch (error) {
    console.error("PATCH service approval error:", error.message);
    res.status(500).send({ message: "Failed to update approval" });
  }
});

// GET /api/admin/bookings?status=
router.get("/bookings", async (req, res) => {
  try {
    const query = {};
    if (validStatuses.includes(req.query.status)) {
      query.status = req.query.status;
    }

    const bookings = await collections.bookings
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(bookings);
  } catch (error) {
    console.error("GET /api/admin/bookings error:", error.message);
    res.status(500).send({ message: "Failed to load bookings" });
  }
});

// GET /api/admin/payments  (সব transaction আর মোট revenue)
router.get("/payments", async (req, res) => {
  try {
    const payments = await collections.payments
      .find({})
      .sort({ paidAt: -1 })
      .toArray();

    const totalRevenue = payments.reduce(
      (sum, payment) => sum + (payment.amount || 0),
      0
    );

    res.send({ payments, totalRevenue });
  } catch (error) {
    console.error("GET /api/admin/payments error:", error.message);
    res.status(500).send({ message: "Failed to load payments" });
  }
});

module.exports = router;