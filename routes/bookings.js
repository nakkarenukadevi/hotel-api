const express = require("express");
const Booking = require("../models/Booking");
const Room = require("../models/Room");
const { protect, admin } = require("../middleware/auth");
const router = express.Router();

// Get all bookings (admin only)
router.get("/", protect, admin, async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate("user", "name email")
      .populate("room", "roomNumber type price");
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get user's bookings
router.get("/my-bookings", protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id }).populate(
      "room",
      "roomNumber type price"
    );
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Create new booking
router.post("/", protect, async (req, res) => {
  try {
    const { roomId, checkIn, checkOut } = req.body;

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const now = new Date();

    // Remove time part for current date for fair comparison
    now.setHours(0, 0, 0, 0);

    // Validate date formats
    if (
      checkInDate.toString() === "Invalid Date" ||
      checkOutDate.toString() === "Invalid Date"
    ) {
      return res
        .status(400)
        .json({ message: "Invalid date format. Please use YYYY-MM-DD format" });
    }

    // Check if check-in date is in the future
    if (checkInDate < now) {
      return res
        .status(400)
        .json({ message: "Check-in date must be in the future" });
    }

    // Check if check-out date is after check-in date
    if (checkOutDate <= checkInDate) {
      return res
        .status(400)
        .json({ message: "Check-out date must be after check-in date" });
    }

    // Check if room exists and is available
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Check if room is already booked for the given dates
    const existingBooking = await Booking.findOne({
      room: roomId,
      status: "confirmed",
      $or: [
        {
          checkIn: { $lte: new Date(checkOut) },
          checkOut: { $gte: new Date(checkIn) },
        },
      ],
    });

    if (existingBooking) {
      return res
        .status(400)
        .json({ message: "Room is already booked for these dates" });
    }

    // Calculate total price
    const numberOfDays = Math.ceil(
      (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
    );
    const totalPrice = numberOfDays * room.price;

    // Create booking
    const booking = await Booking.create({
      user: req.user._id,
      room: roomId,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      totalPrice,
      status: "confirmed",
    });

    const populatedBooking = await booking.populate(
      "room",
      "roomNumber type price"
    );
    res.status(201).json(populatedBooking);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Cancel booking
router.put("/:id/cancel", protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check if user owns this booking or is admin
    if (
      booking.user.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    booking.status = "cancelled";
    await booking.save();

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;