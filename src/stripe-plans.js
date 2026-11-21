/** Planos em dólar vendidos pela Stripe (compradores fora do Brasil). */
const STRIPE_PLANS = {
    '15DAYS': {
        priceId: 'price_1UeHebEMmK3pIrxILSLdPlpr',
        productId: 'prod_VfcuP0ZUjdFym9',
        amountUsd: 1.98,
        duration: 15,
        title: 'GladiusBot - 15 days',
    },
    '30DAYS': {
        priceId: 'price_1UeHirEMmK3pIrxIHVgjk94X',
        productId: 'prod_VfcydZUwn97Gyo',
        amountUsd: 3.76,
        duration: 30,
        title: 'GladiusBot - 30 days',
    },
    '60DAYS': {
        priceId: 'price_1UeJCAEMmK3pIrxI7knme4yx',
        productId: 'prod_Vfd1isbtwU6Gg2',
        amountUsd: 6.96,
        duration: 60,
        title: 'GladiusBot - 60 days',
    },
};

/** STRIPE_PRICE_15DAYS etc. no .env substituem o preço (ex.: preços do sandbox para teste local). */
function withPriceOverride(code, plan) {
    const override = process.env[`STRIPE_PRICE_${code}`];
    return override ? { ...plan, priceId: override } : plan;
}

function getStripePlan(planCode) {
    const code = String(planCode || '').toUpperCase();
    return STRIPE_PLANS[code] ? withPriceOverride(code, STRIPE_PLANS[code]) : null;
}

function findStripePlanByPrice(priceId) {
    for (const code of Object.keys(STRIPE_PLANS)) {
        const plan = getStripePlan(code);
        if (plan.priceId === priceId) return { code, plan };
    }
    return null;
}

module.exports = {
    STRIPE_PLANS,
    getStripePlan,
    findStripePlanByPrice,
};
