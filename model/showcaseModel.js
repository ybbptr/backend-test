const mongoose = require('mongoose');

const showcaseSchema = new mongoose.Schema({
  project_name: { type: String, required: true },
  location: { type: String, required: true },
  imgUrl: { type: String },
  date_start: { type: String },
  date_end: { type: String }
});

module.exports = mongoose.model('Showcase', showcaseSchema);
