const MP_PLANS = {
    '15DAYS': {
        price: 5.78,
        title: 'GLDbot - 15 dias',
        description: 'Licença GladiusBot por 15 dias — automação para Gladiatus (extensão Chrome). Acesso completo após ativação da chave.',
        duration: 15,
        emailLabel: 'GladiusBot — 15 dias',
    },
    '30DAYS': {
        price: 9.89,
        title: 'GLDbot - 30 dias',
        description: 'Licença GladiusBot por 30 dias — automação para Gladiatus (extensão Chrome). Acesso completo após ativação da chave.',
        duration: 30,
        emailLabel: 'GladiusBot — 30 dias',
    },
    '60DAYS': {
        price: 18.98,
        title: 'GLDbot - 60 dias',
        description: 'Licença GladiusBot por 60 dias — automação para Gladiatus (extensão Chrome). Acesso completo após ativação da chave.',
        duration: 60,
        emailLabel: 'GladiusBot — 60 dias',
    },
};

const EXTERNAL_REF_PREFIX = 'GLDBOT';

/** Até 13 caracteres — texto na fatura do cartão do comprador (Mercado Pago). */
const MP_STATEMENT_DESCRIPTOR = 'GLADIUSBOT';

function getMercadoPagoPlan(planCode) {
    return MP_PLANS[planCode] || null;
}

function buildMercadoPagoExternalReference(planCode, uniqueId) {
    return `${EXTERNAL_REF_PREFIX}-${planCode}-${uniqueId}`;
}

function parsePlanCodeFromExternalReference(externalReference) {
    if (!externalReference) return null;
    const match = String(externalReference).match(/^GLDBOT-(15DAYS|30DAYS|60DAYS)-/i);
    return match ? match[1].toUpperCase() : null;
}

function resolvePlanLabel({ planCode, itemDescription, durationDays }) {
    const plan = planCode ? MP_PLANS[planCode] : null;
    if (plan) return plan.emailLabel;
    if (itemDescription && String(itemDescription).trim()) {
        return String(itemDescription).replace(/GLDbot/gi, 'GladiusBot');
    }
    if (durationDays) return `GladiusBot — ${durationDays} dias`;
    return 'GladiusBot';
}

function resolvePlanTitleForDb({ planCode, paymentDescription }) {
    const plan = planCode ? MP_PLANS[planCode] : null;
    if (plan) return plan.title;
    if (paymentDescription && String(paymentDescription).trim()) {
        return paymentDescription;
    }
    return 'GladiusBot';
}

module.exports = {
    MP_PLANS,
    EXTERNAL_REF_PREFIX,
    MP_STATEMENT_DESCRIPTOR,
    getMercadoPagoPlan,
    buildMercadoPagoExternalReference,
    parsePlanCodeFromExternalReference,
    resolvePlanLabel,
    resolvePlanTitleForDb,
};
