const path = require('path');
const fs = require('fs');

const PURCHASE_FROM = {
    email: 'support@gldbotserver.com',
    name: 'GladiusBot',
};
const PURCHASE_REPLY_TO = 'gldbotsuport@gmail.com';
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/gladiusbot/fincifcpkcbcongikgggepbgonnbfopa';

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPurchaseDate(dateInput) {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return String(dateInput || '—');
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

function getPurchaseEmailAttachments() {
    const imagePath = path.join(__dirname, 'images/gladiusbot-icon-128.png');
    const imageData = fs.readFileSync(imagePath).toString('base64');
    return [
        {
            filename: 'gladiusbot-icon-128.png',
            content: imageData,
            type: 'image/png',
            disposition: 'inline',
            content_id: 'gladiusboticon',
        },
    ];
}

function buildPurchaseEmailHtml({ customerName, planLabel, licenseKey, expirationDate }) {
    const year = new Date().getFullYear();
    const safeName = escapeHtml(customerName || 'jogador');
    const safePlan = escapeHtml(planLabel || 'GladiusBot');
    const safeKey = escapeHtml(licenseKey || '');
    const safeExpire = escapeHtml(formatPurchaseDate(expirationDate));

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GladiusBot — Licença</title>
</head>
<body style="margin:0;padding:0;background-color:#1a1208;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1208;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:linear-gradient(180deg,#f4e4bc 0%,#e8d4a8 100%);border:3px solid #8b6914;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.35);">
          <tr>
            <td style="background:linear-gradient(180deg,#5c3d1e 0%,#3d2814 100%);padding:28px 24px;text-align:center;border-bottom:3px solid #c9a227;">
              <img src="cid:gladiusboticon" alt="GladiusBot" width="96" height="96" style="display:block;margin:0 auto 12px;border-radius:12px;border:2px solid #c9a227;">
              <h1 style="margin:0;color:#f4e4bc;font-size:22px;letter-spacing:1px;font-weight:normal;">Compra confirmada</h1>
              <p style="margin:8px 0 0;color:#c9a227;font-size:12px;letter-spacing:2px;text-transform:uppercase;">GladiusBot · Licença ativável</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 26px;color:#3d2814;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">Olá, <strong>${safeName}</strong>!</p>
              <p style="margin:0 0 20px;">Obrigado pela compra. Sua licença foi gerada com sucesso. Guarde os dados abaixo em local seguro.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff9ed;border:2px solid #c9a227;border-radius:10px;margin:0 0 22px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 12px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8b6914;font-weight:bold;">Detalhes da licença</p>
                    <p style="margin:0 0 10px;"><strong style="color:#5c3d1e;">Plano:</strong> ${safePlan}</p>
                    <p style="margin:0 0 10px;"><strong style="color:#5c3d1e;">Validade até:</strong> ${safeExpire}</p>
                    <p style="margin:0 0 14px;font-size:14px;color:#6b5344;"><em>Válida para uma única conta de jogo.</em></p>
                    <div style="background:#3d2814;border:1px solid #8b6914;border-radius:8px;padding:14px 16px;text-align:center;">
                      <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#c9a227;">Chave da licença</p>
                      <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:15px;color:#f4e4bc;word-break:break-all;">${safeKey}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 10px;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#8b6914;font-weight:bold;">Como ativar</p>
              <ol style="margin:0 0 22px;padding-left:22px;color:#3d2814;">
                <li style="margin-bottom:8px;">Instale a extensão pela <a href="${CHROME_STORE_URL}" style="color:#5c3d1e;font-weight:bold;">Chrome Web Store</a>.</li>
                <li style="margin-bottom:8px;">Abra o Gladiatus no mesmo perfil do Chrome.</li>
                <li style="margin-bottom:8px;">No painel GladiusBot, vá em <strong>GladiusBot</strong> → <strong>GladiusBot License</strong>.</li>
                <li>Cole a chave acima e confirme.</li>
              </ol>

              <p style="margin:0;font-size:14px;color:#6b5344;">Dúvidas ou problemas na ativação? Responda este e-mail ou acesse <a href="https://gldbotserver.com" style="color:#5c3d1e;">gldbotserver.com</a>.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#3d2814;padding:20px 24px;text-align:center;border-top:2px solid #8b6914;">
              <p style="margin:0 0 8px;color:#c9a227;font-size:13px;">
                <a href="https://gldbotserver.com" style="color:#f4e4bc;text-decoration:none;">gldbotserver.com</a>
                &nbsp;·&nbsp;
                <a href="https://gldbotserver.com/privacy" style="color:#f4e4bc;text-decoration:none;">Privacidade</a>
              </p>
              <p style="margin:0;color:#8b7355;font-size:11px;">&copy; ${year} GladiusBot. Produto independente para Gladiatus.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildCryptoConfirmationEmailHtml({ customerName, planLabel, planDays, licenseKey, methodLabel }) {
    const year = new Date().getFullYear();
    const safeName = escapeHtml(customerName || 'player');
    const safePlan = escapeHtml(planLabel || 'GladiusBot');
    const safeDays = escapeHtml(String(planDays || ''));
    const safeKey = escapeHtml(licenseKey || '');
    const safeMethod = escapeHtml(methodLabel || 'Binance Gift Card');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GladiusBot — License</title>
</head>
<body style="margin:0;padding:0;background-color:#1a1208;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1208;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:linear-gradient(180deg,#f4e4bc 0%,#e8d4a8 100%);border:3px solid #8b6914;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.35);">
          <tr>
            <td style="background:linear-gradient(180deg,#5c3d1e 0%,#3d2814 100%);padding:28px 24px;text-align:center;border-bottom:3px solid #c9a227;">
              <img src="cid:gladiusboticon" alt="GladiusBot" width="96" height="96" style="display:block;margin:0 auto 12px;border-radius:12px;border:2px solid #c9a227;">
              <h1 style="margin:0;color:#f4e4bc;font-size:22px;letter-spacing:1px;font-weight:normal;">Crypto purchase confirmed</h1>
              <p style="margin:8px 0 0;color:#c9a227;font-size:12px;letter-spacing:2px;text-transform:uppercase;">GladiusBot · Paid with ${safeMethod}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 26px;color:#3d2814;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">Hi, <strong>${safeName}</strong>!</p>
              <p style="margin:0 0 20px;">Thank you for your purchase. Your payment was verified and your license is ready. Keep the details below in a safe place.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff9ed;border:2px solid #c9a227;border-radius:10px;margin:0 0 22px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 12px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8b6914;font-weight:bold;">License details</p>
                    <p style="margin:0 0 10px;"><strong style="color:#5c3d1e;">Plan:</strong> ${safePlan}</p>
                    <p style="margin:0 0 10px;"><strong style="color:#5c3d1e;">Duration:</strong> ${safeDays} days</p>
                    <p style="margin:0 0 14px;font-size:14px;color:#6b5344;"><em>The ${safeDays} days start counting from the moment you activate the license inside the Bot — not from today.</em></p>
                    <div style="background:#3d2814;border:1px solid #8b6914;border-radius:8px;padding:14px 16px;text-align:center;">
                      <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#c9a227;">License key</p>
                      <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:15px;color:#f4e4bc;word-break:break-all;">${safeKey}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 10px;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#8b6914;font-weight:bold;">How to activate</p>
              <ol style="margin:0 0 22px;padding-left:22px;color:#3d2814;">
                <li style="margin-bottom:8px;">Install the extension from the <a href="${CHROME_STORE_URL}" style="color:#5c3d1e;font-weight:bold;">Chrome Web Store</a>.</li>
                <li style="margin-bottom:8px;">Open Gladiatus in the same Chrome profile.</li>
                <li style="margin-bottom:8px;">In the GladiusBot panel, go to <strong>GladiusBot</strong> → <strong>GladiusBot License</strong>.</li>
                <li>Paste the key above and confirm. Your ${safeDays} days start now.</li>
              </ol>

              <p style="margin:0;font-size:14px;color:#6b5344;">Questions or activation issues? Reply to this email or visit <a href="https://gldbotserver.com" style="color:#5c3d1e;">gldbotserver.com</a>.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#3d2814;padding:20px 24px;text-align:center;border-top:2px solid #8b6914;">
              <p style="margin:0 0 8px;color:#c9a227;font-size:13px;">
                <a href="https://gldbotserver.com" style="color:#f4e4bc;text-decoration:none;">gldbotserver.com</a>
                &nbsp;·&nbsp;
                <a href="https://gldbotserver.com/privacy" style="color:#f4e4bc;text-decoration:none;">Privacy</a>
              </p>
              <p style="margin:0;color:#8b7355;font-size:11px;">&copy; ${year} GladiusBot. Independent product for Gladiatus.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildCryptoRejectionEmailHtml({ customerName, planLabel, reason, methodLabel, statusUrl }) {
    const year = new Date().getFullYear();
    const safeName = escapeHtml(customerName || 'player');
    const safePlan = escapeHtml(planLabel || 'GladiusBot');
    const safeMethod = escapeHtml(methodLabel || 'crypto');
    const safeReason = escapeHtml(reason || '');
    const safeUrl = escapeHtml(statusUrl || 'https://gldbotserver.com');
    const reasonBlock = safeReason
        ? `<div style="background:#fff9ed;border:2px solid #c9a227;border-radius:10px;margin:0 0 22px;padding:16px 20px;">
                    <p style="margin:0 0 8px;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#8b6914;font-weight:bold;">Reason</p>
                    <p style="margin:0;color:#3d2814;">${safeReason}</p>
                  </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GladiusBot — Order not confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#1a1208;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1208;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:linear-gradient(180deg,#f4e4bc 0%,#e8d4a8 100%);border:3px solid #8b6914;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.35);">
          <tr>
            <td style="background:linear-gradient(180deg,#5c3d1e 0%,#3d2814 100%);padding:28px 24px;text-align:center;border-bottom:3px solid #c9a227;">
              <img src="cid:gladiusboticon" alt="GladiusBot" width="96" height="96" style="display:block;margin:0 auto 12px;border-radius:12px;border:2px solid #c9a227;">
              <h1 style="margin:0;color:#f4e4bc;font-size:22px;letter-spacing:1px;font-weight:normal;">Order not confirmed</h1>
              <p style="margin:8px 0 0;color:#c9a227;font-size:12px;letter-spacing:2px;text-transform:uppercase;">GladiusBot · Paid with ${safeMethod}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 26px;color:#3d2814;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">Hi, <strong>${safeName}</strong>,</p>
              <p style="margin:0 0 20px;">Unfortunately we could not confirm your payment for <strong>${safePlan}</strong>, so the order was not approved and no license was issued.</p>
              ${reasonBlock}
              <p style="margin:0 0 20px;">If you believe this is a mistake, just reply to this email with your payment details (transaction hash or gift card code and a screenshot) and we'll review it again.</p>
              <p style="margin:0;font-size:14px;color:#6b5344;">You can also check your order status here: <a href="${safeUrl}" style="color:#5c3d1e;">${safeUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#3d2814;padding:20px 24px;text-align:center;border-top:2px solid #8b6914;">
              <p style="margin:0 0 8px;color:#c9a227;font-size:13px;">
                <a href="https://gldbotserver.com" style="color:#f4e4bc;text-decoration:none;">gldbotserver.com</a>
                &nbsp;·&nbsp;
                <a href="https://gldbotserver.com/privacy" style="color:#f4e4bc;text-decoration:none;">Privacy</a>
              </p>
              <p style="margin:0;color:#8b7355;font-size:11px;">&copy; ${year} GladiusBot. Independent product for Gladiatus.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPasswordResetEmailHtml({ userName, resetLink, expiresInMinutes = 60 }) {
    const year = new Date().getFullYear();
    const safeName = escapeHtml(userName || 'player');
    const safeLink = escapeHtml(resetLink || '');
    const mins = Math.max(5, Number(expiresInMinutes) || 60);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GladiusBot — Password Reset</title>
</head>
<body style="margin:0;padding:0;background-color:#1a1208;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1208;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#f4e4bc;border:3px solid #8b6914;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#3d2814;padding:28px 24px;text-align:center;border-bottom:3px solid #c9a227;">
              <img src="cid:gladiusboticon" alt="GladiusBot" width="88" height="88" style="display:block;margin:0 auto 12px;border-radius:12px;border:2px solid #c9a227;">
              <h1 style="margin:0;color:#f4e4bc;font-size:22px;letter-spacing:1px;font-weight:normal;">Password reset</h1>
              <p style="margin:8px 0 0;color:#c9a227;font-size:12px;letter-spacing:2px;text-transform:uppercase;">GladiusBot · Messager</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 26px;color:#3d2814;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">Hello, <strong>${safeName}</strong>!</p>
              <p style="margin:0 0 20px;">We received a request to reset the password for your GladiusBot Messager account. Click the button below to choose a new password.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;">
                <tr>
                  <td align="center">
                    <a href="${safeLink}" style="display:inline-block;background:#ba9700;color:#1a120a;padding:14px 28px;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;border:1px solid #8b6914;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;font-size:13px;color:#6b5344;">Or copy and paste this link into your browser:</p>
              <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#5c3d1e;background:#fff9ed;border:1px solid #c9a227;border-radius:6px;padding:12px;">${safeLink}</p>

              <p style="margin:0 0 8px;font-size:14px;color:#6b5344;"><strong>This link expires in ${mins} minutes.</strong></p>
              <p style="margin:0;font-size:14px;color:#6b5344;">If you did not request a password reset, you can ignore this email — your password will stay the same.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#3d2814;padding:20px 24px;text-align:center;border-top:2px solid #8b6914;">
              <p style="margin:0 0 8px;color:#c9a227;font-size:13px;">
                <a href="https://gldbotserver.com" style="color:#f4e4bc;text-decoration:none;">gldbotserver.com</a>
                &nbsp;·&nbsp;
                <a href="mailto:gldbotsuport@gmail.com" style="color:#f4e4bc;text-decoration:none;">Support</a>
              </p>
              <p style="margin:0;color:#8b7355;font-size:11px;">&copy; ${year} GladiusBot. Do not reply with your password.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPasswordResetEmailText({ userName, resetLink, expiresInMinutes = 60 }) {
    const mins = Math.max(5, Number(expiresInMinutes) || 60);
    return [
        `Hello, ${userName || 'player'}!`,
        '',
        'We received a request to reset your GladiusBot Messager password.',
        `Open this link to set a new password (valid for ${mins} minutes):`,
        resetLink,
        '',
        'If you did not request this, ignore this email.',
        '',
        '— GladiusBot · gldbotserver.com',
    ].join('\n');
}

function buildMessagerWelcomeEmailHtml({ userName, trialCredits = 30 }) {
    const year = new Date().getFullYear();
    const safeName = escapeHtml(userName || 'player');
    const credits = Number(trialCredits) || 30;
    const storeUrl = 'https://chromewebstore.google.com/detail/gld-messager/edjmembjpmijpmjogljekmcpmfadkdpm';
    const itchUrl = 'https://gladiusbot.itch.io/gladiusbot-messager';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GladiusBot Messager — Welcome</title>
</head>
<body style="margin:0;padding:0;background-color:#1a1208;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1208;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#f4e4bc;border:3px solid #8b6914;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#3d2814;padding:28px 24px;text-align:center;border-bottom:3px solid #c9a227;">
              <img src="cid:gladiusboticon" alt="GladiusBot" width="88" height="88" style="display:block;margin:0 auto 12px;border-radius:12px;border:2px solid #c9a227;">
              <h1 style="margin:0;color:#f4e4bc;font-size:22px;letter-spacing:1px;font-weight:normal;">Account created</h1>
              <p style="margin:8px 0 0;color:#c9a227;font-size:12px;letter-spacing:2px;text-transform:uppercase;">GladiusBot · Messager</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 26px;color:#3d2814;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">Welcome, <strong>${safeName}</strong>!</p>
              <p style="margin:0 0 18px;">Your Messager account was created successfully. You can log in inside Gladiatus on the New Message page.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff9ed;border:2px solid #c9a227;border-radius:10px;margin:0 0 22px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 10px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8b6914;font-weight:bold;">Free trial credits</p>
                    <p style="margin:0 0 10px;">You get <strong>${credits} free message credits</strong> the first time you log in from a Gladiatus character.</p>
                    <p style="margin:0;font-size:14px;color:#6b5344;"><strong>1 credit = 1 message to 1 player.</strong> The free pack is granted once per game character (player ID).</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 10px;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#8b6914;font-weight:bold;">How to start</p>
              <ol style="margin:0 0 20px;padding-left:22px;">
                <li style="margin-bottom:8px;">Open Gladiatus → Messages → New message.</li>
                <li style="margin-bottom:8px;">Open <strong>GladiusBot - Messager</strong> and log in with username <strong>${safeName}</strong>.</li>
                <li style="margin-bottom:8px;">Your free credits are applied automatically on that first in-game login.</li>
                <li>Need more sends? Buy packs on <a href="${itchUrl}" style="color:#5c3d1e;font-weight:bold;">itch.io</a>.</li>
              </ol>

              <p style="margin:0 0 8px;font-size:14px;color:#6b5344;">Extension: <a href="${storeUrl}" style="color:#5c3d1e;">Chrome Web Store</a></p>
              <p style="margin:0;font-size:14px;color:#6b5344;">Support: <a href="mailto:gldbotsuport@gmail.com" style="color:#5c3d1e;">gldbotsuport@gmail.com</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#3d2814;padding:20px 24px;text-align:center;border-top:2px solid #8b6914;">
              <p style="margin:0 0 8px;color:#c9a227;font-size:13px;">
                <a href="https://gldbotserver.com" style="color:#f4e4bc;text-decoration:none;">gldbotserver.com</a>
              </p>
              <p style="margin:0;color:#8b7355;font-size:11px;">&copy; ${year} GladiusBot. Use the bot responsibly and follow game rules.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildMessagerWelcomeEmailText({ userName, trialCredits = 30 }) {
    const credits = Number(trialCredits) || 30;
    return [
        `Welcome, ${userName || 'player'}!`,
        '',
        'Your GladiusBot Messager account was created successfully.',
        `Free trial: ${credits} message credits on your first in-game login (once per game character).`,
        '1 credit = 1 message to 1 player.',
        '',
        'Log in on Gladiatus → Messages → New message → GladiusBot - Messager.',
        'Buy more: https://gladiusbot.itch.io/gladiusbot-messager',
        '',
        '— GladiusBot · gldbotserver.com',
    ].join('\n');
}

function buildMessagerRegisterAdminEmailHtml({ userName, email }) {
    const safeName = escapeHtml(userName || '');
    const safeEmail = escapeHtml(email || '');
    const when = escapeHtml(new Date().toISOString());

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Messager registration</title></head>
<body style="margin:0;padding:0;background:#1a1208;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#f4e4bc;border:3px solid #8b6914;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="background:#3d2814;padding:20px;text-align:center;border-bottom:3px solid #c9a227;">
            <h2 style="margin:0;color:#f4e4bc;font-weight:normal;">New Messager account</h2>
          </td>
        </tr>
        <tr>
          <td style="padding:22px;color:#3d2814;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 10px;"><strong>Username:</strong> ${safeName}</p>
            <p style="margin:0 0 10px;"><strong>Email:</strong> ${safeEmail}</p>
            <p style="margin:0;"><strong>When (UTC):</strong> ${when}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = {
    PURCHASE_FROM,
    PURCHASE_REPLY_TO,
    buildPurchaseEmailHtml,
    buildCryptoConfirmationEmailHtml,
    buildCryptoRejectionEmailHtml,
    buildPasswordResetEmailHtml,
    buildPasswordResetEmailText,
    buildMessagerWelcomeEmailHtml,
    buildMessagerWelcomeEmailText,
    buildMessagerRegisterAdminEmailHtml,
    getPurchaseEmailAttachments,
    formatPurchaseDate,
};
