const express = require('express');
const Router = express.Router();
const {
  getProject,
  getProjects
} = require('../controller/progressProjectController');

Router.get('/all-progress', getProjects);
Router.get('/:id', getProject);

module.exports = Router;
