// models/inventoryModel.js
const mongoose = require('mongoose');

const CONDITIONS = ['Baik', 'Rusak', 'Maintenance', 'Hilang'];

const inventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    shelf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shelf',
      required: true
    },

    condition: {
      type: String,
      enum: CONDITIONS,
      default: 'Baik'
    },

    on_hand: { type: Number, default: 0, min: 0 },
    on_loan: { type: Number, default: 0, min: 0 },

    last_in_at: { type: Date },
    last_out_at: { type: Date }
  },
  { timestamps: true }
);

inventorySchema.index(
  { product: 1, warehouse: 1, shelf: 1, condition: 1 },
  { unique: true }
);

module.exports = mongoose.model('Inventory', inventorySchema);
module.exports.CONDITIONS = CONDITIONS;
