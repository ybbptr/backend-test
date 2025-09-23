const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const biayaSchema = new mongoose.Schema(
  { aktual: { type: Number, default: 0 } },
  { _id: false }
);

const profitReportSchema = new mongoose.Schema(
  {
    rap: {
      type: Types.ObjectId,
      ref: 'RAP',
      required: true
    },
    project_name: { type: String, required: true },

    kontrak_file: {
      key: String,
      contentType: String,
      size: Number,
      uploadedAt: Date
    },

    nilai_pekerjaan: { type: Number, required: true },
    nilai_pekerjaan_addendum: { type: Number, default: null },
    nilai_fix_pekerjaan: { type: Number, required: true },

    nomor_kontrak: { type: String, required: true },
    nomor_kontrak_addendum: { type: String, default: null },

    client_name: { type: String, required: true },
    address: { type: String, alias: 'client_address' },
    npwp: { type: String, alias: 'client_npwp' },

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
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

profitReportSchema.index({ project_name: 'text' });
profitReportSchema.index({ client_name: 1 });
profitReportSchema.index({ nomor_kontrak: 1 }, { unique: true });
profitReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ProfitReport', profitReportSchema);
