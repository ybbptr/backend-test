const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  loan_number: { type: String, required: true, unique: true },
  loan_date: { type: Date, required: true },
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
  }
});

module.exports = mongoose.model('Loan', loanSchema);
