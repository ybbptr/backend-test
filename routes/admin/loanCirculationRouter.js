const express = require('express');
const {
  getLoanCirculation,
  getLoanCirculations,
  removeLoanCirculation,
  refreshLoanCirculationUrls
} = require('../../controller/admin/loanCirculationController');
const Router = express.Router();

Router.get('/all-circulation', getLoanCirculations);
Router.get('/:id', getLoanCirculation);
Router.get('/:id/refresh-image', refreshLoanCirculationUrls);
Router.delete('/remove/:id', removeLoanCirculation);

module.exports = Router;
