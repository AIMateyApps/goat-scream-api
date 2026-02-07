const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true },
    title: { type: String, required: true },
    source: {
      title: String,
      url: String,
      platform: String,
      author: String,
    },
    context: String,
    year: Number,
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
      index: true,
    },
    analysis: mongoose.Schema.Types.Mixed,
    audio: {
      original_url: String,
      original_path: String,
      duration: Number,
      intensity: Number,
      category: String,
      cloudinary_url: String,
      waveform: [Number],
    },
    submitter_ip: String,
    cloudinary_public_id: String,
    goat_scream_id: String,
    review_notes: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

submissionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
