const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomNumber: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    description: String,
    amenities: [String],
    isAvailable: {
      type: Boolean,
      default: true,
    },
    images: [String],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Room", roomSchema);