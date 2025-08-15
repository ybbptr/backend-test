const mongoose = require('mongoose');

const shelfSchema = new mongoose.Schema({
  shelf_name: { type: String, required: true },
  shelf_code: { type: String, unique: true, trim: true, required: true },
  description: { type: String },
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  }
});

module.exports = mongoose.model('Shelf', shelfSchema);
