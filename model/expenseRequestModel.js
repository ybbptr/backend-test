// models/expenseRequestModel.js
const mongoose = require('mongoose');

const detailSchema = new mongoose.Schema(
  {
    purpose: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    is_overbudget: { type: Boolean, default: false }
  },
  { _id: false }
);

const expenseRequestSchema = new mongoose.Schema(
  {
    name: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RAP',
      required: true
    },

    voucher_number: { type: String, required: true },
    voucher_prefix: {
      type: String,
      enum: ['PDLAP', 'PDOFC', 'PDPYR'],
      required: true
    },

    expense_type: {
      type: String,
      enum: [
        'Persiapan Pekerjaan',
        'Operasional Lapangan',
        'Operasional Tenaga Ahli',
        'Sewa Alat',
        'Operasional Lab',
        'Pajak',
        'Biaya Lain'
      ],
      required: true
    },

    submission_date: { type: Date, default: Date.now },
    method: { type: String, enum: ['Transfer', 'Tunai'], required: true },

    bank_account_number: { type: String, trim: true },
    bank: { type: String },
    bank_branch: { type: String, trim: true },
    bank_account_holder: { type: String, trim: true },

    description: { type: String, trim: true },
    details: { type: [detailSchema], default: [] },
    total_amount: { type: Number, required: true },

    status: {
      type: String,
      enum: ['Diproses', 'Disetujui', 'Ditolak'],
      default: 'Diproses'
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null
    },
    paid_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null
    },

    request_status: {
      type: String,
      enum: ['Aktif', 'Selesai', 'Pending', 'Ditolak'],
      default: 'Pending'
    },
    payment_voucher: { type: String, default: null },

    note: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

// indeks untuk cegah duplikasi nomor
expenseRequestSchema.index({ voucher_number: 1 }, { unique: true });
expenseRequestSchema.index(
  { payment_voucher: 1 },
  {
    unique: true,
    partialFilterExpression: { payment_voucher: { $type: 'string' } }
  }
);

module.exports = mongoose.model('ExpenseRequest', expenseRequestSchema);
