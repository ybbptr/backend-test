const mongoose = require('mongoose');

const progressProjectSchema = new mongoose.Schema(
  {
    rap: { type: mongoose.Schema.Types.ObjectId, ref: 'RAP', required: true },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true
    },
    project_name: String,
    location: String,
    date_start: Date,
    date_end: { type: Date, default: null },
    project_value: { type: Number, default: 0 },
    progress: {
      sondir: {
        total_points: { type: Number, default: 0 },
        completed_points: { type: Number, default: 0 },
        max_depth: { type: Number, default: 0 }
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
    }
  },
  { timestamps: true }
);

// index tetap
progressProjectSchema.index({ date_start: 1 });

module.exports = mongoose.model('Progress', progressProjectSchema);
