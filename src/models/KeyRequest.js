const mongoose = require('mongoose');

const keyRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    intended_use: { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('KeyRequest', keyRequestSchema);
