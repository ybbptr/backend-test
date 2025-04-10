const express = require('express');
const Router = express.Router();
const validateComment = require('../middleware/validations/validateComment');
const {
  getComments,
  createComments,
  deleteComments
  // getComment,
  // updateComments
} = require('../controller/commentController');
const validate = require('../middleware/validations/validate');
const validateToken = require('../middleware/validations/validateTokenHandler');
const { createRateLimiter } = require('../middleware/rateLimiter');

const commentLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 menit
  max: 5,
  message: 'Terlalu banyak komentar dalam waktu singkat. Coba lagi nanti.'
});

Router.route('/').get(getComments).post(
  // validateToken,
  commentLimiter,
  validate(validateComment),
  createComments
);
Router.route('/:id').delete(validateToken, deleteComments);

module.exports = Router;
