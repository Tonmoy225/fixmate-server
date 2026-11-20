const express = require("express");
const { ObjectId } = require("mongodb");
const { collections } = require("../db");

const router = express.Router();

// GET /api/services?search=&category=&serviceMode=&sort=&page=&limit=
router.get("/", async (req, res) => {
  const { search, category, serviceMode, sort } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 12, 50);

  // only approved + available services are public
  const query = { approvalStatus: "approved", isAvailable: true };

  if (category) {
    query.category = category;
  }

  if (serviceMode) {
    query.serviceMode = serviceMode;
  }

  if (search) {
    // escape special characters so the search text is treated as plain text
    const text = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { title: { $regex: text, $options: "i" } },
      { category: { $regex: text, $options: "i" } },
    ];
  }

  let sortOption = { createdAt: -1 }; // newest (default)
  if (sort === "price-asc") sortOption = { basePrice: 1 };
  if (sort === "price-desc") sortOption = { basePrice: -1 };

  const total = await collections.services.countDocuments(query);
  const services = await collections.services
    .find(query)
    .sort(sortOption)
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  res.send({
    services,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/services/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: "Service not found" });
  }

  const service = await collections.services.findOne({
    _id: new ObjectId(id),
    approvalStatus: "approved",
    isAvailable: true,
  });

  if (!service) {
    return res.status(404).send({ message: "Service not found" });
  }

  res.send(service);
});

module.exports = router;