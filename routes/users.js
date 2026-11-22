const express = require("express");
const { collections } = require("../db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// PATCH /api/users/profile  (লগইন করা যেকোনো user, শুধু নিজের profile)
router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const { name, phone, area, bio, image } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).send({ message: "Name is required" });
    }
    if (phone && !/^[0-9+\-\s]{10,15}$/.test(phone.trim())) {
      return res.status(400).send({ message: "Enter a valid phone number" });
    }
    if (bio && bio.length > 300) {
      return res.status(400).send({ message: "Bio must be 300 characters or less" });
    }
    if (image && !/^https:\/\//.test(image.trim())) {
      return res.status(400).send({ message: "Invalid image URL" });
    }

    // শুধু এই চারটা ফিল্ড (আর ছবি) বদলাবে। email আর role কখনো না।
    const changes = {
      name: name.trim(),
      phone: (phone || "").trim(),
      area: (area || "").trim(),
      bio: (bio || "").trim(),
      updatedAt: new Date(),
    };
    if (image) changes.image = image.trim();

    // কার profile বদলাবে সেটা token-এর email থেকে, body থেকে না
    const result = await collections.users.updateOne(
      { email: req.decoded.email },
      { $set: changes }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send({ message: "Profile updated" });
  } catch (error) {
    console.error("PATCH /api/users/profile error:", error.message);
    res.status(500).send({ message: "Failed to update profile" });
  }
});

module.exports = router;