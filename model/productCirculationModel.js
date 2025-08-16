const mongoose = require('mongoose');

const productCirculationSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    product_code: { type: String, required: true },
    product_name: { type: String, required: true },
    imageUrl: { type: String },
    warehouse_from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    shelf_from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shelf',
      required: true
    },
    warehouse_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    shelf_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shelf',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('productCirculation', productCirculationSchema);
