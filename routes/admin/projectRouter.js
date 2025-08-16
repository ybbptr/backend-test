const express = require('express');
const Router = express.Router();
const validate = require('../../middleware/validations/validate');
const validateProject = require('../../middleware/validations/validateProject');
const {
  addProject,
  getProject,
  getProjects,
  removeProject,
  updateProject,
  getAllClient
} = require('../../controller/admin/projectController');

Router.post('/add-project', validate(validateProject), addProject)
  .get('/all-project', getProjects)
  .get('/all-client', getAllClient);

Router.get('/:id', getProject)
  .put('/update/:id', validate(validateProject), updateProject)
  .delete('/remove/:id', removeProject);

module.exports = Router;
