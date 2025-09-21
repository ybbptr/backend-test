const mongoose = require('mongoose');
const Counter = require('./counterModel');

const { Schema, Types } = mongoose;
const ObjectId = Types.ObjectId;

const APPROVAL = ['Diproses', 'Disetujui', 'Ditolak'];
const CIRCULATION = ['Pending', 'Aktif', 'Selesai', 'Ditolak'];

const loanSchema = new Schema(
  {
    loan_number: { type: String, unique: true, index: true },

    // peminjam & info
    borrower: { type: ObjectId, ref: 'Employee', required: true },
    nik: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    position: { type: String, required: true },

    // tanggal
    loan_date: { type: Date, required: true },
    pickup_date: { type: Date, required: true },

    // tujuan
    inventory_manager: {
      type: String,
      required: true,
      enum: ['Owan H.', 'Teguh F.', 'Korlap']
    },
    warehouse_to: { type: ObjectId, ref: 'Warehouse', required: true },

    // item batch
    borrowed_items: [
      {
        inventory: { type: ObjectId, ref: 'Inventory', required: true },
        product: { type: ObjectId, ref: 'Product', required: true },
        product_code: { type: String, required: true },
        brand: String,
        quantity: { type: Number, required: true, min: 1 },
        project: { type: ObjectId, ref: 'RAP', required: true },
        condition_at_borrow: { type: String, required: true },
        warehouse_from: { type: ObjectId, ref: 'Warehouse', required: true },
        shelf_from: { type: ObjectId, ref: 'Shelf', required: true }
      }
    ],

    // Approval flow
    status: { type: String, enum: APPROVAL, default: 'Diproses', index: true },
    loan_locked: { type: Boolean, default: false },
    note: { type: String },

    // Lifecycle pengembalian
    circulation_status: {
      type: String,
      enum: CIRCULATION,
      default: 'Pending',
      index: true
    },
    completed_at: { type: Date, default: null }
  },
  { timestamps: true }
);

loanSchema.pre('save', async function (next) {
  if (!this.loan_number) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'loan_code' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const prefix = process.env.LOAN_PREFIX || 'PA-';
    this.loan_number = `${prefix}${String(counter.seq).padStart(4, '0')}`;
  }
  next();
});

// Helper konsistensi status sirkulasi
loanSchema.methods.syncCirculationStatus = function ({
  allReturned = false
} = {}) {
  if (this.status === 'Ditolak') {
    this.circulation_status = 'Ditolak';
    this.completed_at = null;
    return;
  }
  if (this.status === 'Diproses') {
    this.circulation_status = 'Pending';
    this.completed_at = null;
    return;
  }
  // Disetujui
  if (allReturned) {
    this.circulation_status = 'Selesai';
    if (!this.completed_at) this.completed_at = new Date();
  } else {
    this.circulation_status = 'Aktif';
    this.completed_at = null;
  }
};

loanSchema.index({ borrower: 1, createdAt: -1 });
loanSchema.index({ 'borrowed_items.project': 1 });

module.exports = mongoose.model('Loan', loanSchema);
