// models/expenseLogModel.js
const mongoose = require('mongoose');

const NotaSchema = new mongoose.Schema(
  {
    key: { type: String },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ExpenseLogDetailSchema = new mongoose.Schema(
  {
    purpose: { type: String, required: true },
    category: { type: String, required: true },

    quantity: { type: Number, required: true, min: 0 },
    unit_price: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    aktual: { type: Number, required: true, min: 0, default: 0 },

    nota: { type: NotaSchema, required: false }
  },
  { _id: true, timestamps: false }
);

const expenseLogSchema = new mongoose.Schema(
  {
    voucher_number: { type: String, required: true }, // PDxxx (1 log per voucher)
    payment_voucher: { type: String, default: null }, // PVxxx

    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RAP',
      required: true
    },

    expense_type: { type: String, required: true },

    details: { type: [ExpenseLogDetailSchema], default: [] },

    request_date: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null }
  },
  { timestamps: true }
);

// Index penting untuk performa & operasi batch
expenseLogSchema.index({ voucher_number: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseLog', expenseLogSchema);
