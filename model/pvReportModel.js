const mongoose = require('mongoose');

const pvItemSchema = new mongoose.Schema(
  {
    purpose: { type: String, required: true },
    category: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, required: true },
    amount: { type: Number, required: true }, // dari ExpenseRequest
    aktual: { type: Number, default: 0 }, // realisasi
    overbudget: { type: Boolean, default: false }, // flag otomatis
    nota: {
      key: String,
      contentType: String,
      size: Number,
      uploadedAt: { type: Date, default: Date.now }
    }
  },
  { _id: true }
);

// Flag per item
pvItemSchema.pre('save', function (next) {
  this.overbudget = this.aktual > this.amount;
  next();
});

const pvReportSchema = new mongoose.Schema(
  {
    pv_number: { type: String, required: true }, // dari ExpenseRequest.payment_voucher
    voucher_number: { type: String, required: true }, // dari ExpenseRequest.voucher_number
    report_date: { type: Date, default: Date.now },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RAP',
      required: true
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    }, // pembuat laporan
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null
    }, // finance penerima sisa dana

    status: {
      type: String,
      enum: ['Diproses', 'Ditolak', 'Disetujui'],
      default: 'Diproses'
    },

    note: {
      type: String,
      default: null
    }, // hanya dipakai kalau Ditolak

    items: [pvItemSchema],

    total_amount: { type: Number, default: 0 },
    total_aktual: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    has_overbudget: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Auto hitung total + flag global
pvReportSchema.pre('save', function (next) {
  this.total_amount = this.items.reduce((sum, it) => sum + (it.amount || 0), 0);
  this.total_aktual = this.items.reduce((sum, it) => sum + (it.aktual || 0), 0);
  this.remaining = this.total_amount - this.total_aktual;

  // global flag overbudget
  this.has_overbudget = this.items.some((it) => it.aktual > it.amount);

  // kalau status bukan Ditolak → reset note biar ga nyangkut
  if (this.status !== 'Ditolak') {
    this.note = null;
  }

  next();
});

module.exports = mongoose.model('PVReport', pvReportSchema);
