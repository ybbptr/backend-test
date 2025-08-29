// models/DailyProgress.js
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const dailyItemSchema = new Schema(
  {
    method: { type: String, enum: ['sondir', 'bor', 'cptu'], required: true },
    points_done: { type: Number, min: 0, default: 0 },
    depth_reached: { type: Number, min: 0, default: 0 }
  },
  { _id: false }
);

const dailyProgressSchema = new Schema(
  {
    project: {
      type: Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    author: {
      type: Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true
    },

    local_date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'

    notes: { type: String, default: '' },
    items: { type: [dailyItemSchema], default: [] }
  },
  { timestamps: true }
);

dailyProgressSchema.index(
  { project: 1, author: 1, local_date: 1 },
  { unique: true }
);
dailyProgressSchema.index({ project: 1, local_date: 1 });

module.exports = mongoose.model('DailyProgress', dailyProgressSchema);
