const nodemailer = require('nodemailer');

// Gmail SMTP transporter — uses App Password (no external services needed)
// Railway compatible: set SMTP_USER and SMTP_PASS env vars
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER, // your Gmail address
    pass: process.env.SMTP_PASS, // Gmail App Password (16-char)
  },
});

const FROM = `NestMatch <${process.env.SMTP_USER || 'noreply@nestmatch.app'}>`;

// Send verification code email
async function sendVerificationCode(to, code) {
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#f8f9ff;border-radius:16px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:40px">🏡</span>
        <h1 style="font-size:24px;color:#1a1a2e;margin:8px 0 0">NestMatch</h1>
      </div>
      <div style="background:#fff;border-radius:12px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
        <h2 style="font-size:20px;color:#1a1a2e;margin:0 0 8px;text-align:center">Código de verificación</h2>
        <p style="color:#718096;font-size:14px;line-height:1.6;text-align:center;margin:0 0 24px">
          Usa este código para verificar tu cuenta de NestMatch:
        </p>
        <div style="background:linear-gradient(135deg,#FF6B6B,#FF8E53);color:#fff;font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px;border-radius:12px;margin:0 auto 24px;max-width:220px">
          ${code}
        </div>
        <p style="color:#a0aec0;font-size:12px;text-align:center;margin:0">
          Este código expira en 10 minutos. Si no has solicitado este código, ignora este email.
        </p>
      </div>
      <p style="color:#a0aec0;font-size:11px;text-align:center;margin-top:20px">
        © ${new Date().getFullYear()} NestMatch · Tu compañero de piso ideal
      </p>
    </div>
  `;

  return transporter.sendMail({
    from: FROM,
    to,
    subject: `${code} — Tu código de verificación de NestMatch`,
    html,
  });
}

// Send welcome email after registration
async function sendWelcomeEmail(to, name) {
  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#f8f9ff;border-radius:16px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:48px">🏡</span>
        <h1 style="font-size:28px;color:#1a1a2e;margin:8px 0 0">¡Bienvenido/a a NestMatch!</h1>
      </div>
      <div style="background:#fff;border-radius:12px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
        <p style="color:#2d3748;font-size:16px;line-height:1.7;margin:0 0 16px">
          Hola <strong>${name}</strong>,
        </p>
        <p style="color:#718096;font-size:14px;line-height:1.7;margin:0 0 20px">
          ¡Tu cuenta se ha creado con éxito! Ahora puedes empezar a encontrar a tu compañero de piso ideal.
        </p>
        <div style="background:#f8f9ff;border-radius:10px;padding:20px;margin:0 0 20px">
          <h3 style="font-size:15px;color:#1a1a2e;margin:0 0 12px">Próximos pasos:</h3>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:20px">📝</span>
            <span style="color:#718096;font-size:14px">Completa tu perfil con fotos y una bio atractiva</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:20px">✅</span>
            <span style="color:#718096;font-size:14px">Verifica tu identidad para mayor confianza</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">👆</span>
            <span style="color:#718096;font-size:14px">Empieza a deslizar y encuentra a tu compañero ideal</span>
          </div>
        </div>
        <div style="text-align:center">
          <a href="${process.env.FRONTEND_URL || 'https://nestmatch.up.railway.app'}" style="display:inline-block;background:linear-gradient(135deg,#FF6B6B,#FF8E53);color:#fff;padding:14px 32px;border-radius:99px;text-decoration:none;font-weight:700;font-size:15px">
            Explorar NestMatch
          </a>
        </div>
      </div>
      <p style="color:#a0aec0;font-size:11px;text-align:center;margin-top:20px">
        © ${new Date().getFullYear()} NestMatch · Tu compañero de piso ideal
      </p>
    </div>
  `;

  return transporter.sendMail({
    from: FROM,
    to,
    subject: `🏡 ¡Bienvenido/a a NestMatch, ${name}!`,
    html,
  });
}

module.exports = { sendVerificationCode, sendWelcomeEmail, transporter };
