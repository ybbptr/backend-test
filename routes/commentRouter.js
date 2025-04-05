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
const validate = require('../middleware/validations/validate');

Router.route('/')
  .get(getComments)
  .post(validate(validateComment), createComments);
Router.route('/:id')
  .put(validate(validateComment), updateComments)
  .delete(deleteComments);

module.exports = Router;
