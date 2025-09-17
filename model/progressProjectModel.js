// models/progressProjectModel.js
const mongoose = require('mongoose');

const nonNegInt = {
  validator: Number.isInteger,
  message: '{PATH} harus bilangan bulat'
};

const nonNeg = { min: [0, '{PATH} tidak boleh negatif'] };

const pointSchema = new mongoose.Schema(
  {
    total_points: { type: Number, default: 0, validate: nonNegInt, ...nonNeg },
    completed_points: {
      type: Number,
      default: 0,
      validate: nonNegInt,
      ...nonNeg
    },
    max_depth: { type: Number, default: 0, ...nonNeg }
  },
  { _id: false }
);

const progressProjectSchema = new mongoose.Schema(
  {
    rap: { type: mongoose.Schema.Types.ObjectId, ref: 'RAP', required: true },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true
    },

    project_name: { type: String, trim: true },
    location: { type: String, trim: true },

    date_start: { type: Date },
    date_end: { type: Date, default: null },

    // disimpan ringan untuk display; sumber kebenaran ada di RAP
    project_value: { type: Number, default: 0, ...nonNeg },

    // progress harian per pekerjaan
    progress: {
      sondir: { type: pointSchema, default: () => ({}) },
      bor: { type: pointSchema, default: () => ({}) },
      cptu: { type: pointSchema, default: () => ({}) }
    }
  },
  { timestamps: true }
);

// ==== Index ====
progressProjectSchema.index({ rap: 1 }, { unique: true }); // 1 RAP -> 1 Progress
progressProjectSchema.index({ client: 1 });
progressProjectSchema.index({ date_start: 1 });

// ==== Cross-field guard: completed_points <= total_points ====
function clampCompleted(doc) {
  const jobs = ['sondir', 'bor', 'cptu'];
  for (const j of jobs) {
    const p = doc.progress?.[j];
    if (!p) continue;
    if (
      typeof p.completed_points === 'number' &&
      typeof p.total_points === 'number'
    ) {
      if (p.completed_points > p.total_points) {
        // Fail hard (lebih aman; kalau mau auto-clamp, ganti ke: p.completed_points = p.total_points)
        throw new mongoose.Error.ValidationError(
          new mongoose.Error.ValidatorError({
            path: `progress.${j}.completed_points`,
            message: 'completed_points tidak boleh melebihi total_points'
          })
        );
      }
    }
  }
}
progressProjectSchema.pre('validate', function (next) {
  try {
    clampCompleted(this);
    next();
  } catch (e) {
    next(e);
  }
});

progressProjectSchema.virtual('overall_percent').get(function () {
  const jobs = ['sondir', 'bor', 'cptu'];
  let total = 0,
    done = 0;
  for (const j of jobs) {
    const p = this.progress?.[j];
    if (!p) continue;
    total += Number(p.total_points) || 0;
    done += Number(p.completed_points) || 0;
  }
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
});

progressProjectSchema.set('toJSON', { virtuals: true });
progressProjectSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ProgressProject', progressProjectSchema);
