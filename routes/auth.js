const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { protect, admin } = require("../middleware/auth");
const router = express.Router();

// Rate limiter for forgot-password route
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 requests per window
  message:
    "Too many password reset requests from this IP, please try again later.",
});

// Helper: verify reCAPTCHA token if RECAPTCHA_SECRET is configured
async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // no recaptcha configured
  if (!token) return false;
  try {
    // Use global fetch (Node 18+). If not available, skip verification.
    if (typeof fetch !== "function") {
      console.warn(
        "global fetch not available; skipping recaptcha verification"
      );
      return true;
    }
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    const resp = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        body: params,
      }
    );
    const data = await resp.json();
    return data.success === true;
  } catch (err) {
    console.error("reCAPTCHA verification error", err);
    return false;
  }
}

// Register a new user (customer only)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new user
    const user = await User.create({
      name,
      email,
      password,
      role: "customer", // Force role to be customer for public registration
    });

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30m",
    });
    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30m",
    });
    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Forgot password - send reset link (generic response)
router.post("/forgot-password", forgotLimiter, async (req, res) => {
  try {
    const { email, recaptchaToken } = req.body;

    // If reCAPTCHA is configured, verify it first
    const recaptchaOk = await verifyRecaptcha(recaptchaToken);
    if (!recaptchaOk) {
      return res.status(400).json({ message: "reCAPTCHA verification failed" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Generic response to avoid email enumeration
      return res
        .status(200)
        .json({ message: "If that email exists, a reset link has been sent" });
    }

    // Create reset token and save (hashed token stored by method)
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/reset-password/${resetToken}`;

    // Send email (try transporter, but do not fail the whole request if mail not configured)
    try {
      if (!process.env.SMTP_HOST) throw new Error("SMTP not configured");

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const message = `You requested a password reset. Click the link to reset: ${resetURL}\nIf you did not request this, ignore this email.`;
      await transporter.sendMail({
        from: process.env.SMTP_FROM || "no-reply@example.com",
        to: user.email,
        subject: "Password reset",
        text: message,
      });
    } catch (mailErr) {
      console.warn("Could not send reset email:", mailErr.message);
      // In non-production, return the token in response to help local testing
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(200)
          .json({ message: "Password reset token (dev)", resetToken });
      }
    }

    return res
      .status(200)
      .json({ message: "If that email exists, a reset link has been sent" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});

// Reset password using token
router.post("/reset-password/:token", async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Token is invalid or has expired" });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Issue a new JWT so user is logged in immediately after reset
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30m",
    });
    return res.json({ message: "Password reset successful", token });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
});

// Create admin user (protected route, only existing admins can create new admins)
router.post("/register-admin", protect, admin, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create new admin user
    const user = await User.create({
      name,
      email,
      password,
      role: "admin",
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get current user profile
router.get("/me", protect, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all users (admin only)
router.get("/users", protect, admin, async (req, res) => {
  try {
    // Exclude password field
    const users = await User.find({}).select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
