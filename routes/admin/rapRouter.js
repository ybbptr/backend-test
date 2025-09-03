const express = require('express');
const {
  addRAP,
  getAllRAP,
  getRAP,
  removeRAP,
  updateRAP
} = require('../../controller/admin/rapController');

const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const {
  createRAPSchema,
  updateRAPSchema
} = require('../../middleware/validations/validateRap');
const { pdfUploader } = require('../../utils/fileUploader');

Router.post(
  '/add-project',
  pdfUploader.single('kontrak'),
  validate(createRAPSchema),
  addRAP
);

Router.get('/all-project', getAllRAP);

Router.get('/:id', getRAP);
Router.put(
  '/update/:id',
  pdfUploader.single('kontrak'),
  validate(updateRAPSchema),
  updateRAP
);
Router.delete('/remove/:id', removeRAP);

module.exports = Router;
