const asyncHandler = require('express-async-handler');
const Comment = require('../model/commentModel');
const throwError = require('../utils/throwError');
const User = require('../model/userModel');

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

const createComments = asyncHandler(async (req, res) => {
  // const user = await User.findById(req.user.id).select(
  //   '-password -role -phone -email -createdAt -updatedAt'
  // );
  // console.log(user);

  // if (!user) return throwError('Anda harus login untuk membuat komentar!', 401);

  const { text } = req.body || {};
  if (!text) throwError('Semua field harus di isi!', 400, 'text');

  const comment = await Comment.create({
    name: 'Anonymous',
    text
  });

  res.status(201).json(comment);
});

// const getComment = asyncHandler(async (req, res) => {
//   const comment = await Comment.findById(req.params.id);
//   if (!comment) {
//     res.status(404);
//     throw new Error('Comment not found!');
//   }

//   res.status(200).json(comment);
// });

// const updateComments = asyncHandler(async (req, res) => {
//   const comment = await Comment.findById(req.params.id);
//   if (!comment) {
//     throwError('Komentar tidak ditemukan!', 404, 'text');
//   }

//   const newComment = await Comment.findByIdAndUpdate(req.params.id, req.body, {
//     new: true
//   });

//   res.status(200).json(newComment);
// });

const deleteComments = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.user.id).select('role');
  if (admin.role != 'admin') {
    return throwError(
      'Anda tidak memiliki akses untuk menghapus komentar!',
      401
    );
  }

  const comment = await Comment.findByIdAndDelete(req.params.id);
  if (!comment) throwError('Komentar tidak ditemukan!', 404, 'text');

  res.status(200).json({ message: 'Comment succesfully deleted' });
});

module.exports = {
  getComments,
  createComments,
  deleteComments
  // getComment,
  // updateComments,
};
