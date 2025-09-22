const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const BUCKETS = ['ON_HAND', 'ON_LOAN'];

const REASON_CODES = [
  'LOAN_OUT',
  'REVERT_LOAN_OUT',
  'RETURN_IN',
  'REVERT_RETURN',
  'MARK_LOST',
  'REVERT_MARK_LOST',
  'MOVE_INTERNAL',
  'MANUAL_EDIT',
  'MANUAL_CORRECTION',
  'SYSTEM_CORRECTION',
  'CHANGE_CONDITION'
];

const CorrelationSchema = new Schema(
  {
    loan_id: { type: ObjectId, ref: 'Loan', default: null },
    loan_number: { type: String, default: null },
    return_loan_id: { type: ObjectId, ref: 'ReturnLoan', default: null }
  },
  { _id: false }
);

const SnapshotSchema = new Schema(
  {
    product_id: { type: ObjectId, ref: 'Product', default: null },
    product_code: { type: String, default: null },
    product_name: { type: String, default: null },
    brand: { type: String, default: null },

    warehouse_id: { type: ObjectId, ref: 'Warehouse', default: null },
    warehouse_name: { type: String, default: null },

    shelf_id: { type: ObjectId, ref: 'Shelf', default: null },
    shelf_name: { type: String, default: null }
  },
  { _id: false }
);

const StockAdjustmentSchema = new Schema(
  {
    inventory: { type: ObjectId, ref: 'Inventory', required: true },

    bucket: { type: String, enum: VALID_BUCKETS, required: true }, // ON_HAND / ON_LOAN
    delta: { type: Number, required: true },
    before: { type: Number, required: true },
    after: { type: Number, required: true },

    reason_code: { type: String, enum: REASON_CODES, required: true },
    reason_note: { type: String, default: null },

    actor_id: { type: ObjectId, default: null },
    actor_name: { type: String, default: 'system' },

    correlation: { type: CorrelationSchema, default: {} },
    snapshot: { type: SnapshotSchema, default: {} }
  },
  { timestamps: true }
);

StockAdjustmentSchema.index({ createdAt: -1 });
StockAdjustmentSchema.index({ 'correlation.loan_number': 1, createdAt: -1 });
StockAdjustmentSchema.index({ 'snapshot.product_code': 1, createdAt: -1 });

module.exports = mongoose.model('StockAdjustment', StockAdjustmentSchema);
module.exports.BUCKETS = BUCKETS;
module.exports.REASON_CODES = REASON_CODES;
