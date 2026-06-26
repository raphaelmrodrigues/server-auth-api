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

module.exports = {
    PURCHASE_FROM,
    PURCHASE_REPLY_TO,
    buildPurchaseEmailHtml,
    getPurchaseEmailAttachments,
    formatPurchaseDate,
};
