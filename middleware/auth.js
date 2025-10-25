const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized - No token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized - Invalid token" });
  }
};

exports.admin = async (req, res, next) => {
  try {
    // Double-check user's role directly from database
    const user = await User.findById(req.user._id).select('role');
    if (user && user.role === "admin") {
      next();
    } else {
      res.status(403).json({ message: "Not authorized as admin" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error verifying admin status" });
  }
};