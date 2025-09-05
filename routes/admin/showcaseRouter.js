const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateToken = require('../../middleware/validations/validateTokenHandler');
const {
  createShowcaseSchema,
  updateShowcaseSchema
} = require('../../middleware/validations/validateShowcase');
const { imageUploader } = require('../../utils/fileUploader');
const {
  addShowcase,
  getShowcase,
  getShowcases,
  removeShowcase,
  updateShowcase
} = require('../../controller/admin/showcaseController');

Router.post(
  '/add-showcase',
  validateToken,
  imageUploader.single('img'),
  validate(createShowcaseSchema),
  addShowcase
);

Router.get('/all-showcase', getShowcases);

Router.get('/:id', getShowcase);

Router.put(
  '/update/:id',
  validateToken,
  imageUploader.single('img'),
  validate(updateShowcaseSchema),
  updateShowcase
);

Router.delete('/remove/:id', validateToken, removeShowcase);

module.exports = Router;
