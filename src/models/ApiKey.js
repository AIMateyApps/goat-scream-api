const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    tier: { type: String, enum: ['public', 'basic', 'pro'], default: 'basic' },
    quota_per_minute: { type: Number, default: 100 },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    last_used_at: Date,
    requests_today: { type: Number, default: 0 },
    last_request_date: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiKey', apiKeySchema);
