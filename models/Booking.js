const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    checkIn: {
      type: Date,
      required: true,
    },
    checkOut: {
      type: Date,
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Calculate total price before saving
bookingSchema.pre("save", async function (next) {
  if (this.isModified("checkIn") || this.isModified("checkOut")) {
    const numberOfDays = Math.ceil(
      (this.checkOut - this.checkIn) / (1000 * 60 * 60 * 24)
    );
    const room = await mongoose.model("Room").findById(this.room);
    this.totalPrice = numberOfDays * room.price;
  }
  next();
});

module.exports = mongoose.model("Booking", bookingSchema);