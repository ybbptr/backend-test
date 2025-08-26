const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.COMPANY_EMAIL, pass: process.env.COMPANY_PASSWORD }
});

async function sendOtpEmail(
  to,
  code,
  {
    brand = 'SOILAB',
    minutes = 3,
    action = '',
    supportEmail = 'support@soilab.id',
    brandUrl = 'https://soilab.id',
    logoUrl = 'https://backend-test-production-51c5.up.railway.app/assets/soilab-logo.png',
    primaryColor = ''
  } = {}
) {
  const preheader = `Kode OTP untuk ${action} di ${brand}. Berlaku ${minutes} menit.`;
  const spacedCode = String(code).split('').join(' ');

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${brand} • ${action}</title>
<style>
  /* Reset ringan untuk sebagian klien */
  body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; }
  body { margin:0; padding:0; width:100%!important; height:100%!important; background:#f6f7fb; }
  a { text-decoration:none; }
</style>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;">
  <!-- Preheader (disembunyikan) -->
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
    ${preheader}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
          <tr>
            <td style="padding:20px 24px; background:${primaryColor};">
              <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#fff;font-size:14px;font-weight:600;">
                    ${
                      logoUrl
                        ? `<img src="${logoUrl}" alt="${brand}" height="28" style="display:block;border:none;outline:none;text-decoration:none;vertical-align:middle;">`
                        : `${brand}`
                    }
                  </td>
                  <td align="right" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#cbd5e1;font-size:12px;">
                    ${action}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 24px 8px 24px;">
              <h1 style="margin:0 0 8px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-weight:700;font-size:20px;line-height:1.25;color:#0f172a;">
                Kode Verifikasi Anda
              </h1>
              <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:14px;line-height:1.6;color:#334155;">
                Gunakan kode berikut untuk <strong>${action.toLowerCase()}</strong> di ${brand}. Kode berlaku <strong>${minutes} menit</strong>.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px 8px 24px;">
              <div style="
                border:1px solid #e2e8f0;
                background:#f8fafc;
                border-radius:12px;
                padding:18px 20px;
                text-align:center;
              ">
                <div style="
                  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
                  font-weight:800;
                  font-size:28px;
                  letter-spacing:6px;
                  color:#0f172a;
                ">${spacedCode}</div>
                <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;color:#64748b;margin-top:8px;">
                  Jangan bagikan kode ini kepada siapa pun.
                </div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 24px 0 24px;">
              <a href="${brandUrl}" style="
                 display:inline-block;
                 background:${primaryColor};
                 color:#ffffff;
                 font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
                 font-size:14px;font-weight:600;
                 padding:10px 16px;border-radius:10px;">
                Buka ${brand}
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px 8px 24px;">
              <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:13px;line-height:1.6;color:#475569;">
                Tidak merasa meminta kode ini? Kemungkinan seseorang memasukkan email Anda secara tidak sengaja.
                Abaikan email ini—tidak ada tindakan yang dilakukan bila Anda tidak memasukkan kode di aplikasi.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 24px 24px;">
              <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;color:#94a3b8;">
                Butuh bantuan? Hubungi kami di <a href="mailto:${supportEmail}" style="color:#475569;text-decoration:underline;">${supportEmail}</a>.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 24px 20px 24px; background:#f8fafc; border-top:1px solid #e2e8f0;">
              <p style="margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; font-size:11px; color:#94a3b8;">
                © ${new Date().getFullYear()} ${brand}. Semua hak dilindungi.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = [
    `${brand} - ${action}`,
    `Kode OTP: ${code}`,
    `Berlaku ${minutes} menit.`,
    `Jika Anda tidak meminta kode ini, abaikan email ini.`,
    ``,
    `Bantuan: ${supportEmail}`,
    `${brandUrl}`
  ].join('\n');

  await transporter.sendMail({
    from: `"${brand} Auth" <${process.env.EMAIL_USER}>`,
    to,
    subject: `[${brand}] Kode Verifikasi • ${action}`,
    html,
    text
  });
}

module.exports = { transporter, sendOtpEmail };
