// controllers/reports/profitReportController.js
'use strict';

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

const ProfitReport = require('../../model/profitReportModel');
const RAP = require('../../model/rapModel');
const throwError = require('../../utils/throwError');
const { getFileUrl } = require('../../utils/wasabi');

/* ============== Helpers ============== */
// Parser angka longgar (mis. "Rp 1.200.000")
const numLoose = (x) => {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x !== 'string') return 0;
  const cleaned = x.replace(/[^0-9]/g, '');
  return cleaned ? Number(cleaned) : 0;
};

// Reader field kategori RAP
const pickJumlah = (b) => numLoose(b?.jumlah ?? b?.total_jumlah ?? b?.budget);
const pickPengajuan = (b) =>
  numLoose(
    b?.biaya_pengajuan ?? b?.pengajuan_biaya ?? b?.pengajuan ?? b?.biaya
  );
const pickAktual = (b) => numLoose(b?.aktual);

// Kunci grup di RAP
const GROUP_KEYS = [
  'persiapan_pekerjaan',
  'operasional_lapangan',
  'operasional_tenaga_ahli',
  'sewa_alat',
  'operasional_lab',
  'pajak',
  'biaya_lain_lain'
];

/* ---------- Hitung metrics dari RAP ---------- */
function computeMetricsFromRap(rap) {
  let total_budget = 0;
  let total_pengajuan = 0;
  let total_aktual = 0;
  let overbudget_count = 0;
  let overbudget_value = 0;

  if (rap) {
    for (const g of GROUP_KEYS) {
      const bag = rap[g] || {};
      for (const b of Object.values(bag)) {
        if (!b) continue;
        const j = pickJumlah(b);
        const p = pickPengajuan(b);
        const a = pickAktual(b);

        total_budget += j;
        total_pengajuan += p;
        total_aktual += a;

        const gap = p - j;
        if (gap > 0) {
          overbudget_count += 1;
          overbudget_value += gap;
        }
      }
    }
  }

  // Nilai kontrak fix sebagai acuan profit
  const kontrak_value =
    rap?.nilai_fix_pekerjaan != null
      ? numLoose(rap.nilai_fix_pekerjaan)
      : numLoose(rap?.nilai_pekerjaan);

  const dana_sisa = kontrak_value - total_aktual;
  const sisa_budget = total_budget - total_pengajuan;

  // 🔥 Perubahan inti → profit dari kontrak - aktual - overbudget
  const profit = kontrak_value - total_aktual - overbudget_value;

  return {
    total_budget,
    total_pengajuan,
    total_aktual,
    overbudget_count,
    overbudget_value,
    max_pengeluaran: kontrak_value,
    dana_sisa,
    sisa_budget,
    profit
  };
}

/* ============== LIST ============== */
const getAllProfitReports = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { search, sort } = req.query;

  const filter = {};
  if (search) {
    filter.$or = [
      { project_name: { $regex: search, $options: 'i' } },
      { nomor_kontrak: { $regex: search, $options: 'i' } },
      { client_name: { $regex: search, $options: 'i' } }
    ];
  }

  const WHITELIST_SORT = new Set([
    'createdAt',
    'project_name',
    'nomor_kontrak',
    'client_name'
  ]);
  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = String(sort).split(':');
    if (WHITELIST_SORT.has(field))
      sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const totalItems = await ProfitReport.countDocuments(filter);
  const reports = await ProfitReport.find(filter)
    .select(
      '_id project_name nilai_fix_pekerjaan nilai_pekerjaan nomor_kontrak client_name rap_id'
    )
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  const data = [];
  for (const report of reports) {
    let rap = null;
    if (
      report.rap_id &&
      mongoose.Types.ObjectId.isValid(String(report.rap_id))
    ) {
      rap = await RAP.findById(report.rap_id).lean();
    }
    if (!rap) {
      rap =
        (await RAP.findOne({ nomor_kontrak: report.nomor_kontrak }).lean()) ||
        (await RAP.findOne({ project_name: report.project_name }).lean());
    }

    const kontrak_value =
      report.nilai_fix_pekerjaan ?? report.nilai_pekerjaan ?? 0;

    let rap_total = 0;
    let total_aktual = 0;
    let profit = 0;

    if (rap) {
      const m = computeMetricsFromRap(rap);
      rap_total = m.total_budget;
      total_aktual = m.total_aktual;
      profit = m.profit; // 🔥 ambil profit dari helper
    }

    data.push({
      _id: report._id,
      project_name: report.project_name,
      nomor_kontrak: report.nomor_kontrak,
      client_name: report.client_name,
      nilai_fix_pekerjaan: kontrak_value,
      rap_total,
      total_aktual,
      profit
    });
  }

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    data
  });
});

/* ============== DETAIL ============== */
const getProfitReportDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throwError('ID tidak valid', 400);

  const report = await ProfitReport.findById(id).lean();
  if (!report) throwError('Profit Report tidak ditemukan', 404);

  let rap = null;
  if (report.rap_id && mongoose.Types.ObjectId.isValid(String(report.rap_id))) {
    rap = await RAP.findById(report.rap_id).lean();
  }
  if (!rap) {
    rap =
      (await RAP.findOne({ nomor_kontrak: report.nomor_kontrak }).lean()) ||
      (await RAP.findOne({ project_name: report.project_name }).lean());
  }

  const metrics = computeMetricsFromRap(rap); // 🔥 profit udah dihitung di sini

  // Breakdown kategori tetap sama
  const detail = {
    persiapan_pekerjaan: {},
    operasional_lapangan: {},
    operasional_tenaga_ahli: {},
    sewa_alat: {},
    operasional_lab: {},
    pajak: {},
    biaya_lain_lain: {}
  };
  if (rap) {
    for (const g of GROUP_KEYS) {
      const bag = rap[g] || {};
      for (const [key, val] of Object.entries(bag)) {
        const jumlah = pickJumlah(val);
        const pengajuan = pickPengajuan(val);
        const aktual = pickAktual(val);
        detail[g][key] = {
          jumlah,
          biaya_pengajuan: pengajuan,
          aktual,
          over: Math.max(0, pengajuan - jumlah)
        };
      }
    }
  }

  let kontrak_pdf_url = null;
  if (report.kontrak_file?.key) {
    try {
      kontrak_pdf_url = await getFileUrl(report.kontrak_file.key);
    } catch (_) {}
  }

  res.status(200).json({
    success: true,
    data: {
      header: {
        project_name: report.project_name,
        kontrak_file: report.kontrak_file,
        kontrak_pdf_url,
        nilai_pekerjaan: report.nilai_pekerjaan,
        nilai_pekerjaan_addendum: report.nilai_pekerjaan_addendum,
        nilai_fix_pekerjaan:
          report.nilai_fix_pekerjaan ?? report.nilai_pekerjaan,
        nomor_kontrak: report.nomor_kontrak,
        nomor_kontrak_addendum: report.nomor_kontrak_addendum,
        client_name: report.client_name,
        address: report.address,
        npwp: report.npwp
      },
      summary: {
        ...metrics
      },
      detail
    }
  });
});

module.exports = {
  getAllProfitReports,
  getProfitReportDetail
};
