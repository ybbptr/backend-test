const mongoose = require('mongoose');

const biayaSchema = new mongoose.Schema(
  {
    jumlah: { type: Number, default: 0 }, // budget/plafon awal
    biaya_pengajuan: { type: Number, default: 0 }, // total biaya pengajuan (approve)
    aktual: { type: Number, default: 0 }, // realisasi pertanggungjawaban
    overBudget: { type: Boolean, default: false } // flag kalau pernah over budget
  },
  { _id: false }
);

const rapSchema = new mongoose.Schema(
  {
    project_name: { type: String, required: true },

    kontrak_file: {
      key: String,
      contentType: String,
      size: Number,
      uploadedAt: Date
    },
    date_start: { type: Date, required: true },
    date_end: { type: Date, default: null },
    nilai_pekerjaan: { type: Number, required: true },
    nomor_kontrak: { type: String, required: true },
    location: { type: String, required: true },

    nilai_pekerjaan_addendum: { type: Number, default: null },
    nomor_kontrak_addendum: { type: String, default: null },
    nilai_fix_pekerjaan: { type: Number, default: null },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true
    },
    name: { type: String, required: true },
    address: { type: String, required: true },
    npwp: { type: String, required: true },
    phone: { type: String, required: true },

    persiapan_pekerjaan: {
      biaya_survey_awal_lapangan: biayaSchema,
      uang_saku_survey_osa: biayaSchema,
      biaya_perizinan_koordinasi_lokasi: biayaSchema,
      akomodasi_surveyor: biayaSchema,
      mobilisasi_demobilisasi_alat: biayaSchema,
      mobilisasi_demobilisasi_tim: biayaSchema,
      akomodasi_tim: biayaSchema,
      penginapan_mess: biayaSchema,
      biaya_kalibrasi_alat_mesin: biayaSchema,
      biaya_accessories_alat_mesin: biayaSchema,
      biaya_asuransi_tim: biayaSchema,
      biaya_apd: biayaSchema,
      biaya_atk: biayaSchema
    },

    operasional_lapangan: {
      gaji: biayaSchema,
      gaji_tenaga_lokal: biayaSchema,
      uang_makan: biayaSchema,
      uang_wakar: biayaSchema,
      akomodasi_transport: biayaSchema,
      mobilisasi_demobilisasi_titik: biayaSchema,
      biaya_rtk_tak_terduga: biayaSchema
    },

    operasional_tenaga_ahli: {
      penginapan: biayaSchema,
      transportasi_akomodasi_lokal: biayaSchema,
      transportasi_akomodasi_site: biayaSchema,
      uang_makan: biayaSchema,
      osa: biayaSchema,
      fee_tenaga_ahli: biayaSchema
    },

    sewa_alat: {
      alat_sondir: biayaSchema,
      alat_bor: biayaSchema,
      alat_cptu: biayaSchema,
      alat_topography: biayaSchema,
      alat_geolistrik: biayaSchema
    },

    operasional_lab: {
      ambil_sample: biayaSchema,
      packaging_sample: biayaSchema,
      kirim_sample: biayaSchema,
      uji_lab_vendor_luar: biayaSchema,
      biaya_perlengkapan_lab: biayaSchema,
      alat_uji_lab: biayaSchema
    },

    pajak: {
      pajak_tenaga_ahli: biayaSchema,
      pajak_sewa: biayaSchema,
      pajak_pph_final: biayaSchema,
      pajak_lapangan: biayaSchema,
      pajak_ppn: biayaSchema
    },

    biaya_lain_lain: {
      scf: biayaSchema,
      admin_bank: biayaSchema
    }
  },
  { timestamps: true }
);

// === Hook otomatis bikin ProgressProject saat RAP dibuat ===
rapSchema.post('save', async function (doc, next) {
  try {
    const ProgressProject = mongoose.model('Progress');

    const existing = await ProgressProject.findOne({ rap: doc._id });
    if (!existing) {
      await ProgressProject.create({
        rap: doc._id,
        client: doc.client,
        project_name: doc.project_name,
        location: doc.location,
        date_start: doc.date_start,
        date_end: doc.date_end,
        project_value: doc.nilai_pekerjaan,
        progress: {}
      });
    }

    next();
  } catch (err) {
    next(err);
  }
});

rapSchema.index({ project_name: 'text' });
rapSchema.index({ client: 1 });
rapSchema.index({ nomor_kontrak: 1 }, { unique: true });
rapSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RAP', rapSchema);
