const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  warehouse_code: { type: String, required: true, trim: true, unique: true },
  warehouse_name: { type: String, required: true },
  warehouse_image: {
    key: { type: String },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  },
  description: { type: String },
  shelves: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shelf'
    }
  ]
});

module.exports = mongoose.model('Warehouse', warehouseSchema);
