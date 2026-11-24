/**
 * PayPal Orders v2 (REST). No modo teste (--stripe-test) usa o sandbox e as variáveis PAYPAL_TEST_*;
 * em produção só fica ativo com PAYPAL_ENABLED=true.
 */
const { STRIPE_TEST_MODE } = require('./stripe-plans');

function getPaypalConfig() {
    if (STRIPE_TEST_MODE) {
        const clientId = process.env.PAYPAL_TEST_CLIENT_ID || '';
        const secret = process.env.PAYPAL_TEST_CLIENT_SECRET || '';
        return {
            enabled: !!(clientId && secret),
            clientId,
            secret,
            webhookId: process.env.PAYPAL_TEST_WEBHOOK_ID || '',
            apiBase: 'https://api-m.sandbox.paypal.com',
        };
    }
    const clientId = process.env.PAYPAL_CLIENT_ID || '';
    const secret = process.env.PAYPAL_CLIENT_SECRET || '';
    return {
        enabled: process.env.PAYPAL_ENABLED === 'true' && !!(clientId && secret),
        clientId,
        secret,
        webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
        apiBase: 'https://api-m.paypal.com',
    };
}

let cachedToken = null;

async function getAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
    const cfg = getPaypalConfig();
    const response = await fetch(`${cfg.apiBase}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
        throw new Error(`PayPal auth falhou (${response.status}): ${data.error_description || data.error || 'sem detalhe'}`);
    }
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 0) * 1000 };
    return cachedToken.value;
}

async function paypalRequest(method, path, body, extraHeaders = {}) {
    const cfg = getPaypalConfig();
    const token = await getAccessToken();
    const response = await fetch(`${cfg.apiBase}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...extraHeaders,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const err = new Error(`PayPal ${method} ${path} falhou (${response.status}): ${data.message || data.name || text}`);
        err.status = response.status;
        err.details = data;
        throw err;
    }
    return data;
}

/** custom_id leva plano e e-mail para o pedido se recuperar sozinho no webhook. */
function buildCustomId(planCode, email) {
    return `${planCode}|${email}`.slice(0, 127);
}

function parseCustomId(customId) {
    const [planCode, email] = String(customId || '').split('|');
    return { planCode: planCode || '', email: email || '' };
}

function createOrder({ planCode, plan, email }) {
    return paypalRequest('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{
            reference_id: planCode,
            description: plan.title,
            custom_id: buildCustomId(planCode, email),
            amount: { currency_code: 'USD', value: plan.amountUsd.toFixed(2) },
        }],
        // payment_source.experience_context é do fluxo por redirecionamento (pedido nasce
        // PAYER_ACTION_REQUIRED) e quebra a janela do botão do JS SDK.
        application_context: {
            brand_name: 'GladiusBot',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
        },
    });
}

function captureOrder(orderId) {
    return paypalRequest('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, {
        'PayPal-Request-Id': `capture-${orderId}`,
    });
}

function getOrder(orderId) {
    return paypalRequest('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

function getCapture(captureId) {
    return paypalRequest('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`);
}

async function verifyWebhookSignature(headers, event) {
    const cfg = getPaypalConfig();
    if (!cfg.webhookId) throw new Error('PAYPAL_WEBHOOK_ID não configurado.');
    const result = await paypalRequest('POST', '/v1/notifications/verify-webhook-signature', {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: cfg.webhookId,
        webhook_event: event,
    });
    return result.verification_status === 'SUCCESS';
}

module.exports = {
    getPaypalConfig,
    parseCustomId,
    createOrder,
    captureOrder,
    getOrder,
    getCapture,
    verifyWebhookSignature,
};
