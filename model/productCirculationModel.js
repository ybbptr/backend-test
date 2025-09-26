const mongoose = require('mongoose');

const { Schema, Types } = mongoose;
const ObjectId = Types.ObjectId;

const MOVEMENT_TYPES = [
  'LOAN_OUT', // approve loan → barang keluar gudang ke tujuan
  'RETURN_IN', // approve return (bukan "Hilang") → barang masuk gudang
  'TRANSFER', // pindah antar gudang/lemari (di luar loan/return)
  'CONDITION_CHANGE', // reclas kondisi (Baik→Rusak→Maintenance)
  'REOPEN_LOAN' // reversal fisik dari LOAN_OUT saat reopen
];

const productCirculationSchema = new Schema(
  {
    // Apa yang terjadi
    movement_type: { type: String, enum: MOVEMENT_TYPES, required: true },
    reason_note: { type: String },

    // Identitas produk (denormalisasi buat laporan cepat)
    product: { type: ObjectId, ref: 'Product', required: true },
    product_code: { type: String, required: true },
    product_name: { type: String, required: true },

    // Kuantitas
    quantity: { type: Number, required: true, min: 1 },

    // Perpindahan fisik (asal → tujuan)
    inventory_from: { type: ObjectId, ref: 'Inventory', default: null },
    inventory_to: { type: ObjectId, ref: 'Inventory', default: null },

    warehouse_from: { type: ObjectId, ref: 'Warehouse', default: null },
    shelf_from: { type: ObjectId, ref: 'Shelf', default: null },

    warehouse_to: { type: ObjectId, ref: 'Warehouse', default: null },
    shelf_to: { type: ObjectId, ref: 'Shelf', default: null },

    // Kondisi (membantu baca log)
    from_condition: {
      type: String,
      enum: ['Baik', 'Rusak', 'Maintenance', 'Hilang'],
      default: null
    },
    to_condition: {
      type: String,
      enum: ['Baik', 'Rusak', 'Maintenance', 'Hilang'],
      default: null
    },

    // Korelasi ke batch
    loan_id: { type: ObjectId, ref: 'Loan', default: null },
    loan_number: { type: String, default: null },
    return_loan_id: { type: ObjectId, ref: 'ReturnLoan', default: null },

    // Pelaku (conditional: admin → User, karyawan → Employee)
    moved_by_model: {
      type: String,
      enum: ['User', 'Employee'],
      required: true
    },
    moved_by: { type: ObjectId, refPath: 'moved_by_model', required: true },
    moved_by_name: { type: String, required: true }
  },
  { timestamps: true }
);

// Index untuk query umum
productCirculationSchema.index({ movement_type: 1, createdAt: -1 });
productCirculationSchema.index({ loan_number: 1, createdAt: -1 });
productCirculationSchema.index({ return_loan_id: 1 });
productCirculationSchema.index({ product_code: 1, createdAt: -1 });
productCirculationSchema.index({
  moved_by_model: 1,
  moved_by: 1,
  createdAt: -1
});

module.exports = mongoose.model('ProductCirculation', productCirculationSchema);
