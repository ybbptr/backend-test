const mongoose = require('mongoose');

const loanCirculationSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    product_name: { type: String, required: true },
    loan_quantity: { type: Number, default: 0, required: true },
    warehouse_from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    warehouse_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    loan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      required: true
    },
    imageUrl: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('loanCirculation', loanCirculationSchema);
