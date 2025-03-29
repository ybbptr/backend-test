const express = require('express');
const Router = express.Router();
const validateComment = require('../middleware/validateComment');
const {
  getComments,
  createComments,
  deleteComments,
  getComment,
  updateComments
} = require('../controller/commentController');

Router.route('/').get(getComments).post(validateComment, createComments);
Router.route('/:id').get(getComment).put(updateComments).delete(deleteComments);

module.exports = Router;
