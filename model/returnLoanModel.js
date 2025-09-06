const mongoose = require('mongoose');

const returnedItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  product_code: { type: String, required: true },
  brand: { type: String, required: true },
  quantity: { type: Number, required: true },
  warehouse_return: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  shelf_return: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shelf',
    default: null
  },
  condition_new: {
    type: String,
    enum: ['Baik', 'Rusak', 'Maintenance']
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    default: null
  },
  proof_image: {
    key: { type: String },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  }
});

const returnLoanSchema = new mongoose.Schema(
  {
    loan_number: { type: String, required: true },
    borrower: { type: String, required: true },
    position: { type: String, required: true },
    report_date: { type: Date, default: Date.now }, // tanggal laporan
    return_date: { type: Date, default: Date.now }, // tanggal pengembalian
    inventory_manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    returned_items: [returnedItemSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReturnLoan', returnLoanSchema);
