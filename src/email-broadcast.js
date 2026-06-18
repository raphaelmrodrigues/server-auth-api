const path = require('path');
const fs = require('fs');

const BROADCAST_FROM = {
    email: 'support@gldbotserver.com',
    name: 'GladiusBot',
};
const BROADCAST_REPLY_TO = 'gldbotsuport@gmail.com';
const DEFAULT_SUBJECT = 'GladiusBot — Informação importante';

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMessageHtml(message) {
    return escapeHtml(message).replace(/\r?\n/g, '<br>');
}

function getBroadcastAttachments() {
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

function buildBroadcastEmailHtml(messageBody) {
    const year = new Date().getFullYear();
    const bodyHtml = formatMessageHtml(messageBody);

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#1a1208;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1208;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:linear-gradient(180deg,#f4e4bc 0%,#e8d4a8 100%);border:3px solid #8b6914;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.35);">
          <tr>
            <td style="background:linear-gradient(180deg,#5c3d1e 0%,#3d2814 100%);padding:28px 24px;text-align:center;border-bottom:3px solid #c9a227;">
              <img src="cid:gladiusboticon" alt="GladiusBot" width="96" height="96" style="display:block;margin:0 auto 12px;border-radius:12px;border:2px solid #c9a227;">
              <h1 style="margin:0;color:#f4e4bc;font-size:22px;letter-spacing:1px;font-weight:normal;">GladiusBot</h1>
              <p style="margin:6px 0 0;color:#c9a227;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Mensagem oficial</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;color:#3d2814;font-size:16px;line-height:1.65;">
              <p style="margin:0 0 16px;">Olá,</p>
              <div style="background:#fff9ed;border:1px solid #c9a227;border-radius:8px;padding:20px 22px;margin:0 0 24px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">
                ${bodyHtml}
              </div>
              <p style="margin:0 0 8px;">Atenciosamente,</p>
              <p style="margin:0;font-weight:bold;color:#5c3d1e;">Equipe GladiusBot</p>
            </td>
          </tr>
          <tr>
            <td style="background:#3d2814;padding:20px 24px;text-align:center;border-top:2px solid #8b6914;">
              <p style="margin:0 0 8px;color:#c9a227;font-size:13px;">
                <a href="https://gldbotserver.com" style="color:#f4e4bc;text-decoration:none;">gldbotserver.com</a>
              </p>
              <p style="margin:0;color:#8b7355;font-size:11px;">&copy; ${year} GladiusBot. Produto independente para Gladiatus.</p>
              <p style="margin:8px 0 0;color:#8b7355;font-size:11px;">Dúvidas? Responda este e-mail ou escreva para gldbotsuport@gmail.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function aggregateCustomerEmails(License, filter = 'all') {
    const currentDate = new Date();
    const licenses = await License.find({
        email: { $exists: true, $nin: [null, ''] },
    })
        .select('email expireDate trial playerid')
        .lean();

    const byEmail = new Map();

    for (const lic of licenses) {
        const email = normalizeEmail(lic.email);
        if (!isValidEmail(email)) continue;

        if (!byEmail.has(email)) {
            byEmail.set(email, {
                email,
                licenseCount: 0,
                activeCount: 0,
                inactiveCount: 0,
                latestExpire: null,
                hasTrial: false,
            });
        }

        const entry = byEmail.get(email);
        entry.licenseCount += 1;
        if (lic.trial) entry.hasTrial = true;

        const exp = lic.expireDate ? new Date(lic.expireDate) : null;
        if (exp && (!entry.latestExpire || exp > entry.latestExpire)) {
            entry.latestExpire = exp;
        }
        if (exp && exp > currentDate) {
            entry.activeCount += 1;
        } else {
            entry.inactiveCount += 1;
        }
    }

    const results = [];
    for (const entry of byEmail.values()) {
        const status = entry.activeCount > 0 ? 'active' : 'inactive';
        if (filter === 'active' && status !== 'active') continue;
        if (filter === 'inactive' && status !== 'inactive') continue;

        results.push({
            email: entry.email,
            status,
            licenseCount: entry.licenseCount,
            activeCount: entry.activeCount,
            inactiveCount: entry.inactiveCount,
            hasTrial: entry.hasTrial,
            latestExpire: entry.latestExpire ? entry.latestExpire.toISOString() : null,
        });
    }

    results.sort((a, b) => a.email.localeCompare(b.email));
    return results;
}

async function getCustomerEmailStats(License) {
    const all = await aggregateCustomerEmails(License, 'all');
    return {
        all: all.length,
        active: all.filter((c) => c.status === 'active').length,
        inactive: all.filter((c) => c.status === 'inactive').length,
    };
}

async function sendBroadcastEmails(sgMail, recipients, subject, html) {
    const attachments = getBroadcastAttachments();
    const unique = [...new Set(recipients.map(normalizeEmail).filter(isValidEmail))];
    const BATCH_SIZE = 500;
    let sent = 0;
    const errors = [];

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        const batch = unique.slice(i, i + BATCH_SIZE);
        const msg = {
            from: BROADCAST_FROM,
            replyTo: BROADCAST_REPLY_TO,
            subject: subject || DEFAULT_SUBJECT,
            html,
            attachments,
            personalizations: batch.map((email) => ({ to: [{ email }] })),
        };

        try {
            await sgMail.send(msg);
            sent += batch.length;
        } catch (error) {
            console.error('Erro ao enviar lote de broadcast:', error);
            errors.push({
                batchStart: i,
                batchSize: batch.length,
                message: error.message,
            });
        }
    }

    return { sent, failed: unique.length - sent, total: unique.length, errors };
}

module.exports = {
    DEFAULT_SUBJECT,
    BROADCAST_REPLY_TO,
    buildBroadcastEmailHtml,
    aggregateCustomerEmails,
    sendBroadcastEmails,
    isValidEmail,
    normalizeEmail,
    getCustomerEmailStats,
};
