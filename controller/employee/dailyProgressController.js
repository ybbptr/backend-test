// controllers/dailyProgressController.js
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const Project = require('../../model/projectModel');
const DailyProgress = require('../../model/dailyProgressModel');

const todayLocalString = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const toDateStr = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

/* 
   Body:
   {
     "date": "YYYY-MM-DD",         // optional; default = hari ini
     "notes": "opsional",
     "items": [
       { "method": "sondir|bor|cptu", "points_done": 1, "depth_reached": 10.5 },
       ...
     ]
   }
*/
const upsertDailyProgress = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectId } = req.params;
    const authorId = req.user?.id;
    if (!authorId) throwError('Unauthorized', 401);

    const { date: rawDate, notes = '', items = [] } = req.body;

    const project = await Project.findById(projectId).session(session);
    if (!project) throwError('Project tidak ditemukan', 404);

    const local_date =
      rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? rawDate
        : todayLocalString();

    const startStr = toDateStr(project.start_date);
    if (local_date < startStr)
      throwError(
        'Tanggal progress tidak boleh sebelum tanggal mulai proyek.',
        400
      );

    if (project.end_date) {
      const endStr = toDateStr(project.end_date);
      if (local_date > endStr)
        throwError('Tanggal progress melewati tanggal selesai proyek.', 400);
    }

    // 4) Sanitasi items -> delta harian per metode
    const ALLOWED = new Set(['sondir', 'bor', 'cptu']);
    const cleanItems = (Array.isArray(items) ? items : [])
      .filter((it) => it && ALLOWED.has(it.method))
      .map((it) => ({
        method: it.method,
        points_done: Math.max(0, Number(it.points_done || 0)),
        depth_reached: Math.max(0, Number(it.depth_reached || 0))
      }));

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

    // 5) Apakah sudah ada laporan untuk (project, author, local_date)?
    const existing = await DailyProgress.findOne({
      project: projectId,
      author: authorId,
      local_date
    }).session(session);

    // 6) Siapkan perubahan ringkasan Project
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
      // Koreksi inc = (baru - lama)
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
      // Max depth tidak menurun saat edit (tetap ambil yang tertinggi)
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

    // 7) (Opsional tapi bagus) Cegah completed_points < 0 atau > total_points
    const cur = {
      sondir: project.progress?.sondir || {
        total_points: 0,
        completed_points: 0
      },
      bor: project.progress?.bor || { total_points: 0, completed_points: 0 },
      cptu: project.progress?.cptu || { total_points: 0, completed_points: 0 }
    };
    const nextCompleted = {
      sondir:
        cur.sondir.completed_points + inc['progress.sondir.completed_points'],
      bor: cur.bor.completed_points + inc['progress.bor.completed_points'],
      cptu: cur.cptu.completed_points + inc['progress.cptu.completed_points']
    };
    const violations = [];
    if (
      nextCompleted.sondir < 0 ||
      nextCompleted.sondir > cur.sondir.total_points
    )
      violations.push('sondir');
    if (nextCompleted.bor < 0 || nextCompleted.bor > cur.bor.total_points)
      violations.push('bor');
    if (nextCompleted.cptu < 0 || nextCompleted.cptu > cur.cptu.total_points)
      violations.push('cptu');
    if (violations.length) {
      throwError(
        `Completed points ${violations.join(
          ', '
        )} keluar batas (0..total_points).`,
        400
      );
    }

    // 8) Upsert dokumen harian
    const doc = await DailyProgress.findOneAndUpdate(
      { project: projectId, author: authorId, local_date },
      { $set: { local_date, notes, items: cleanItems } },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );

    // 9) Update ringkasan Project (denormalisasi)
    await Project.updateOne(
      { _id: projectId },
      { $inc: inc, $max: max },
      { session }
    );

    await session.commitTransaction();
    res.status(200).json({ message: 'Progress harian tersimpan', data: doc });
  } catch (err) {
    await session.abortTransaction();
    // duplikat (unique index) → konflik
    if (err && err.code === 11000)
      throwError('Laporan untuk tanggal ini sudah ada.', 409);
    throw err; // biar asyncHandler teruskan ke error handler global-mu
  } finally {
    session.endSession();
  }
});
