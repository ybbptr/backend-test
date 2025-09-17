const mongoose = require('mongoose');

const biayaSchema = new mongoose.Schema(
  {
    jumlah: { type: Number, default: 0 }, // budget awal
    biaya_pengajuan: { type: Number, default: 0 }, // total pengajuan
    aktual: { type: Number, default: 0 }, // realisasi
    is_overbudget: { type: Boolean, default: false }
  },
  { _id: false }
);

const withDefault = { type: biayaSchema, default: () => ({}) };

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
    nilai_pekerjaan_addendum: { type: Number, default: null },
    nilai_fix_pekerjaan: { type: Number, default: null },

    nomor_kontrak: { type: String, required: true },
    nomor_kontrak_addendum: { type: String, default: null },

    location: { type: String, required: true },

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
      biaya_survey_awal_lapangan: withDefault,
      uang_saku_survey_osa: withDefault,
      biaya_perizinan_koordinasi_lokasi: withDefault,
      akomodasi_surveyor: withDefault,
      mobilisasi_demobilisasi_alat: withDefault,
      mobilisasi_demobilisasi_tim: withDefault,
      akomodasi_tim: withDefault,
      penginapan_mess: withDefault,
      biaya_kalibrasi_alat_mesin: withDefault,
      biaya_accessories_alat_mesin: withDefault,
      biaya_asuransi_tim: withDefault,
      biaya_apd: withDefault,
      biaya_atk: withDefault
    },

    operasional_lapangan: {
      gaji: withDefault,
      gaji_tenaga_lokal: withDefault,
      uang_makan: withDefault,
      uang_wakar: withDefault,
      akomodasi_transport: withDefault,
      mobilisasi_demobilisasi_titik: withDefault,
      biaya_rtk_tak_terduga: withDefault
    },

    operasional_tenaga_ahli: {
      penginapan: withDefault,
      transportasi_akomodasi_lokal: withDefault,
      transportasi_akomodasi_site: withDefault,
      uang_makan: withDefault,
      osa: withDefault,
      fee_tenaga_ahli: withDefault
    },

    sewa_alat: {
      alat_sondir: withDefault,
      alat_bor: withDefault,
      alat_cptu: withDefault,
      alat_topography: withDefault,
      alat_geolistrik: withDefault
    },

    operasional_lab: {
      ambil_sample: withDefault,
      packaging_sample: withDefault,
      kirim_sample: withDefault,
      uji_lab_vendor_luar: withDefault,
      biaya_perlengkapan_lab: withDefault,
      alat_uji_lab: withDefault
    },

    pajak: {
      pajak_tenaga_ahli: withDefault,
      pajak_sewa: withDefault,
      pajak_pph_final: withDefault,
      pajak_lapangan: withDefault,
      pajak_ppn: withDefault
    },

    biaya_lain_lain: {
      scf: withDefault,
      admin_bank: withDefault
    }
  },
  { timestamps: true }
);

rapSchema.post('save', async function (doc, next) {
  try {
    // pastikan nama model bener
    const ProgressProject = mongoose.model('ProgressProject');

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
