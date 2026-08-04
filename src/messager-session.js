const jwt = require('jsonwebtoken');

const MESSAGER_SESSION_TTL = process.env.MESSAGER_SESSION_TTL || '12h';
const MESSAGER_TICKET_TTL = process.env.MESSAGER_TICKET_TTL || '15m';
const MESSAGER_BATCH_TTL = process.env.MESSAGER_BATCH_TTL || '45m';

/** Sessão após login (usuário/senha do Messager). */
function issueMessagerSession(jwtSecret, user) {
    return jwt.sign(
        { u: String(user), typ: 'mg', v: 1 },
        jwtSecret,
        { expiresIn: MESSAGER_SESSION_TTL }
    );
}

function verifyMessagerSession(jwtSecret, token, expectedUser) {
    if (!token || typeof token !== 'string') {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    let decoded;
    try {
        decoded = jwt.verify(token, jwtSecret);
    } catch (e) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    if (decoded.typ !== 'mg' || !decoded.u) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    if (expectedUser && String(decoded.u) !== String(expectedUser)) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    return decoded;
}

const SEND_FIELD_MAP = {
    a: 'messageRecipient',
    b: 'messageSubject',
    c: 'messageContent',
    d: 'sent',
    e: 'csrf_token',
};

const SEND_PATH = 'index.php?mod=messages&submod=messageNew';

/** Ticket de lote (filtros) — sem débito; lista de destinatários autorizados. */
function issueMessagerBatchTicket(jwtSecret, user, recipients) {
    const list = (Array.isArray(recipients) ? recipients : [])
        .map((n) => String(n || '').trim())
        .filter(Boolean)
        .slice(0, 500);
    return jwt.sign(
        {
            u: String(user),
            typ: 'mb',
            r: list,
            v: 1,
        },
        jwtSecret,
        { expiresIn: MESSAGER_BATCH_TTL }
    );
}

function verifyMessagerBatchTicket(jwtSecret, token, expectedUser) {
    if (!token || typeof token !== 'string') {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    let decoded;
    try {
        decoded = jwt.verify(token, jwtSecret);
    } catch (e) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    if (decoded.typ !== 'mb' || !decoded.u || !Array.isArray(decoded.r)) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    if (expectedUser && String(decoded.u) !== String(expectedUser)) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    return decoded;
}

/** Ticket de 1 envio — path + field map (após débito de 1 crédito). */
function issueMessagerSendTicket(jwtSecret, user, count = 1) {
    const n = Math.max(1, Math.min(parseInt(count, 10) || 1, 500));
    return jwt.sign(
        {
            u: String(user),
            typ: 'ms',
            n,
            t: SEND_PATH,
            f: { ...SEND_FIELD_MAP },
            v: 1,
        },
        jwtSecret,
        { expiresIn: MESSAGER_TICKET_TTL }
    );
}

function verifyMessagerSendTicket(jwtSecret, token, expectedUser) {
    const decoded = jwt.verify(token, jwtSecret);
    if (decoded.typ !== 'ms' || !decoded.u || !decoded.t || !decoded.f) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    if (expectedUser && String(decoded.u) !== String(expectedUser)) {
        const err = new Error('Unauthorized');
        err.status = 403;
        throw err;
    }
    return decoded;
}

function maskMessageCount(count) {
    const n = Number(count) || 0;
    return n > 50000 ? -43 : n;
}

module.exports = {
    issueMessagerSession,
    verifyMessagerSession,
    issueMessagerBatchTicket,
    verifyMessagerBatchTicket,
    issueMessagerSendTicket,
    verifyMessagerSendTicket,
    maskMessageCount,
    SEND_PATH,
    SEND_FIELD_MAP,
};
