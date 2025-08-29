const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const createOrder = asyncHandler(async (req, res) => {
  const { name, company, email, contact, service, message } = req.body || {};
  if (!name || !email || !service) {
    throwError('Nama, email, dan layanan wajib diisi', 400);
  }

  const attachments = [];
  if (req.file) {
    attachments.push({
      filename: req.file.originalname,
      content: req.file.buffer
    });
  }
  if (Array.isArray(req.files)) {
    for (const f of req.files) {
      attachments.push({ filename: f.originalname, content: f.buffer });
    }
  }

  const subject = `Pesanan Layanan: ${service} | Dari ${name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff;">
      <div style="display: flex; align-items: center; margin-bottom: 16px">
        <img src="https://backend-test-production-51c5.up.railway.app/assets/soilab-logo.png" alt="Logo" style="height: 40px; margin-right: 12px" />
      </div>
      <h2 style="color: #2dabe6; font-size: 18px; margin-top: 25px">📦 Pesanan Baru Telah Masuk</h2>
      <p style="font-size: 13px; color: #888; text-align: right; margin: 0 0 10px 0">
        Diterima pada: ${new Date().toLocaleString('id-ID')}
      </p>

      <div style="margin-bottom: 15px">
        <p style="font-size: 14px; margin: 4px 0"><strong>Pelanggan:</strong> ${name} (${email})</p>
        <p style="font-size: 14px; margin: 4px 0"><strong>Layanan:</strong> ${service}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 10px">
        <tr><td style="padding: 8px; font-weight: bold">Nama</td><td style="padding: 8px">${name}</td></tr>
        <tr style="background-color: #f9f9f9"><td style="padding: 8px; font-weight: bold">Perusahaan</td><td style="padding: 8px">${
          company || '-'
        }</td></tr>
        <tr><td style="padding: 8px; font-weight: bold">Email</td><td style="padding: 8px">${email}</td></tr>
        <tr style="background-color: #f9f9f9"><td style="padding: 8px; font-weight: bold">Kontak</td><td style="padding: 8px">${
          contact || '-'
        }</td></tr>
        <tr><td style="padding: 8px; font-weight: bold">Layanan</td><td style="padding: 8px; text-transform: capitalize">${service}</td></tr>
      </table>

      <div style="margin-top: 20px">
        <h4 style="color: #2dabe6">📝 Pesan Pelanggan:</h4>
        <p style="background-color: #f1f1f1; padding: 10px; border-radius: 5px">${
          message || '-'
        }</p>
      </div>

      ${
        attachments.length
          ? `
      <div style="margin-top: 20px">
        <h4 style="color: #2dabe6">📎 Lampiran:</h4>
        <p style="font-size: 14px; margin: 0">
          ${
            req.file
              ? `${req.file.originalname} (${(req.file.size / 1024).toFixed(
                  1
                )} KB)`
              : `${attachments.length} file`
          }
        </p>
      </div>`
          : ''
      }

      <div style="background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; margin-top: 20px; border-radius: 5px;">
        <strong>📌 Notes:</strong>
        <p style="margin: 5px 0 0 0; font-size: 13px">
          Pastikan untuk mengecek file lampiran bila tersedia. Data ini berasal dari form layanan pemesanan.
        </p>
      </div>
    </div>
  `.trim();

  const from = 'onboarding@resend.dev';
  const to = process.env.COMPANY_EMAIL;

  const payload = {
    from: `SOILAB Orders <${from}>`,
    to,
    subject,
    html,
    ...(attachments.length ? { attachments } : {})
  };

  const { data, error } = await resend.emails.send(payload);
  if (error) {
    console.error('Resend error:', error);
    throwError('Gagal mengirim email pesanan', error.statusCode || 500);
  }

  res.status(200).json({ message: 'Pesanan berhasil dikirim!', id: data?.id });
});

module.exports = createOrder;
