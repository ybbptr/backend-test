const mongoose = require('mongoose');
const Counter = require('./Counter');

const loanSchema = new mongoose.Schema(
  {
    loan_number: { type: String, unique: true },
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    loan_date: { type: Date, required: true },
    return_date: { type: Date, required: true },
    nik: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },

    borrowed_items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        product_code: { type: String, required: true },
        brand: { type: String },
        quantity: { type: Number, required: true },
        pickup_date: { type: Date, required: true },
        return_date: { type: Date },
        project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' }, // relasi proyek
        condition: { type: String }
      }
    ],

    approval: {
      type: String,
      enum: ['Disetujui', 'Ditolak', 'Diproses'],
      default: 'Diproses'
    }
  },
  { timestamps: true }
);

loanSchema.pre('save', async function (next) {
  if (!this.loanCode) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'loan_code' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.loanCode = `p-${String(counter.seq).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Loan', loanSchema);
