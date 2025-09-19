const mongoose = require('mongoose');

const NotaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const pvItemSchema = new mongoose.Schema(
  {
    purpose: { type: String, required: true },
    category: { type: String, required: true },

    quantity: { type: Number, required: true, min: 0 },
    unit_price: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 }, // dari ExpenseRequest

    aktual: { type: Number, default: 0, min: 0 }, // realisasi
    overbudget: { type: Boolean, default: false },

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

    nota: { type: NotaSchema, required: true }
  },
  { _id: true }
);

pvItemSchema.pre('save', function (next) {
  this.overbudget = (Number(this.aktual) || 0) > (Number(this.amount) || 0);
  next();
});

const pvReportSchema = new mongoose.Schema(
  {
    pv_number: { type: String, required: true }, // ExpenseRequest.payment_voucher
    voucher_number: { type: String, required: true }, // ExpenseRequest.voucher_number
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
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null
    },

    status: {
      type: String,
      enum: ['Diproses', 'Ditolak', 'Disetujui'],
      default: 'Diproses'
    },
    note: { type: String, default: null },

    items: { type: [pvItemSchema], default: [] },

    total_amount: { type: Number, default: 0 },
    total_aktual: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    has_overbudget: { type: Boolean, default: false }
  },
  { timestamps: true }
);

pvReportSchema.pre('save', function (next) {
  const items = Array.isArray(this.items) ? this.items : [];
  this.total_amount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  this.total_aktual = items.reduce((s, it) => s + (Number(it.aktual) || 0), 0);
  this.remaining = this.total_amount - this.total_aktual;
  this.has_overbudget = items.some(
    (it) => (Number(it.aktual) || 0) > (Number(it.amount) || 0)
  );
  if (this.status !== 'Ditolak') this.note = null;
  next();
});

pvReportSchema.index({
  pv_number: 1,
  voucher_number: 1,
  status: 1
});

module.exports = mongoose.model('PVReport', pvReportSchema);
