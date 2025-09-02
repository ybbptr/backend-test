const mongoose = require('mongoose');
const Counter = require('./loanCounter');

const loanSchema = new mongoose.Schema(
  {
    loan_number: { type: String, unique: true },
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    nik: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    position: { type: String, required: true },
    loan_date: { type: Date, required: true },
    pickup_date: { type: Date, required: true },
    return_date: { type: Date, required: true },
    inventory_manager: {
      type: String,
      required: true,
      enum: ['Owan H.', 'Teguh F.', 'Korlap']
    },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    shelf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shelf',
      required: true
    },
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
        project: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Project',
          required: true
        },

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
  if (!this.loan_number) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'loan_code' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.loan_number = `PA-${String(counter.seq).padStart(3, '0')}`;
  }
  next();
});

loanSchema.index({ borrower: 1 });
loanSchema.index({ 'borrowed_items.project': 1 });

module.exports = mongoose.model('Loan', loanSchema);
