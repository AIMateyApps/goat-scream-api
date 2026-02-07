const mongoose = require('mongoose');

const goatScreamSchema = new mongoose.Schema({
  // Basic Information
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  source_type: {
    type: String,
    enum: [
      'movie',
      'viral_video',
      'tv_show',
      'farm_recording',
      'meme',
      'ai_generated',
      'user_submission',
    ],
    required: true,
  },

  // Temporal Data
  year: { type: Number, index: true },
  date_added: { type: Date, default: Date.now },
  timestamp: String,

  // Source Details
  source: {
    title: String,
    platform: String,
    url: String,
    director: String,
    creator: String,
    farm_location: String,
  },

  // Goat Information
  goat: {
    breed: String,
    age: String,
    name: String,
    color: String,
  },

  // Audio Characteristics
  audio: {
    duration: { type: Number, required: true },
    intensity: { type: Number, min: 1, max: 10, index: true },
    peak_decibels: Number,
    dominant_frequency: Number,
    category: {
      type: String,
      enum: ['short_burst', 'prolonged', 'multiple', 'melodic'],
    },
  },

  // Acoustic Analysis
  analysis: {
    descriptor: String,
    vibe: String,
    tags: [String],
    primary_note: String,
    tones_in_order: [String],
    intensity_override: { type: Number, min: 1, max: 10 },
  },

  // Media Files
  media: {
    audio: {
      mp3: { high: String, medium: String, low: String },
      wav: { high: String, medium: String, low: String },
      ogg: { high: String, medium: String, low: String },
    },
    video: {
      '1080p': String,
      '720p': String,
      '480p': String,
      '360p': String,
      gif: String,
    },
    thumbnail: String,
  },

  // Fun Metadata
  tags: [String],
  meme_status: {
    type: String,
    enum: ['legendary', 'viral', 'classic', 'emerging', 'underground'],
  },
  remix_count: { type: Number, default: 0 },
  context: String,

  // Engagement Metrics
  stats: {
    api_calls: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 },
    daily_hits: { type: Number, default: 0 },
    last_accessed_date: { type: String },
    last_accessed_at: { type: Date },
  },

  // Moderation
  approved: { type: Boolean, default: true },

  // Audit Metadata
  audit: {
    audited: { type: Boolean, default: false },
    good: { type: Boolean, default: false },
    bad_not_scream: { type: Boolean, default: false },
    bad_bad_edit: { type: Boolean, default: false },
    other_issue: { type: Boolean, default: false },
    needs_follow_up: { type: Boolean, default: false },
    comments: String,
    updated_at: Date,
  },

  // Licensing & Curation
  license: {
    type: {
      type: String,
    },
    url: String,
    attribution_required: { type: Boolean, default: false },
    attribution_text: String,
    notes: String,
  },
  last_curated_at: Date,
});

// Indexes for common queries
goatScreamSchema.index({ year: 1, intensity: -1 });
goatScreamSchema.index({ 'source.platform': 1 });
goatScreamSchema.index({ meme_status: 1 });
goatScreamSchema.index({ 'audio.category': 1 });

module.exports = mongoose.model('GoatScream', goatScreamSchema);
