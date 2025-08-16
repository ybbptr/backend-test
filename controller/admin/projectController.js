const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Project = require('../../model/projectModel');
const Client = require('../../model/clientModel');

const addProject = asyncHandler(async (req, res) => {
  const {
    project_name,
    location,
    client,
    start_date,
    end_date,
    progress,
    project_value,
    max_expense,
    proposed = 0,
    used = 0
  } = req.body || {};

  if (!project_name || !location || !client || !start_date || !project_value)
    throwError('Field ini harus diisi', 400);

  if (used > proposed)
    throwError('Biaya yang terpakai melebihi biaya pengajuan!');

  if (max_expense > project_value)
    throwError('Biaya pengeluaran melebihi biaya proyek!');

  const remaining = proposed - used;

  const project = await Project.create({
    project_name,
    location,
    client,
    start_date,
    end_date,
    progress,
    project_value,
    max_expense,
    proposed,
    used,
    remaining
  });

  res.status(201).json(project);
});

const getProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find().populate('client', 'name email').exec();
  res.status(200).json(projects);
});

const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('client', 'name email')
    .exec();

  if (!project) throwError('Proyek tidak terdaftar!', 400);

  res.status(200).json(project);
});

const removeProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throwError('Proyek tidak terdaftar!', 400);

  await project.deleteOne();
  res.status(200).json({ message: 'Proyek berhasil dihapus.' });
});

const updateProject = asyncHandler(async (req, res) => {
  const {
    project_name,
    location,
    client,
    start_date,
    end_date,
    progress,
    project_value,
    max_expense,
    proposed = 0,
    used = 0
  } = req.body || {};

  const project = await Project.findById(req.params.id);
  if (!project) throwError('Proyek tidak ada', 404);

  const _proposed = proposed !== undefined ? proposed : project.proposed;
  const _used = used !== undefined ? used : project.used;

  if (_used > _proposed)
    throwError('Biaya yang terpakai melebihi biaya pengajuan!');

  if (max_expense > (project_value ?? project.project_value))
    throwError('Biaya pengeluaran melebihi biaya proyek!');

  const remaining = proposed - used;

  project.project_name = project_name ?? project.project_name;
  project.location = location ?? project.location;
  project.client = client ?? project.client;
  project.start_date = start_date ?? project.start_date;
  project.end_date = end_date ?? project.end_date;
  project.progress = progress ?? project.progress;
  project.project_value = project_value ?? project.project_value;
  project.max_expense = max_expense ?? project.max_expense;
  project.proposed = proposed ?? project.proposed;
  project.used = used ?? project.used;
  project.remaining = remaining ?? project.remaining;

  await project.save();
  res.status(200).json(project);
});

const getAllClient = asyncHandler(async (req, res) => {
  const client = await Client.find().select('name');

  res.json(client);
});

module.exports = {
  addProject,
  getProjects,
  getProject,
  removeProject,
  updateProject,
  getAllClient
};
