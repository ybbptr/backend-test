const mongoose = require('mongoose');

const stockChangeLogSchema = new mongoose.Schema(
  {
    inventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true
    },
    product_code: { type: String, required: true },
    brand: { type: String, required: true },

    change: { type: Number, required: true }, // contoh: -7 atau +7
    note: { type: String },

    changed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // selalu admin
      required: true
    },
    changed_by_name: { type: String, required: true } // simpan nama user
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockChangeLog', stockChangeLogSchema);
