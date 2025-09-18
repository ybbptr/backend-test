const asyncHandler = require('express-async-handler');
const ProgressProject = require('../model/progressProjectModel');
const throwError = require('../utils/throwError');

function calculateRAPTotals(rapDoc) {
  const num = (x) => Number(x) || 0;

  if (!rapDoc) {
    return {
      max_pengeluaran: 0,
      total_pengajuan: 0,
      total_aktual: 0,
      dana_sisa: 0
    };
  }

  let total_pengajuan = 0; // = sum(biaya_pengajuan) → PD approved
  let total_aktual = 0; // = sum(aktual) → PV approved

  const categories = [
    'persiapan_pekerjaan',
    'operasional_lapangan',
    'operasional_tenaga_ahli',
    'sewa_alat',
    'operasional_lab',
    'pajak',
    'biaya_lain_lain'
  ];

  for (const cat of categories) {
    const group = rapDoc[cat];
    if (!group) continue;
    for (const biaya of Object.values(group)) {
      if (!biaya) continue;
      total_pengajuan += num(biaya.biaya_pengajuan);
      total_aktual += num(biaya.aktual);
    }
  }

  const max_pengeluaran =
    rapDoc.nilai_fix_pekerjaan ?? rapDoc.nilai_pekerjaan ?? 0;
  const dana_sisa = max_pengeluaran - total_aktual;

  return { max_pengeluaran, total_pengajuan, total_aktual, dana_sisa };
}

const getProjects = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || '';
  const filter = search
    ? {
        $or: [
          { project_name: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (req.query.client) {
    filter.client = req.query.client;
  }

  const totalItems = await ProgressProject.countDocuments(filter);
  const data = await ProgressProject.find(filter)
    .populate('client', 'name')
    .populate('rap', 'nilai_pekerjaan nilai_fix_pekerjaan project_name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

const getProject = asyncHandler(async (req, res) => {
  const project = await ProgressProject.findById(req.params.id)
    .populate('client', 'name')
    .populate('rap')
    .lean();

  if (!project) throwError('Proyek tidak ditemukan', 404);

  res.status(200).json({
    ...project,
    financials: calculateRAPTotals(project.rap)
  });
});

module.exports = {
  getProjects,
  getProject
};
