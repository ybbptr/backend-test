const ProfitReport = require('../../model/profitReportModel');
const RAP = require('../../model/rapModel');
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const getAllProfitReports = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { search, sort } = req.query;

  const filter = {};
  if (search) {
    filter.$or = [
      { project_name: { $regex: search, $options: 'i' } },
      { nomor_kontrak: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = sort.split(':');
    sortOption = { [field]: order === 'asc' ? 1 : -1 };
  }

  const totalItems = await ProfitReport.countDocuments(filter);
  const reports = await ProfitReport.find(filter)
    .select(
      'project_name kontrak_file nilai_fix_pekerjaan nomor_kontrak_addendum nomor_kontrak client_name createdAt'
    )
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  // hitung profit untuk tiap proyek
  const data = [];
  for (const report of reports) {
    const rap = await RAP.findOne({
      $or: [
        { nomor_kontrak: report.nomor_kontrak },
        { project_name: report.project_name }
      ]
    }).lean();

    let rap_total = 0;
    let actual_total = 0;

    if (rap) {
      const rapKategori = [
        rap.persiapan_pekerjaan,
        rap.operasional_lapangan,
        rap.operasional_tenaga_ahli,
        rap.sewa_alat,
        rap.operasional_lab,
        rap.pajak,
        rap.biaya_lain_lain
      ];

      rapKategori.forEach((cat) => {
        if (!cat) return;
        for (const val of Object.values(cat)) {
          rap_total += val?.jumlah || 0;
          actual_total += val?.aktual || 0;
        }
      });
    }

    const profit = (report.nilai_fix_pekerjaan || 0) - actual_total;

    data.push({
      ...report,
      rap_total,
      actual_total,
      profit
    });
  }

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data
  });
});

const getProfitReportDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const report = await ProfitReport.findById(id).lean();
  if (!report) throwError('Profit Report tidak ditemukan', 404);

  const rap = await RAP.findOne({ nomor_kontrak: report.nomor_kontrak }).lean();

  const kategori = [
    report.persiapan_pekerjaan,
    report.operasional_lapangan,
    report.operasional_tenaga_ahli,
    report.sewa_alat,
    report.operasional_lab,
    report.pajak,
    report.biaya_lain_lain
  ];

  let actual_total = 0;
  kategori.forEach((cat) => {
    if (!cat) return;
    for (const val of Object.values(cat)) {
      actual_total += val?.aktual || 0;
    }
  });

  let rap_total = 0;
  if (rap) {
    const rapKategori = [
      rap.persiapan_pekerjaan,
      rap.operasional_lapangan,
      rap.operasional_tenaga_ahli,
      rap.sewa_alat,
      rap.operasional_lab,
      rap.pajak,
      rap.biaya_lain_lain
    ];

    rapKategori.forEach((cat) => {
      if (!cat) return;
      for (const val of Object.values(cat)) {
        rap_total += val?.jumlah || 0;
      }
    });
  }

  const profit = (report.nilai_fix_pekerjaan || 0) - actual_total;

  res.status(200).json({
    success: true,
    data: {
      header: {
        project_name: report.project_name,
        kontrak_file: report.kontrak_file,
        nilai_pekerjaan: report.nilai_pekerjaan,
        nilai_pekerjaan_addendum: report.nilai_pekerjaan_addendum,
        nilai_fix_pekerjaan: report.nilai_fix_pekerjaan,
        nomor_kontrak: report.nomor_kontrak,
        nomor_kontrak_addendum: report.nomor_kontrak_addendum,
        client_name: report.client_name,
        address: report.address,
        npwp: report.npwp
      },
      summary: {
        rap_total,
        actual_total,
        profit
      },
      detail: {
        persiapan_pekerjaan: report.persiapan_pekerjaan,
        operasional_lapangan: report.operasional_lapangan,
        operasional_tenaga_ahli: report.operasional_tenaga_ahli,
        sewa_alat: report.sewa_alat,
        operasional_lab: report.operasional_lab,
        pajak: report.pajak,
        biaya_lain_lain: report.biaya_lain_lain
      }
    }
  });
});

module.exports = {
  getAllProfitReports,
  getProfitReportDetail
};
