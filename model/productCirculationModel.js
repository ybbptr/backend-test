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
    product_image: {
      key: { type: String },
      contentType: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date, default: Date.now }
    },

    warehouse_from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    shelf_from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shelf',
      default: null
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
    },
    moved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    moved_by_name: { type: String, required: true },
    return_loan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReturnLoan',
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProductCirculation', productCirculationSchema);
