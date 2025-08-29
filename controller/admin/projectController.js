const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const throwError = require('../../utils/throwError');
const Project = require('../../model/projectModel');
const Client = require('../../model/clientModel');
const DailyProgress = require('../../model/dailyProgressModel');

// helper: merge edit admin utk progress.{sondir|bor|cptu}
function mergeProgressEdits(project, progressUpdates) {
  if (!progressUpdates || typeof progressUpdates !== 'object') return;

  const methods = ['sondir', 'bor', 'cptu'];
  project.progress = project.progress || {};

  for (const m of methods) {
    const src = progressUpdates[m];
    if (!src || typeof src !== 'object') continue;

    const node = (project.progress[m] = project.progress[m] || {
      total_points: 0,
      completed_points: 0,
      max_depth: 0
    });

    let total = node.total_points;
    let done = node.completed_points;
    let depth = node.max_depth;

    if (src.total_points !== undefined) {
      const v = Number(src.total_points);
      if (!Number.isFinite(v) || v < 0)
        throwError(`${m} Total titik invalid`, 400);
      total = v;
    }
    if (src.completed_points !== undefined) {
      const v = Number(src.completed_points);
      if (!Number.isFinite(v) || v < 0)
        throwError(`${m} Titik selesai invalid`, 400);
      done = v;
    }
    if (done > total) {
      throwError(
        `${m} completed_points (${done}) > total_points (${total})`,
        400
      );
    }
    if (src.max_depth !== undefined) {
      const v = Number(src.max_depth);
      if (!Number.isFinite(v) || v < 0)
        throwError(`${m} Kedalaman maksimum invalid`, 400);
      depth = v;
    }

    node.total_points = total;
    node.completed_points = done;
    node.max_depth = depth;
  }
}

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.user?.role !== 'admin') throwError('Forbidden', 403);

    const { id } = req.params;
    const project = await Project.findById(id).session(session);
    if (!project) throwError('Proyek tidak terdaftar!', 404);

    // hapus semua daily progress milik project ini
    const delDP = await DailyProgress.deleteMany({ project: id }).session(
      session
    );

    await Project.deleteOne({ _id: id }).session(session);

    await session.commitTransaction();
    res.status(200).json({
      message: 'Proyek dan seluruh laporan harian berhasil dihapus.',
      deleted_daily_progress: delDP.deletedCount || 0
    });
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
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

  mergeProgressEdits(project, req.body?.progress);
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
