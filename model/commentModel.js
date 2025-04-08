const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Anonymous' },
    text: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
