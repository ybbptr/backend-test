// model/expenseLogModel.js
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
    // optional link balik kalau mau trace
    er_detail_id: { type: mongoose.Schema.Types.ObjectId, required: false },

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

// Batch menyimpan jejak per-PVReport (per batch)
const ExpenseLogBatchItemSchema = new mongoose.Schema(
  {
    er_detail_id: { type: mongoose.Schema.Types.ObjectId, required: true },
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

const ExpenseLogBatchSchema = new mongoose.Schema(
  {
    pv_report: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PVReport',
      required: true
    },
    pv_number: { type: String, required: true },
    status: {
      type: String,
      enum: ['Diproses', 'Ditolak', 'Disetujui'],
      default: 'Diproses'
    },
    note: { type: String, default: null },
    items: { type: [ExpenseLogBatchItemSchema], default: [] },
    approved_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now }
  },
  { _id: true }
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

    // AGREGASI gabungan item APPROVED dari semua batch (untuk tampilan "flat/gabungan")
    details: { type: [ExpenseLogDetailSchema], default: [] },

    // HISTORI per-batch (PVReport)
    batches: { type: [ExpenseLogBatchSchema], default: [] },

    request_date: { type: Date, default: Date.now },

    // Selesai = semua item ER sdh approved (bukan per batch)
    completed_at: { type: Date, default: null }
  },
  { timestamps: true }
);

// Index penting
expenseLogSchema.index({ voucher_number: 1 }, { unique: true });
expenseLogSchema.index({ voucher_number: 1, 'batches.pv_report': 1 });
expenseLogSchema.index({ voucher_number: 1, 'batches.items.er_detail_id': 1 });

module.exports = mongoose.model('ExpenseLog', expenseLogSchema);
