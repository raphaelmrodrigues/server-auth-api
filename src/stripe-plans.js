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

/** `npm run start:test` (flag --stripe-test) usa as chaves e preços STRIPE_TEST_* do .env. */
const STRIPE_TEST_MODE = process.argv.includes('--stripe-test');

function withPriceOverride(code, plan) {
    if (!STRIPE_TEST_MODE) return plan;
    const testPrice = process.env[`STRIPE_TEST_PRICE_${code}`];
    return testPrice ? { ...plan, priceId: testPrice } : plan;
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
    STRIPE_TEST_MODE,
    STRIPE_PLANS,
    getStripePlan,
    findStripePlanByPrice,
};
