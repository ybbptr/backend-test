const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');
const nodemailer = require('nodemailer');

const createOrder = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Lampiran PDF wajib diunggah!' });
  }
  const { name, company, email, contact, service, message } = req.body || {};

  const attachment = {
    filename: req.file.originalname,
    content: req.file.buffer,
    contentType: req.file.mimetype
  };

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.COMPANY_EMAIL,
      pass: process.env.COMPANY_PASSWORD
    }
  });

  const mailFormat = {
    from: email,
    to: process.env.COMPANY_EMAIL,
    subject: `Pesanan Layanan: ${service} | Dari ${name}`,
    html: `
    <div
  style="
    font-family: Arial, sans-serif;
    max-width: 600px;
    margin: auto;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #ffffff;
  "
>
  <div style="display: flex; align-items: center; margin-bottom: 16px">
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUcAAABvCAYAAAB/wQKEAAAAAXNSR0IArs4c6QAAIABJREFUeF7sfQe4XFXV9rv3Pn36rakkQgBFRASkI6D40bvGiogFFAUVQREL8VNEUUBEQBS/IIpgUHrvNUhRRHoN6bffO+30s/f/rD03wd/CTQIJEWaeJwzJnDllnT3vWeVd72Jov9oWaFugbYG2Bf7FAqxtk7YF2hZoW6BtgX+1QBsc26uibYG2BdoW+DcWaINje1m0LdC2..." alt="Logo" style="height: 40px; margin-right: 12px" />

  </div>
  <h2 style="color: #2dabe6; font-size: 18px; margin-top: 25px">
    📦 Pesanan Baru Telah Masuk
  </h2>

  <p
    style="font-size: 13px; color: #888; text-align: right; margin: 0 0 10px 0"
  >
    Diterima pada: ${new Date().toLocaleString('id-ID')}
  </p>

  <div style="margin-bottom: 15px">
    <p style="font-size: 14px; margin: 4px 0">
      <strong>Pelanggan:</strong> ${name} (${email})
    </p>
    <p style="font-size: 14px; margin: 4px 0">
      <strong>Layanan:</strong> ${service}
    </p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-top: 10px">
    <tr>
      <td style="padding: 8px; font-weight: bold">Nama</td>
      <td style="padding: 8px">${name}</td>
    </tr>
    <tr style="background-color: #f9f9f9">
      <td style="padding: 8px; font-weight: bold">Perusahaan</td>
      <td style="padding: 8px">${company}</td>
    </tr>
    <tr>
      <td style="padding: 8px; font-weight: bold">Email</td>
      <td style="padding: 8px">${email}</td>
    </tr>
    <tr style="background-color: #f9f9f9">
      <td style="padding: 8px; font-weight: bold">Kontak</td>
      <td style="padding: 8px">${contact}</td>
    </tr>
    <tr>
      <td style="padding: 8px; font-weight: bold">Layanan</td>
      <td style="padding: 8px; text-transform: capitalize">${service}</td>
    </tr>
  </table>

  <div style="margin-top: 20px">
    <h4 style="color: #2dabe6">📝 Pesan Pelanggan:</h4>
    <p style="background-color: #f1f1f1; padding: 10px; border-radius: 5px">
      ${message}
    </p>
  </div>

  ${
    req.file
      ? `
  <div style="margin-top: 20px">
    <h4 style="color: #2dabe6">📎 Lampiran:</h4>
    <p style="font-size: 14px; margin: 0">
      ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)
    </p>
  </div>
  `
      : ''
  }

  <div
    style="
      background-color: #fff3cd;
      padding: 10px;
      border-left: 4px solid #ffc107;
      margin-top: 20px;
      border-radius: 5px;
    "
  >
    <strong>📌 Catatan:</strong>
    <p style="margin: 5px 0 0 0; font-size: 13px">
      Pastikan untuk mengecek file lampiran bila tersedia. Data ini berasal dari
      form pemesanan website.
    </p>
  </div>
</div>

  `,
    attachments: [attachment]
  };

  await transporter.sendMail(mailFormat);
  res.status(200).json({ message: 'Pesanan berhasil dikirim!' });
});

module.exports = createOrder;
