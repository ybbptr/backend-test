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
const validateToken = require('../middleware/validations/validateTokenHandler');

Router.route('/')
  .get(getComments)
  .post(validateToken, validate(validateComment), createComments);
Router.route('/:id').delete(validateToken, deleteComments);

module.exports = Router;
