const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOtpEmail(
  to,
  code,
  {
    brand = 'SOILAB',
    action = 'Verifikasi Pendaftaran',
    minutes = 3,
    primaryColor = '#0E2A47',
    brandUrl = 'https://soilab.id',
    supportEmail = 'support@soilab.id',
    logoUrl = ''
  } = {}
) {
  const from = 'onboarding@resend.dev';

  const spaced = String(code).split('').join(' ');
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">
      <div style="background:${primaryColor};color:#fff;padding:12px 16px;border-radius:10px 10px 0 0;font-weight:700">
        ${brand} • ${action}
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:16px;background:#fff">
        <p>Gunakan kode berikut untuk <b>${action.toLowerCase()}</b> di ${brand}. Berlaku <b>${minutes} menit</b>.</p>
        <div style="font:800 28px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:6px;text-align:center;margin:12px 0">${spaced}</div>
        <p style="color:#64748b;font-size:12px">Jangan bagikan kode ini kepada siapa pun.</p>
        <a href="${brandUrl}" style="display:inline-block;background:${primaryColor};color:#fff;padding:10px 14px;border-radius:8px;font-weight:600">Buka ${brand}</a>
      </div>
      <p style="color:#94a3b8;font-size:12px">Bantuan: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
    </div>
  `.trim();

  const { data, error } = await resend.emails.send({
    from: `${brand} <${from}>`,
    to,
    subject: `[${brand}] Kode Verifikasi • ${action}`,
    html,
    text: `Kode OTP: ${code} (berlaku ${minutes} menit)`
  });

  if (error) {
    console.error('Resend error details:', {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode
    });
    throw new Error(`ResendError: ${error.name} - ${error.message}`);
  }
  return data;
}

module.exports = { sendOtpEmail };
