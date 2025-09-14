const mongoose = require('mongoose');

const pvItemSchema = new mongoose.Schema(
  {
    purpose: { type: String, required: true },
    category: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, required: true },
    amount: { type: Number, required: true }, // qty * unit_price
    aktual: { type: Number, default: 0 }, // realisasi
    nota: {
      key: String,
      contentType: String,
      size: Number,
      uploadedAt: { type: Date, default: Date.now }
    }
  },
  { _id: true }
);

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
    }, // finance (penerima sisa dana)

    status: {
      type: String,
      enum: ['Diproses', 'Ditolak', 'Disetujui'],
      default: 'Diproses'
    },

    items: [pvItemSchema],

    total_amount: { type: Number, default: 0 },
    total_aktual: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Auto hitung total setiap save
pvReportSchema.pre('save', function (next) {
  this.total_amount = this.items.reduce((sum, it) => sum + (it.amount || 0), 0);
  this.total_aktual = this.items.reduce((sum, it) => sum + (it.aktual || 0), 0);
  this.remaining = this.total_amount - this.total_aktual;

  if (this.remaining < 0) {
    return next(new Error('Remaining tidak boleh minus'));
  }
  next();
});

module.exports = mongoose.model('PVReport', pvReportSchema);
