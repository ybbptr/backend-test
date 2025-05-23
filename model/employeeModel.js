const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  nik: { type: String, required: true },
  age: { type: Number, required: true },
  employment_type: {
    type: String,
    required: true,
    enum: ['Freelance', 'Karyawan']
  },
  religion: {
    type: String,
    enum: ['Islam', 'Kristen', 'Katolik', 'Budha', 'Hindu']
  },
  height: Number,
  weight: Number,
  number_of_children: Number,
  place_of_birth: String,
  date_of_birth: Date,
  status: { type: String, enum: ['Menikah', 'Belum Menikah'] },
  bank_account_number: String,
  emergency_contact_number: String,
  position: String,
  blood_type: { type: String, enum: ['A', 'B', 'AB', 'O'] },
  start_date: Date,
  end_date: Date,
  documents: {
    ktp: String,
    asuransi: String,
    mcu: String,
    keterangan_sehat: String,
    kelakuan_baik: String,
    vaksinasi: String
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
