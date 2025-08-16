const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  project_name: { type: String, required: true },
  location: { type: String, required: true },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  start_date: { type: Date, required: true },
  end_date: Date,
  progress: {
    sondir: {
      total_points: { type: Number, default: 0 }, // jumlah titik
      completed_points: { type: Number, default: 0 }, // titik selesai
      max_depth: { type: Number, default: 0 } // kedalaman maksimum
    },
    bor: {
      total_points: { type: Number, default: 0 },
      completed_points: { type: Number, default: 0 },
      max_depth: { type: Number, default: 0 }
    },
    cptu: {
      total_points: { type: Number, default: 0 },
      completed_points: { type: Number, default: 0 },
      max_depth: { type: Number, default: 0 }
    }
  },
  project_value: { type: Number, default: 0 },
  max_expense: { type: Number, default: 0 }, // max pengeluaran
  proposed: { type: Number, default: 0 }, // pengajuan
  used: { type: Number, default: 0 }, // terpakai
  remaining: { type: Number, default: 0 } // selisih (sisa)
});

module.exports = mongoose.model('Project', projectSchema);
