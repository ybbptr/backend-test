// model/pvReportModel.js
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
    // Penanda item sumber di ER agar anti double-claim
    er_detail_id: { type: mongoose.Schema.Types.ObjectId, required: true },

    purpose: { type: String, required: true },
    category: { type: String, required: true },

    quantity: { type: Number, required: true, min: 0 },
    unit_price: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 }, // nilai dari ER

    aktual: { type: Number, default: 0, min: 0 }, // realisasi per batch
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
    // Satu PV (payment voucher) bisa punya banyak PVReport (batch)
    pv_number: { type: String, required: true }, // ExpenseRequest.payment_voucher
    voucher_number: { type: String, required: true }, // ExpenseRequest.voucher_number (PDxxx)
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

    status: {
      type: String,
      enum: ['Diproses', 'Disetujui', 'Ditolak'],
      default: 'Diproses'
    },
    note: { type: String, default: null },

    items: { type: [pvItemSchema], default: [] },

    total_amount: { type: Number, default: 0 }, // sum amount (referensi dari ER untuk items batch)
    total_aktual: { type: Number, default: 0 }, // sum aktual batch
    remaining: { type: Number, default: 0 },
    has_overbudget: { type: Boolean, default: false },

    // final lock: jika true, PVReport ini tidak bisa diubah/approve/reject/reopen
    pv_locked: { type: Boolean, default: false }
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

pvReportSchema.index({ voucher_number: 1, pv_number: 1, status: 1 });

pvReportSchema.index(
  { voucher_number: 1, 'items.er_detail_id': 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('PVReport', pvReportSchema);
