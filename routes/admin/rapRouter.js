const express = require('express');
const {
  addRAP,
  getAllRAP,
  getRAP,
  removeRAP,
  updateRAP,
  getAllClient
} = require('../../controller/admin/rapController');

const RAP = require('../../model/rapModel');

const { checkDuplicate } = require('../../middleware/checkDuplicate');
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
  checkDuplicate(RAP, { nomor_kontrak: 'Nomor Kontrak' }),
  addRAP
);

Router.get('/all-project', getAllRAP);
Router.get('/all-client', getAllClient);

Router.get('/:id', getRAP);
Router.put(
  '/update/:id',
  pdfUploader.single('kontrak'),
  validate(updateRAPSchema),
  checkDuplicate(RAP, { nomor_kontrak: 'Nomor Kontrak' }),
  updateRAP
);
Router.delete('/remove/:id', removeRAP);

module.exports = Router;
