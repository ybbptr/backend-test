const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  staff_name: { type: String, required: true },
  position: { type: String, required: true },
  img: {
    key: { type: String },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  },
  gif: {
    key: { type: String },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  },
  description: { type: String }
});

module.exports = mongoose.model('Staff', staffSchema);
