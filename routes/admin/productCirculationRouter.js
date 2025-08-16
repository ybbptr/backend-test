const express = require('express');
const {
  getProductCirculation,
  getProductCirculations,
  removeProductCirculation
} = require('../../controller/admin/productCirculationController');
const Router = express.Router();

Router.get('/all-circulation', getProductCirculations);
Router.get('/:id', getProductCirculation);
Router.delete('/remove/:id', removeProductCirculation);

module.exports = Router;
