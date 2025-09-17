// controllers/rapController.js
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const path = require('path');

const RAP = require('../../model/rapModel');
const Client = require('../../model/clientModel');
const ProfitReport = require('../../model/profitReportModel');
const ExpenseRequest = require('../../model/expenseRequestModel');

const throwError = require('../../utils/throwError');
const { uploadBuffer, getFileUrl, deleteFile } = require('../../utils/wasabi');
const formatDate = require('../../utils/formatDate');

/* ================= Helpers ================= */
const num = (x) => Number(x) || 0;

function mapExpenseTypeReverse(group) {
  // HARUS persis sama dengan enum di ExpenseRequest
  const mapping = {
    persiapan_pekerjaan: 'Persiapan Pekerjaan',
    operasional_lapangan: 'Operasional Lapangan',
    operasional_tenaga_ahli: 'Operasional Tenaga Ahli',
    sewa_alat: 'Sewa Alat',
    operasional_lab: 'Operasional Lab',
    pajak: 'Pajak',
    biaya_lain_lain: 'Biaya Lain'
  };
  return mapping[group] || null;
}

const GROUP_KEYS = [
  'persiapan_pekerjaan',
  'operasional_lapangan',
  'operasional_tenaga_ahli',
  'sewa_alat',
  'operasional_lab',
  'pajak',
  'biaya_lain_lain'
];

/* ================= Controllers ================= */

// CREATE
const addRAP = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      project_name,
      nilai_pekerjaan,
      nomor_kontrak,
      nilai_pekerjaan_addendum,
      nomor_kontrak_addendum,
      nilai_fix_pekerjaan,
      name,
      client,
      date_start,
      date_end,
      location,
      address,
      npwp,
      phone,
      persiapan_pekerjaan,
      operasional_lapangan,
      operasional_tenaga_ahli,
      sewa_alat,
      operasional_lab,
      pajak,
      biaya_lain_lain
    } = req.body || {};

    if (
      !project_name ||
      !nilai_pekerjaan ||
      !nomor_kontrak ||
      !name ||
      !client ||
      !date_start ||
      !location ||
      !address ||
      !npwp ||
      !phone
    ) {
      throwError('Field wajib belum lengkap', 400);
    }

    if (!mongoose.Types.ObjectId.isValid(client)) {
      throwError('ID client tidak valid', 400);
    }
    const clientDoc = await Client.findById(client).select('_id').lean();
    if (!clientDoc) throwError('Client tidak ditemukan', 404);

    // upload kontrak (opsional)
    let kontrakFileMeta = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname);
      const key = `rap/${project_name}/kontrak_${formatDate()}${ext}`;
      await uploadBuffer(key, req.file.buffer);
      kontrakFileMeta = {
        key,
        contentType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date()
      };
    }

    // buat RAP
    const [rap] = await RAP.create(
      [
        {
          project_name,
          nilai_pekerjaan,
          nomor_kontrak,
          nilai_pekerjaan_addendum: nilai_pekerjaan_addendum ?? null,
          nomor_kontrak_addendum: nomor_kontrak_addendum ?? null,
          nilai_fix_pekerjaan: nilai_fix_pekerjaan ?? null,
          location,
          name,
          client,
          date_start,
          date_end: date_end ?? null,
          address,
          npwp,
          phone,
          persiapan_pekerjaan,
          operasional_lapangan,
          operasional_tenaga_ahli,
          sewa_alat,
          operasional_lab,
          pajak,
          biaya_lain_lain,
          kontrak_file: kontrakFileMeta
        }
      ],
      { session }
    );

    // inisiasi ProfitReport mirror dari RAP (tanpa biaya/budget; actual akan diambil dari RAP)
    await ProfitReport.create(
      [
        {
          project_name: rap.project_name,
          kontrak_file: rap.kontrak_file,
          nilai_pekerjaan: rap.nilai_pekerjaan,
          nilai_pekerjaan_addendum: rap.nilai_pekerjaan_addendum ?? null,
          nilai_fix_pekerjaan: rap.nilai_fix_pekerjaan ?? rap.nilai_pekerjaan,
          nomor_kontrak: rap.nomor_kontrak,
          nomor_kontrak_addendum: rap.nomor_kontrak_addendum ?? null,
          client_name: rap.name,
          client_address: rap.address,
          client_npwp: rap.npwp,
          // detail kosong (opsional; Profit dihitung pakai RAP)
          persiapan_pekerjaan: {},
          operasional_lapangan: {},
          operasional_tenaga_ahli: {},
          sewa_alat: {},
          operasional_lab: {},
          pajak: {},
          biaya_lain_lain: {}
        }
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json({ rap });
  } catch (error) {
    await session.abortTransaction();

    // soft-cleanup file jika upload sukses tapi transaksi DB gagal
    if (req.file && error?.codeName === 'WriteConflict') {
      try {
        const ext = path.extname(req.file.originalname);
        const key = `rap/${
          req.body?.project_name
        }/kontrak_${formatDate()}${ext}`;
        await deleteFile(key);
      } catch (_) {}
    }

    throw error;
  } finally {
    session.endSession();
  }
});

// LIST (pagination + filter + sort)
const getAllRAP = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { project_name, nomor_kontrak, name, search, sort } = req.query;

  const filter = {};
  if (project_name)
    filter.project_name = { $regex: project_name, $options: 'i' };
  if (nomor_kontrak)
    filter.nomor_kontrak = { $regex: nomor_kontrak, $options: 'i' };
  if (name) filter.name = name;
  if (search) {
    filter.$or = [
      { project_name: { $regex: search, $options: 'i' } },
      { nomor_kontrak: { $regex: search, $options: 'i' } }
    ];
  }

  const WHITELIST_SORT = new Set([
    'createdAt',
    'project_name',
    'nomor_kontrak',
    'nilai_pekerjaan'
  ]);
  let sortOption = { createdAt: -1 };
  if (sort) {
    const [field, order] = String(sort).split(':');
    if (WHITELIST_SORT.has(field)) {
      sortOption = { [field]: order === 'asc' ? 1 : -1 };
    }
  }

  const totalItems = await RAP.countDocuments(filter);
  const raps = await RAP.find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sortOption)
    .lean();

  res.status(200).json({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    sort: sortOption,
    data: raps
  });
});

// GET ONE (+ kontrak url)
const getRAP = asyncHandler(async (req, res) => {
  const rap = await RAP.findById(req.params.id);
  if (!rap) throwError('RAP tidak ditemukan!', 404);

  let kontrakUrl = null;
  if (rap.kontrak_file?.key) {
    kontrakUrl = await getFileUrl(rap.kontrak_file.key);
  }

  res.status(200).json({
    ...rap.toObject(),
    kontrak_pdf_url: kontrakUrl
  });
});

const updateRAP = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const rap = await RAP.findById(req.params.id).session(session);
    if (!rap) throwError('RAP tidak ditemukan!', 404);

    // handle file kontrak (replace)
    if (req.file) {
      const ext = path.extname(req.file.originalname);
      const key = `rap/${rap.project_name}/kontrak_${formatDate()}${ext}`;

      if (rap.kontrak_file?.key) {
        try {
          await deleteFile(rap.kontrak_file.key);
        } catch (_) {}
      }

      await uploadBuffer(key, req.file.buffer);
      rap.kontrak_file = {
        key,
        contentType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date()
      };
    }

    const oldNomorKontrak = rap.nomor_kontrak;
    const oldProjectName = rap.project_name;

    // assign field utama
    const body = req.body || {};
    rap.project_name = body.project_name ?? rap.project_name;
    rap.address = body.address ?? rap.address;
    rap.name = body.name ?? rap.name;
    rap.phone = body.phone ?? rap.phone;
    rap.npwp = body.npwp ?? rap.npwp;
    rap.client = body.client ?? rap.client;
    rap.location = body.location ?? rap.location;
    rap.date_start = body.date_start ?? rap.date_start;
    rap.date_end = body.date_end ?? rap.date_end;

    rap.nilai_pekerjaan = body.nilai_pekerjaan ?? rap.nilai_pekerjaan;
    rap.nomor_kontrak = body.nomor_kontrak ?? rap.nomor_kontrak;
    rap.nilai_pekerjaan_addendum =
      body.nilai_pekerjaan_addendum ?? rap.nilai_pekerjaan_addendum;
    rap.nomor_kontrak_addendum =
      body.nomor_kontrak_addendum ?? rap.nomor_kontrak_addendum;
    rap.nilai_fix_pekerjaan =
      body.nilai_fix_pekerjaan ?? rap.nilai_fix_pekerjaan;

    rap.persiapan_pekerjaan =
      body.persiapan_pekerjaan ?? rap.persiapan_pekerjaan;
    rap.operasional_lapangan =
      body.operasional_lapangan ?? rap.operasional_lapangan;
    rap.operasional_tenaga_ahli =
      body.operasional_tenaga_ahli ?? rap.operasional_tenaga_ahli;
    rap.sewa_alat = body.sewa_alat ?? rap.sewa_alat;
    rap.operasional_lab = body.operasional_lab ?? rap.operasional_lab;
    rap.pajak = body.pajak ?? rap.pajak;
    rap.biaya_lain_lain = body.biaya_lain_lain ?? rap.biaya_lain_lain;

    for (const group of GROUP_KEYS) {
      if (!rap[group]) continue;
      for (const [category, biaya] of Object.entries(rap[group])) {
        if (!biaya) continue;
        biaya.biaya_pengajuan = Math.max(0, num(biaya.biaya_pengajuan));
        biaya.jumlah = num(biaya.jumlah);
        biaya.aktual = Math.max(0, num(biaya.aktual));
        biaya.is_overbudget = num(biaya.biaya_pengajuan) > num(biaya.jumlah);
      }
    }

    await rap.save({ session });

    await ProfitReport.findOneAndUpdate(
      {
        $or: [
          { nomor_kontrak: oldNomorKontrak },
          { project_name: oldProjectName }
        ]
      },
      {
        project_name: rap.project_name,
        kontrak_file: rap.kontrak_file,
        nilai_pekerjaan: rap.nilai_pekerjaan,
        nilai_pekerjaan_addendum: rap.nilai_pekerjaan_addendum ?? null,
        nilai_fix_pekerjaan: rap.nilai_fix_pekerjaan ?? rap.nilai_pekerjaan,
        nomor_kontrak: rap.nomor_kontrak,
        nomor_kontrak_addendum: rap.nomor_kontrak_addendum ?? null,
        client_name: rap.name,
        client_address: rap.address,
        client_npwp: rap.npwp
      },
      { new: true, upsert: true, session }
    );

    for (const group of GROUP_KEYS) {
      if (!rap[group]) continue;

      const expenseTypeStr = mapExpenseTypeReverse(group);
      if (!expenseTypeStr) continue;

      for (const [category, biaya] of Object.entries(rap[group])) {
        if (!biaya) continue;

        await ExpenseRequest.updateMany(
          {
            project: rap._id,
            expense_type: expenseTypeStr,
            'details.category': category
          },
          {
            $set: {
              'details.$[elem].is_overbudget': !!biaya.is_overbudget
            }
          },
          {
            arrayFilters: [{ 'elem.category': category }],
            session
          }
        );
      }
    }

    await session.commitTransaction();
    res.status(200).json({ rap });
  } catch (error) {
    await session.abortTransaction();

    if (req.file) {
      try {
        const ext = path.extname(req.file.originalname);
        const key = `rap/${
          req.body?.project_name || 'unknown'
        }/kontrak_${formatDate()}${ext}`;
        await deleteFile(key);
      } catch (_) {}
    }

    if (error?.code === 11000 && error?.keyPattern?.nomor_kontrak) {
      throwError('Nomor kontrak sudah dipakai', 409);
    }

    throw error;
  } finally {
    session.endSession();
  }
});

const removeRAP = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const rap = await RAP.findById(req.params.id).session(session);
    if (!rap) throwError('Data RAP tidak ditemukan!', 404);

    if (rap.kontrak_file?.key) {
      try {
        await deleteFile(rap.kontrak_file.key);
      } catch (_) {}
    }

    await rap.deleteOne({ session });

    await ProfitReport.deleteOne(
      {
        $or: [
          { nomor_kontrak: rap.nomor_kontrak },
          { project_name: rap.project_name }
        ]
      },
      { session }
    );

    await session.commitTransaction();
    res
      .status(200)
      .json({ message: 'Data RAP & Profit Report berhasil dihapus.' });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const getAllClient = asyncHandler(async (req, res) => {
  const client = await Client.find().select(
    'name address npwp emergency_contact_number'
  );
  res.json(client || []);
});

module.exports = {
  addRAP,
  getAllRAP,
  getRAP,
  updateRAP,
  removeRAP,
  getAllClient
};
