const jwt = require('jsonwebtoken');

const MESSAGER_SESSION_TTL = process.env.MESSAGER_SESSION_TTL || '12h';
const MESSAGER_TICKET_TTL = process.env.MESSAGER_TICKET_TTL || '15m';

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

/** Ticket de envio — sem ele o client não monta o POST do jogo. */
function issueMessagerSendTicket(jwtSecret, user, count) {
    const n = Math.max(1, Math.min(parseInt(count, 10) || 1, 500));
    return jwt.sign(
        {
            u: String(user),
            typ: 'ms',
            n,
            t: 'index.php?mod=messages&submod=messageNew',
            f: {
                a: 'messageRecipient',
                b: 'messageSubject',
                c: 'messageContent',
                d: 'sent',
                e: 'csrf_token',
            },
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
    issueMessagerSendTicket,
    verifyMessagerSendTicket,
    maskMessageCount,
};
