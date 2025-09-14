const mongoose = require('mongoose');

const detailSchema = new mongoose.Schema(
  {
    purpose: { type: String, required: true, trim: true }, // keperluan
    category: { type: String, required: true, trim: true }, // kategori
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true, min: 0 }, // harga_satuan
    amount: { type: Number, required: true, min: 0 } // jumlah
  },
  { _id: false }
);

const expenseRequestSchema = new mongoose.Schema(
  {
    name: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true // populate name
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RAP',
      required: true // populate project_name
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
    method: {
      type: String,
      enum: ['Transfer', 'Tunai'],
      required: true
    },
    bank_account_number: { type: String, trim: true },
    bank: { type: String },
    bank_branch: { type: String, trim: true },
    bank_account_holder: { type: String, trim: true },
    description: { type: String, trim: true }, // deskripsi_keperluan
    details: { type: [detailSchema], default: [] }, // detail_keperluan
    total_amount: { type: Number, required: true }, // total_permohonan_biaya
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
    payment_voucher: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExpenseRequest', expenseRequestSchema);
