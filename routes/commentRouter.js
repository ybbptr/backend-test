const express = require('express');
const Router = express.Router();
const validateComment = require('../middleware/validations/validateComment');
const {
  getComments,
  createComments,
  deleteComments,
  // getComment,
  updateComments
} = require('../controller/commentController');

Router.route('/').get(getComments).post(validateComment, createComments);
Router.route('/:id').put(updateComments).delete(deleteComments);

module.exports = Router;
