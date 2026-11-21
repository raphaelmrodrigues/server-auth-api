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
        priceId: 'price_1UeHllEMmK3pIrxI2BOnpfH6',
        productId: 'prod_Vfd1isbtwU6Gg2',
        amountUsd: 6.76,
        duration: 60,
        title: 'GladiusBot - 60 days',
    },
};

function getStripePlan(planCode) {
    return STRIPE_PLANS[String(planCode || '').toUpperCase()] || null;
}

function findStripePlanByPrice(priceId) {
    for (const [code, plan] of Object.entries(STRIPE_PLANS)) {
        if (plan.priceId === priceId) return { code, plan };
    }
    return null;
}

module.exports = {
    STRIPE_PLANS,
    getStripePlan,
    findStripePlanByPrice,
};
