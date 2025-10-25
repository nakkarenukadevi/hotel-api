const express = require("express");
const Room = require("../models/Room");
const { protect, admin } = require("../middleware/auth");
const router = express.Router();

// Get all rooms (public)
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({});
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get single room (public)
router.get("/:id", async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Create room (admin only)
router.post("/", protect, admin, async (req, res) => {
  try {
    const { roomNumber, type, price, description, amenities } = req.body;
    const room = await Room.create({
      roomNumber,
      type,
      price,
      description,
      amenities,
    });
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update room (admin only)
router.put("/:id", protect, admin, async (req, res) => {
  try {
    const { roomNumber, type, price, description, amenities, isAvailable } =
      req.body;
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    room.roomNumber = roomNumber || room.roomNumber;
    room.type = type || room.type;
    room.price = price || room.price;
    room.description = description || room.description;
    room.amenities = amenities || room.amenities;
    room.isAvailable =
      isAvailable !== undefined ? isAvailable : room.isAvailable;

    const updatedRoom = await room.save();
    res.json(updatedRoom);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete room (admin only)
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    await room.deleteOne();
    res.json({ message: "Room removed" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;