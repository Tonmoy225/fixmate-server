const express = require("express");
const { ObjectId } = require("mongodb");
const { collections } = require("../db");
const { verifyToken, verifyTechnician } = require("../middleware/auth");

const router = express.Router();

const categories = [
  "Smartphone",
  "Laptop & PC",
  "AC",
  "Refrigerator",
  "TV",
  "Washing Machine",
  "Electrical",
];
const serviceModes = ["Home Visit", "Shop Drop-off"];

// service-এর ফিল্ড যাচাই করে। ভুল থাকলে error লেখা ফেরত দেয়, ঠিক থাকলে null
const validateService = (body) => {
  const { title, category, description, image, basePrice, estimatedDuration, serviceMode, serviceArea } = body;

  if (!title || !title.trim()) return "Title is required";
  if (!categories.includes(category)) return "Select a valid category";
  if (!description || !description.trim()) return "Description is required";
  if (!image || !image.trim()) return "Service image is required";
  if (!(Number(basePrice) > 0)) return "Base price must be a positive number";
  if (!estimatedDuration || !estimatedDuration.trim()) return "Estimated duration is required";
  if (!serviceModes.includes(serviceMode)) return "Select a valid service mode";
  if (!serviceArea || !serviceArea.trim()) return "Service area is required";

  return null;
};

// body থেকে শুধু অনুমতি দেওয়া ফিল্ড নেওয়া (approvalStatus ইত্যাদি client থেকে নেওয়া হবে না)
const pickServiceFields = (body) => ({
  title: body.title.trim(),
  category: body.category,
  description: body.description.trim(),
  image: body.image.trim(),
  basePrice: Number(body.basePrice),
  estimatedDuration: body.estimatedDuration.trim(),
  serviceMode: body.serviceMode,
  serviceArea: body.serviceArea.trim(),
});

// GET /api/services?search=&category=&serviceMode=&sort=&page=&limit=  (Public)
router.get("/", async (req, res) => {
  try {
    const { search, category, serviceMode, sort } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 12, 50);

    const query = { approvalStatus: "approved", isAvailable: true };

    if (category) {
      query.category = category;
    }

    if (serviceMode) {
      query.serviceMode = serviceMode;
    }

    if (search) {
      const text = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { title: { $regex: text, $options: "i" } },
        { category: { $regex: text, $options: "i" } },
      ];
    }

    let sortOption = { createdAt: -1 };
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
  } catch (error) {
    console.error("GET /api/services error:", error.message);
    res.status(500).send({ message: "Failed to load services" });
  }
});

// GET /api/services/mine  (technician-এর নিজের সব service, যেকোনো status-এর)
router.get("/mine", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const services = await collections.services
      .find({ technicianEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(services);
  } catch (error) {
    console.error("GET /api/services/mine error:", error.message);
    res.status(500).send({ message: "Failed to load your services" });
  }
});

// POST /api/services  (technician: নতুন service, pending অবস্থায়)
router.post("/", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const errorMessage = validateService(req.body);
    if (errorMessage) {
      return res.status(400).send({ message: errorMessage });
    }

    const service = {
      ...pickServiceFields(req.body),
      // technician-এর নাম আর email database-এর user থেকে, client থেকে না
      technicianName: req.user.name,
      technicianEmail: req.user.email,
      approvalStatus: "pending",
      isAvailable: true,
      createdAt: new Date(),
    };

    const result = await collections.services.insertOne(service);
    res.status(201).send({
      message: "Service added and waiting for admin approval",
      serviceId: result.insertedId,
    });
  } catch (error) {
    console.error("POST /api/services error:", error.message);
    res.status(500).send({ message: "Failed to add service" });
  }
});

// PATCH /api/services/:id/availability  (on/off, approval বদলায় না)
router.patch("/:id/availability", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: "Service not found" });
    }
    if (typeof req.body.isAvailable !== "boolean") {
      return res.status(400).send({ message: "isAvailable must be true or false" });
    }

    // _id আর technicianEmail দুটোই মেলাচ্ছি, তাই অন্যের service বদলানো যাবে না
    const result = await collections.services.updateOne(
      { _id: new ObjectId(id), technicianEmail: req.user.email },
      { $set: { isAvailable: req.body.isAvailable } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send({ message: "Availability updated" });
  } catch (error) {
    console.error("PATCH availability error:", error.message);
    res.status(500).send({ message: "Failed to update availability" });
  }
});

// PATCH /api/services/:id  (edit করলে approvalStatus আবার pending)
router.patch("/:id", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: "Service not found" });
    }

    const errorMessage = validateService(req.body);
    if (errorMessage) {
      return res.status(400).send({ message: errorMessage });
    }

    const result = await collections.services.updateOne(
      { _id: new ObjectId(id), technicianEmail: req.user.email },
      { $set: { ...pickServiceFields(req.body), approvalStatus: "pending" } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send({ message: "Service updated and sent for approval again" });
  } catch (error) {
    console.error("PATCH /api/services/:id error:", error.message);
    res.status(500).send({ message: "Failed to update service" });
  }
});

// DELETE /api/services/:id
router.delete("/:id", verifyToken, verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: "Service not found" });
    }

    const result = await collections.services.deleteOne({
      _id: new ObjectId(id),
      technicianEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send({ message: "Service deleted" });
  } catch (error) {
    console.error("DELETE /api/services/:id error:", error.message);
    res.status(500).send({ message: "Failed to delete service" });
  }
});

// GET /api/services/:id  (Public)
router.get("/:id", async (req, res) => {
  try {
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

    const technician = await collections.users.findOne(
      { email: service.technicianEmail },
      { projection: { name: 1, image: 1, area: 1, bio: 1 } }
    );

    res.send({ ...service, technician });
  } catch (error) {
    console.error("GET /api/services/:id error:", error.message);
    res.status(500).send({ message: "Failed to load service" });
  }
});

module.exports = router;