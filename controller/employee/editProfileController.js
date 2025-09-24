const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const {
  uploadBuffer,
  getFileUrl,
  deleteFile,
  getFileStream
} = require('../../utils/wasabi');
const path = require('path');
const archiver = require('archiver');
const formatDate = require('../../utils/formatDate');
const Employee = require('../../model/employeeModel');

const getMyProfile = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id })
    .populate('user', 'email') // email hanya tampil, bukan diubah
    .exec();

  if (!employee) throwError('Profil karyawan tidak ditemukan!', 404);

  // generate signed URL untuk dokumen
  const docsEntries = await Promise.all(
    Object.entries(employee.documents || {}).map(async ([key, value]) => {
      if (value && value.key) {
        return [
          key,
          {
            ...(value.toObject?.() || value),
            url: await getFileUrl(value.key, 300, 'inline')
          }
        ];
      }
      return null;
    })
  );

  const docsWithUrl = Object.fromEntries(docsEntries.filter(Boolean));

  res.status(200).json({
    ...employee.toObject(),
    documents: docsWithUrl
  });
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id });
  if (!employee) throwError('Profil karyawan tidak ditemukan!', 404);

  const fields = [
    'name',
    'nik',
    'age',
    'phone',
    'address',
    'employment_type',
    'religion',
    'height',
    'weight',
    'number_of_children',
    'place_of_birth',
    'date_of_birth',
    'status',
    'bank_account_number',
    'emergency_contact_number',
    'position',
    'blood_type',
    'start_date',
    'end_date'
  ];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      employee[field] = req.body[field];
    }
  }

  // handle dokumen upload
  if (req.files) {
    for (const field of [
      'ktp',
      'asuransi',
      'mcu',
      'keterangan_sehat',
      'kelakuan_baik',
      'vaksinasi'
    ]) {
      if (req.files[field]) {
        const file = req.files[field][0];
        const ext = path.extname(file.originalname);

        // hapus file lama kalau ada
        if (employee.documents?.[field]?.key) {
          await deleteFile(employee.documents[field].key);
        }

        const key = `karyawan/${employee._id}/${field}_${formatDate()}${ext}`;
        await uploadBuffer(key, file.buffer, { contentType: file.mimetype });

        employee.documents[field] = {
          key,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }
    }
  }

  await employee.save();

  res.status(200).json({
    message: 'Profil karyawan berhasil diperbarui',
    data: employee
  });
});

const downloadMyDocs = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ user: req.user.id });
  if (!employee) throwError('Profil karyawan tidak ditemukan!', 404);

  const docs = employee.documents || {};
  const docEntries = Object.entries(docs).filter(([_, v]) => v?.key);

  if (docEntries.length === 0) {
    return res.status(404).json({ message: 'Tidak ada dokumen untuk diunduh' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${employee.name}-docs.zip"`
  );

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  for (const [docName, docValue] of docEntries) {
    const stream = await getFileStream(docValue.key);
    const ext = path.extname(docValue.key) || '';
    archive.append(stream, { name: `${docName}${ext}` });
  }

  await archive.finalize();
});

module.exports = {
  updateMyProfile,
  getMyProfile,
  downloadMyDocs
};
