const mongoose = require('mongoose');

const showcaseSchema = new mongoose.Schema(
  {
    project_name: { type: String, required: true },
    location: { type: String, required: true },
    img: {
      key: String,
      contentType: String,
      size: Number,
      uploadedAt: { type: Date, default: Date.now }
    },
    date_start: { type: String },
    date_end: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Showcase', showcaseSchema);
