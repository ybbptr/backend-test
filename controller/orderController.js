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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #007bff; text-align: center;">📦 Detail Pemesanan Layanan</h2>
      <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px; font-weight: bold;">Nama</td>
          <td style="padding: 8px;">${name}</td>
        </tr>
        <tr style="background-color: #f9f9f9;">
          <td style="padding: 8px; font-weight: bold;">Perusahaan</td>
          <td style="padding: 8px;">${company}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Email</td>
          <td style="padding: 8px;">${email}</td>
        </tr>
        <tr style="background-color: #f9f9f9;">
          <td style="padding: 8px; font-weight: bold;">Kontak</td>
          <td style="padding: 8px;">${contact}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Layanan</td>
          <td style="padding: 8px; text-transform: capitalize;">${service}</td>
        </tr>
      </table>
      <div style="margin-top: 20px;">
        <h4 style="color: #007bff;">📝 Pesan:</h4>
        <p style="background-color: #f1f1f1; padding: 10px; border-radius: 5px;">${message}</p>
      </div>
    </div>
  `,
    attachments: [attachment]
  };

  await transporter.sendMail(mailFormat);
  res.status(200).json({ message: 'Pesanan berhasil dikirim!' });
});

module.exports = createOrder;
