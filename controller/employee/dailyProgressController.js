'use strict';

const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const ProgressProject = require('../../model/progressProjectModel');
const DailyProgress = require('../../model/dailyProgressModel');
const Employee = require('../../model/employeeModel');

/* ==================== Helpers ==================== */
const toDateStr = (date) => {
  if (!date) return null;
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const pickProgress = (p = {}) => ({
  sondir: {
    total_points: p.sondir?.total_points ?? 0,
    completed_points: p.sondir?.completed_points ?? 0,
    max_depth: p.sondir?.max_depth ?? 0
  },
  bor: {
    total_points: p.bor?.total_points ?? 0,
    completed_points: p.bor?.completed_points ?? 0,
    max_depth: p.bor?.max_depth ?? 0
  },
  cptu: {
    total_points: p.cptu?.total_points ?? 0,
    completed_points: p.cptu?.completed_points ?? 0,
    max_depth: p.cptu?.max_depth ?? 0
  }
});

// Translate User._id (dari token) -> Employee._id
const resolveEmployeeId = async (userId) => {
  if (!userId) throwError('Unauthorized', 401);
  const me = await Employee.findOne({ user: userId }).select('_id').lean();
  if (!me) throwError('Karyawan tidak ditemukan', 404);
  return me._id;
};

/* ==================== Controllers ==================== */
const upsertDailyProgress = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectId, local_date } = req.params;
    const authorId = await resolveEmployeeId(req.user?.id); // <- Employee._id

    if (!/^\d{4}-\d{2}-\d{2}$/.test(local_date)) {
      throwError('Tanggal harus format YYYY-MM-DD', 400);
    }

    const { notes = '', items } = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'items')) {
      throwError('Field "items" wajib ada', 400);
    }

    // cek project
    const project = await ProgressProject.findById(projectId).session(session);
    if (!project) throwError('Project tidak ditemukan', 404);

    const startStr = toDateStr(project.start_date);
    if (startStr && local_date < startStr)
      throwError('Tanggal progress sebelum tanggal mulai proyek.', 400);

    if (project.end_date) {
      const endStr = toDateStr(project.end_date);
      if (endStr && local_date > endStr)
        throwError('Tanggal progress melewati tanggal selesai proyek.', 400);
    }

    const existing = await DailyProgress.findOne({
      project: projectId,
      author: authorId,
      local_date
    }).session(session);

    const incomingItems = Array.isArray(items) ? items : [];
    if (
      existing &&
      existing.items?.length &&
      incomingItems.length === 0 &&
      req.query.confirm !== 'clear'
    ) {
      throwError(
        'Mengosongkan semua items butuh konfirmasi (?confirm=clear)',
        400
      );
    }

    const ALLOWED = new Set(['sondir', 'bor', 'cptu']);
    const cleanItems = incomingItems
      .filter((it) => it && ALLOWED.has(it.method))
      .map((it) => ({
        method: it.method,
        points_done: Math.max(0, Number(it.points_done || 0)),
        depth_reached: Math.max(0, Number(it.depth_reached || 0))
      }));

    // hitung delta (total harian) per method
    const delta = {
      sondir: { points: 0, depthMax: 0 },
      bor: { points: 0, depthMax: 0 },
      cptu: { points: 0, depthMax: 0 }
    };
    for (const it of cleanItems) {
      delta[it.method].points += it.points_done;
      delta[it.method].depthMax = Math.max(
        delta[it.method].depthMax,
        it.depth_reached
      );
    }

    let inc = {
      'progress.sondir.completed_points': delta.sondir.points,
      'progress.bor.completed_points': delta.bor.points,
      'progress.cptu.completed_points': delta.cptu.points
    };
    let max = {
      'progress.sondir.max_depth': delta.sondir.depthMax,
      'progress.bor.max_depth': delta.bor.depthMax,
      'progress.cptu.max_depth': delta.cptu.depthMax
    };

    if (existing) {
      // hitung delta terhadap nilai sebelumnya (agar idempotent by date)
      const prev = {
        sondir: { points: 0, depthMax: 0 },
        bor: { points: 0, depthMax: 0 },
        cptu: { points: 0, depthMax: 0 }
      };
      for (const it of existing.items) {
        prev[it.method].points += Number(it.points_done || 0);
        prev[it.method].depthMax = Math.max(
          prev[it.method].depthMax,
          Number(it.depth_reached || 0)
        );
      }
      inc = {
        'progress.sondir.completed_points':
          delta.sondir.points - prev.sondir.points,
        'progress.bor.completed_points': delta.bor.points - prev.bor.points,
        'progress.cptu.completed_points': delta.cptu.points - prev.cptu.points
      };
      max = {
        'progress.sondir.max_depth': Math.max(
          delta.sondir.depthMax,
          project.progress?.sondir?.max_depth || 0
        ),
        'progress.bor.max_depth': Math.max(
          delta.bor.depthMax,
          project.progress?.bor?.max_depth || 0
        ),
        'progress.cptu.max_depth': Math.max(
          delta.cptu.depthMax,
          project.progress?.cptu?.max_depth || 0
        )
      };
    }

    // Validasi batas 0..total_points sesudah update
    const cur = project.progress || {};
    const nextCompleted = {
      sondir:
        (cur.sondir?.completed_points || 0) +
        (inc['progress.sondir.completed_points'] || 0),
      bor:
        (cur.bor?.completed_points || 0) +
        (inc['progress.bor.completed_points'] || 0),
      cptu:
        (cur.cptu?.completed_points || 0) +
        (inc['progress.cptu.completed_points'] || 0)
    };

    const violations = [];
    if (
      nextCompleted.sondir < 0 ||
      nextCompleted.sondir > (cur.sondir?.total_points || 0)
    )
      violations.push(`Sondir`);
    if (
      nextCompleted.bor < 0 ||
      nextCompleted.bor > (cur.bor?.total_points || 0)
    )
      violations.push(`Bor`);
    if (
      nextCompleted.cptu < 0 ||
      nextCompleted.cptu > (cur.cptu?.total_points || 0)
    )
      violations.push(`CPTU`);
    if (violations.length)
      throwError(`Titik selesai keluar batas: ${violations.join(', ')}`, 400);

    // upsert daily progress (per author+date+project)
    const doc = await DailyProgress.findOneAndUpdate(
      { project: projectId, author: authorId, local_date },
      {
        $set: {
          local_date,
          notes,
          items: cleanItems,
          author: authorId,
          project: projectId
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );

    // update progress project (aggregate counters + max depth)
    await ProgressProject.updateOne(
      { _id: projectId },
      { $inc: inc, $max: max },
      { session }
    );

    const freshProject = await ProgressProject.findById(projectId)
      .select('start_date end_date progress')
      .lean()
      .session(session);

    await session.commitTransaction();

    res.json({
      message: 'Progress harian tersimpan',
      data: doc,
      project_progress: pickProgress(freshProject.progress),
      start_date: toDateStr(freshProject.start_date),
      end_date: toDateStr(freshProject.end_date)
    });
  } catch (e) {
    await session.abortTransaction();
    if (e && e.code === 11000)
      throwError('Laporan untuk tanggal ini sudah ada.', 409);
    throw e;
  } finally {
    session.endSession();
  }
});

const getDailyProgress = asyncHandler(async (req, res) => {
  const { projectId, local_date } = req.params;
  const authorId = await resolveEmployeeId(req.user?.id); // Employee._id

  if (!/^\d{4}-\d{2}-\d{2}$/.test(local_date))
    throwError('Tanggal harus format YYYY-MM-DD', 400);

  const project = await ProgressProject.findById(projectId)
    .select('start_date end_date progress')
    .lean();
  if (!project) throwError('Project tidak ditemukan', 404);

  const doc = await DailyProgress.findOne({
    project: projectId,
    author: authorId,
    local_date
  })
    .populate('author', 'name') // karena ref ke Employee
    .lean();

  res.json({
    data: doc || null,
    project_progress: pickProgress(project.progress),
    start_date: toDateStr(project.start_date),
    end_date: toDateStr(project.end_date)
  });
});

const removeDailyProgress = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { projectId, local_date } = req.params;
    const authorId = await resolveEmployeeId(req.user?.id); // Employee._id

    if (!/^\d{4}-\d{2}-\d{2}$/.test(local_date))
      throwError('Tanggal harus YYYY-MM-DD', 400);

    const project = await ProgressProject.findById(projectId).session(session);
    if (!project) throwError('Project tidak ditemukan', 404);

    const doc = await DailyProgress.findOne({
      project: projectId,
      author: authorId,
      local_date
    }).session(session);
    if (!doc) throwError('Laporan hari itu tidak ditemukan', 404);

    const sum = {
      sondir: { points: 0, depthMax: 0 },
      bor: { points: 0, depthMax: 0 },
      cptu: { points: 0, depthMax: 0 }
    };
    for (const it of doc.items) {
      sum[it.method].points += Number(it.points_done || 0);
      sum[it.method].depthMax = Math.max(
        sum[it.method].depthMax,
        Number(it.depth_reached || 0)
      );
    }

    await DailyProgress.deleteOne({ _id: doc._id }).session(session);

    const dec = {
      'progress.sondir.completed_points': -sum.sondir.points,
      'progress.bor.completed_points': -sum.bor.points,
      'progress.cptu.completed_points': -sum.cptu.points
    };
    await ProgressProject.updateOne({ _id: projectId }, { $inc: dec }).session(
      session
    );

    const needRecalc = [];
    if (
      sum.sondir.depthMax &&
      sum.sondir.depthMax >= (project.progress?.sondir?.max_depth || 0)
    )
      needRecalc.push('sondir');
    if (
      sum.bor.depthMax &&
      sum.bor.depthMax >= (project.progress?.bor?.max_depth || 0)
    )
      needRecalc.push('bor');
    if (
      sum.cptu.depthMax &&
      sum.cptu.depthMax >= (project.progress?.cptu?.max_depth || 0)
    )
      needRecalc.push('cptu');

    if (needRecalc.length) {
      const { Types } = require('mongoose');
      const agg = await DailyProgress.aggregate([
        { $match: { project: new Types.ObjectId(projectId) } },
        { $unwind: '$items' },
        { $match: { 'items.method': { $in: needRecalc } } },
        {
          $group: {
            _id: '$items.method',
            maxDepth: { $max: '$items.depth_reached' }
          }
        }
      ]).session(session);

      const set = {};
      for (const m of needRecalc) {
        const found = agg.find((a) => a._id === m);
        set[`progress.${m}.max_depth`] = found
          ? Number(found.maxDepth || 0)
          : 0;
      }
      await ProgressProject.updateOne(
        { _id: projectId },
        { $set: set }
      ).session(session);
    }

    await session.commitTransaction();
    res.json({ message: 'Laporan harian dihapus' });
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
});

const getAllDailyProgress = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { from, to, author, page = 1, limit = 20 } = req.query;

  const project = await ProgressProject.findById(projectId).select('_id');
  if (!project) throwError('Project tidak ditemukan', 404);

  const q = { project: projectId };
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from))
      throwError('Tanggal harus YYYY-MM-DD', 400);
    q.local_date = { ...(q.local_date || {}), $gte: from };
  }
  if (to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to))
      throwError('Tanggal harus YYYY-MM-DD', 400);
    q.local_date = { ...(q.local_date || {}), $lte: to };
  }

  // Filter author:
  // - "me" => terjemahkan ke Employee._id milik user saat ini
  // - string ObjectId lain => dianggap Employee._id langsung
  if (author) {
    if (author === 'me') {
      const meEmpId = await resolveEmployeeId(req.user?.id);
      q.author = meEmpId;
    } else {
      q.author = author;
    }
  }

  const pg = Math.max(1, Number(page));
  const lim = Math.max(1, Math.min(100, Number(limit)));

  const [items, total] = await Promise.all([
    DailyProgress.find(q)
      .sort({ local_date: -1, _id: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate('author', 'name') // Employee
      .lean(),
    DailyProgress.countDocuments(q)
  ]);

  res.json({ items, page: pg, limit: lim, total });
});

const getProjects = asyncHandler(async (req, res) => {
  const projects = await ProgressProject.find()
    .select('project_name location start_date end_date progress client')
    .populate('client', 'name')
    .lean();
  res.status(200).json(projects);
});

const getProject = asyncHandler(async (req, res) => {
  const project = await ProgressProject.findById(req.params.id)
    .select('project_name location start_date end_date progress client')
    .populate('client', 'name')
    .lean();
  if (!project) throwError('Proyek tidak terdaftar!', 400);

  res.status(200).json(project);
});

module.exports = {
  upsertDailyProgress,
  getDailyProgress,
  removeDailyProgress,
  getAllDailyProgress,
  getProjects,
  getProject
};
