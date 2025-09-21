const mongoose = require('mongoose');

const { Schema, Types } = mongoose;
const ObjectId = Types.ObjectId;

const BUCKETS = ['ON_HAND', 'ON_LOAN'];
const REASONS = ['MARK_LOST', 'ADJUSTMENT', 'REOPEN_LOAN'];

const stockAdjustmentSchema = new Schema(
  {
    inventory: { type: ObjectId, ref: 'Inventory', required: true },
    bucket: { type: String, enum: BUCKETS, required: true }, // ON_HAND / ON_LOAN
    delta: { type: Number, required: true }, // + tambah, - kurang

    reason_code: { type: String, enum: REASONS, required: true },
    reason_note: { type: String },

    product_code: { type: String, required: true },
    brand: { type: String, required: true },

    changed_by: { type: ObjectId, ref: 'User', default: null },
    changed_by_name: { type: String, required: true },

    correlation: {
      loan_id: { type: ObjectId, ref: 'Loan', default: null },
      loan_number: { type: String, default: null },
      return_loan_id: { type: ObjectId, ref: 'ReturnLoan', default: null }
    }
  },
  { timestamps: true }
);

// index umum
stockAdjustmentSchema.index({ createdAt: -1 });
stockAdjustmentSchema.index({ reason_code: 1, createdAt: -1 });
stockAdjustmentSchema.index({ 'correlation.loan_number': 1, createdAt: -1 });

module.exports = mongoose.model('StockAdjustment', stockAdjustmentSchema);
