const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  bank_account_number: { type: String, required: true },
  npwp: { type: String, required: true },
  emergency_contact_number: { type: String, required: true }
});

module.exports = mongoose.model('Vendor', vendorSchema);
