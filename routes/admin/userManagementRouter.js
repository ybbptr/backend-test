const express = require('express');
const {
  getAllUsers,
  deleteUser
} = require('../../controller/admin/userManagementController');
const Router = express.Router();

Router.get('/all-users', getAllUsers);
Router.delete('/remove/:id', deleteUser);

module.exports = Router;
