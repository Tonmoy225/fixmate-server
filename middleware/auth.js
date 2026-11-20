const jwt = require("jsonwebtoken");
const { collections } = require("../db");

// 401 if the token is missing or invalid
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.decoded = decoded; // { email, ... }
    next();
  });
};

// 403 if the user's role in the database does not match.
// The role is read from the database, so a role change by the admin works immediately.
const checkRole = (role) => async (req, res, next) => {
  const user = await collections.users.findOne({ email: req.decoded.email });

  if (!user || user.role !== role) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  req.user = user;
  next();
};

const verifyCustomer = checkRole("customer");
const verifyTechnician = checkRole("technician");
const verifyAdmin = checkRole("admin");

module.exports = { verifyToken, verifyCustomer, verifyTechnician, verifyAdmin };