const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  loan_number: { type: String, required: true, unique: true },
  loan_date: { type: Date, required: true },
  loan_quantity: {
    type: Number,
    required: true
  },
  return_date: { type: Date, required: true },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  approval: {
    type: String,
    required: true,
    enum: ['Disetujui', 'Ditolak', 'Diproses'],
    default: 'Diproses'
  },
  project_type: {
    type: String,
    required: true,
    enum: ['SIS', 'SLS', 'Topography']
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  }
});

module.exports = mongoose.model('Loan', loanSchema);
