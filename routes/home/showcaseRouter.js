const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateShowcase = require('../../middleware/validations/validateShowcase');
const {
  addShowcase,
  getShowcase,
  getShowcases,
  removeShowcase,
  updateShowcase
} = require('../../controller/home/showcaseController');

Router.post('/add-showcase', validate(validateShowcase), addShowcase).get(
  '/all-showcase',
  getShowcases
);

Router.get('/:id', getShowcase)
  .put('/update/:id', validate(validateShowcase), updateShowcase)
  .delete('/remove/:id', removeShowcase);

module.exports = Router;
