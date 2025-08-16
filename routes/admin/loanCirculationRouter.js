const express = require('express');
const {
  getLoanCirculation,
  getLoanCirculations,
  removeLoanCirculation
} = require('../../controller/admin/loanCirculationController');
const Router = express.Router();

Router.get('/all-circulation', getLoanCirculations);
Router.get('/:id', getLoanCirculation);
Router.delete('/remove/:id', removeLoanCirculation);

module.exports = Router;
