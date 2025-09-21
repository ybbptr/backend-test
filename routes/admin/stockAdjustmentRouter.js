const express = require('express');
const {
  getStockAdjustment,
  getStockAdjustments,
  removeStockAdjustment
} = require('../../controller/admin/stockAdjustmentController');

const Router = express.Router();

Router.get('/all-logs', getStockAdjustments);
Router.get('/:id', getStockAdjustment);
Router.delete('/remove/:id', removeStockAdjustment);

module.exports = Router;
