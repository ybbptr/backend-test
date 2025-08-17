const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  staff_name: { type: String, required: true },
  position: { type: String, required: true },
  imgUrl: { type: String },
  gif: { type: String },
  description: { type: String }
});

module.exports = mongoose.model('Staff', staffSchema);
