const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateClient = require('../../middleware/validations/validateClient');
const {
  addClient,
  getClient,
  getClients,
  removeClient,
  updateClient
} = require('../../controller/admin/clientController');

Router.post('/add-client', validate(validateClient), addClient).get(
  '/all-client',
  getClients
);
Router.get('/:id', getClient)
  .put('/update/:id', validate(validateClient), updateClient)
  .delete('/remove/:id', removeClient);

module.exports = Router;
