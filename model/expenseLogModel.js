const mongoose = require('mongoose');

const expenseLogSchema = new mongoose.Schema(
  {
    voucher_number: { type: String, required: true, index: true }, // PDxxx
    payment_voucher: { type: String, required: true }, // PVxxx

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

    details: [
      {
        purpose: String,
        category: String,
        quantity: Number,
        unit_price: Number,
        amount: Number,
        aktual: { type: Number, default: 0 },
        nota: {
          key: String,
          contentType: String,
          size: Number,
          uploadedAt: Date
        }
      }
    ],
    request_date: { type: Date, default: Date.now },
    completed_at: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExpenseLog', expenseLogSchema);
