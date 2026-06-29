const { PURCHASE_FROM } = require('./purchase-email');

const ALERT_TO = process.env.GLD_ABUSE_ALERT_EMAIL || 'gldbotsuport@gmail.com';

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatReasons(reasons = {}) {
    return Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') || '—';
}

function buildAbuseAlertEmailHtml(data) {
    const serverLabel = data.serverId
        ? `s${escapeHtml(data.serverId)}${data.country ? '-' + escapeHtml(data.country) : ''}`
        : '—';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#1a120a;font-family:Tahoma,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a120a;padding:24px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#f4e4c1;border:3px solid #876e3e;border-radius:8px;overflow:hidden;">
        <tr><td style="background:linear-gradient(180deg,#5c3d1e,#3d2814);padding:20px;text-align:center;">
          <h1 style="margin:0;color:#f4e4bc;font-size:20px;font-weight:normal;font-family:Georgia,serif;">GladiusBot — alerta de uso suspeito</h1>
        </td></tr>
        <tr><td style="padding:24px;color:#3d2a1a;font-size:14px;line-height:1.55;">
          <p style="margin:0 0 16px;">Um <strong>playerId sem licença no banco</strong> acumulou tentativas de validação suspeitas. Revise no painel admin → <strong>Segurança</strong> e bloqueie se necessário.</p>
          <table width="100%" cellpadding="8" cellspacing="0" style="background:#fff9ed;border:1px solid #c9a227;border-radius:6px;font-size:13px;">
            <tr><td style="color:#8b6914;font-weight:bold;width:140px;">Player ID</td><td style="font-family:monospace;">${escapeHtml(data.playerId)}</td></tr>
            <tr><td style="color:#8b6914;font-weight:bold;">Personagem</td><td>${escapeHtml(data.charName || '—')}</td></tr>
            <tr><td style="color:#8b6914;font-weight:bold;">Servidor</td><td style="font-family:monospace;">${serverLabel}</td></tr>
            <tr><td style="color:#8b6914;font-weight:bold;">IP</td><td style="font-family:monospace;">${escapeHtml(data.ip || '—')}</td></tr>
            <tr><td style="color:#8b6914;font-weight:bold;">Versão bot</td><td>${escapeHtml(data.botVersion || '—')}</td></tr>
            <tr><td style="color:#8b6914;font-weight:bold;">Tentativas (1h)</td><td><strong>${escapeHtml(String(data.attemptCount))}</strong></td></tr>
            <tr><td style="color:#8b6914;font-weight:bold;">Motivos</td><td>${escapeHtml(formatReasons(data.reasons))}</td></tr>
            <tr><td style="color:#8b6914;font-weight:bold;">Último endpoint</td><td><code>${escapeHtml(data.lastSource || '—')}</code></td></tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#6b4f32;">Este alerta não bloqueia automaticamente. Ação manual: Admin → Segurança → Bloquear player.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendAbuseAlertEmail(sgMail, data) {
    if (!sgMail) return false;
    const msg = {
        to: ALERT_TO,
        from: PURCHASE_FROM,
        replyTo: ALERT_TO,
        subject: `[GladiusBot] Suspeito — player ${data.playerId} (${data.attemptCount} tentativas)`,
        html: buildAbuseAlertEmailHtml(data),
    };
    await sgMail.send(msg);
    return true;
}

module.exports = {
    ALERT_TO,
    buildAbuseAlertEmailHtml,
    sendAbuseAlertEmail,
};
