const asyncHandler = require('express-async-handler');
const ProgressProject = require('../model/progressProjectModel');
const throwError = require('../utils/throwError');

function calculateRAPTotals(rapDoc) {
  let total_pengajuan = 0;
  let total_aktual = 0;

  const addBiaya = (biaya) => {
    if (!biaya) return;
    total_pengajuan += biaya.jumlah || 0;
    total_aktual += biaya.aktual || 0;
  };

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
    Object.values(group).forEach(addBiaya);
  }

  const max_pengeluaran = rapDoc.nilai_pekerjaan || 0;
  const dana_sisa = max_pengeluaran - total_aktual;

  return { max_pengeluaran, total_pengajuan, total_aktual, dana_sisa };
}

const getProjects = asyncHandler(async (req, res) => {
  const projects = await ProgressProject.find()
    .populate('client', 'name') // ambil nama client aja
    .populate('rap', 'nilai_pekerjaan project_name') // rap minimal info
    .lean();

  res.status(200).json(projects);
});

const getProject = asyncHandler(async (req, res) => {
  const project = await ProgressProject.findById(req.params.id)
    .populate('client', 'name')
    .populate('rap');

  if (!project) throwError('Proyek tidak ditemukan', 404);

  res.status(200).json({
    ...project.toObject(),
    financials: calculateRAPTotals(project.rap)
  });
});

module.exports = {
  getProjects,
  getProject
};
