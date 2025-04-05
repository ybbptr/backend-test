const asyncHandler = require('express-async-handler');
const Comment = require('../model/commentModel');

// @desc Get all comments
// GET /api/comments
// @access public
const getComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find();
  const formattedComments = comments.map((comment) => ({
    _id: comment._id,
    anonymousName: comment.anonymousName,
    text: comment.text,
    createdAt: comment.createdAt.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }));

  res.status(200).json(formattedComments);
});

// @desc Create comment
// GET /api/comments
// @access private, user
const createComments = asyncHandler(async (req, res) => {
  const { anonymousName, text } = req.body || {};

  if (!text) {
    res.status(400);
    throw new Error('All fields are required!');
  }

  const comment = await Comment.create({
    anonymousName: anonymousName || 'Anonymous',
    text
  });

  res.status(201).json(comment);
});

// @desc Get comment
// GET /api/comments
// @access public
// const getComment = asyncHandler(async (req, res) => {
//   const comment = await Comment.findById(req.params.id);
//   if (!comment) {
//     res.status(404);
//     throw new Error('Comment not found!');
//   }

//   res.status(200).json(comment);
// });

// @desc Update comment
// GET /api/comments/:id
// @access private, user
const updateComments = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    res.status(404);
    throw new Error('Comment not found!');
  }

  const newComment = await Comment.findByIdAndUpdate(req.params.id, req.body, {
    new: true
  });

  res.status(200).json(newComment);
});

// @desc delete comment
// GET /api/comments/:id
// @access private, admin
const deleteComments = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    res.status(404);
    throw new Error('Comment not found!');
  }

  await comment.deleteOne();
  res.status(200).json({ message: 'Comment succesfully deleted' });
});

module.exports = {
  getComments,
  createComments,
  // getComment,
  updateComments,
  deleteComments
};
