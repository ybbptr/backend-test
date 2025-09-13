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
    quantity: { type: Number, required: true },
    condition: {
      type: String,
      enum: ['Baik', 'Rusak', 'Maintenance', 'Hilang'],
      required: true
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
      default: null
    },
    moved_by_id: { type: mongoose.Schema.Types.ObjectId, required: true },
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
