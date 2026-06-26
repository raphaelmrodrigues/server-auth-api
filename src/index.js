require('dotenv').config();

const jwt = require('jsonwebtoken');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);  // Usando a variável do .env
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const sgMail = require('@sendgrid/mail');
const {
    issueLicenseSession,
    verifyLicenseSession,
    assertLicenseActive,
} = require('./license-session');
const {
    recordSessionOk,
    recordSessionFail,
    getDashboard,
} = require('./bot-monitor');
const {
    DEFAULT_SUBJECT,
    buildBroadcastEmailHtml,
    aggregateCustomerEmails,
    sendBroadcastEmails,
    isValidEmail,
    normalizeEmail,
    getCustomerEmailStats,
} = require('./email-broadcast');
const {
    MP_PLANS,
    MP_STATEMENT_DESCRIPTOR,
    getMercadoPagoPlan,
    buildMercadoPagoExternalReference,
    parsePlanCodeFromExternalReference,
    resolvePlanLabel,
    resolvePlanTitleForDb,
} = require('./mercadopago-plans');
const {
    PURCHASE_FROM,
    PURCHASE_REPLY_TO,
    buildPurchaseEmailHtml,
    getPurchaseEmailAttachments,
} = require('./purchase-email');
const {
    ITCH_PLANS,
    isItchLicenseKey,
    isItchLicenseRecord,
    applyItchActivationDates,
    buildItchLicenseDocument,
    licensesToItchCsv,
} = require('./itch-licenses');
const {
    enrichLicenseFromDownloadKey,
    fetchProfileGames,
} = require('./itch-api');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.static('src'));
const port = 4000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single('attachment');

const mercadoPagoClient = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACESS_TOKEN,
});
const preferenceAPI = new Preference(mercadoPagoClient);
const paymentAPI = new Payment(mercadoPagoClient);

const JWT_SECRET = process.env.JWT_SECRET;
const GLOBAL_EXPIRATION_DATE = process.env.GLOBAL_EXPIRATION_DATE;
const GLOBAL_REFRESH_TOKEN = process.env.GLOBAL_REFRESH_TOKEN;
const GLOBAL_TOKEN = process.env.GLOBAL_TOKEN;
const YOUR_DOMAIN = process.env.YOUR_DOMAIN;
const endpointSecret = process.env.ENDPOINT_SECRET;
var globalAnnouncement = '';
const ITCH_HUB_URL = process.env.ITCH_HUB_URL || 'https://gladiusbot.itch.io/gladiusbot';
const CHROME_WEB_STORE_URL = process.env.CHROME_WEB_STORE_URL || 'https://chromewebstore.google.com/detail/gladiusbot/fincifcpkcbcongikgggepbgonnbfopa';

async function linkLicenseToPlayer(LicenseModel, licenseData, idkps) {
    const existingLicense = await LicenseModel.findOne({ playerid: idkps });

    if (isItchLicenseRecord(licenseData)) {
        applyItchActivationDates(licenseData);
        if (!licenseData.payment_method) {
            licenseData.payment_method = 'itch';
        }
    }

    if (existingLicense) {
        const trialStatus = existingLicense.trial;
        await LicenseModel.deleteOne({ _id: existingLicense._id });
        licenseData.playerid = idkps;
        licenseData.trial = trialStatus;
    } else {
        licenseData.playerid = idkps;
    }

    await licenseData.save();
}

function formatLicenseStillValidMessage(licenseKey, expireDate) {
    const expiry = new Date(expireDate);
    const formattedExpiry = isNaN(expiry.getTime())
        ? String(expireDate)
        : expiry.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    return `License ${licenseKey} is still valid until ${formattedExpiry}.`;
}


const License = mongoose.model('license', {
    playerid: String,
    user: String,
    password: String,
    licenseKey: String,
    plan: String,
    messages: Number,
    expireDate: Date,
    trial: Boolean,
    valid: String,
    email: String,
    country: String,
    sessionId: String,
    payment_id: String,
    payment_method: String,
    resetToken: String,
    resetTokenExpiration: Date,
    isAdmin: Boolean,
    transaction_amount: Number,
})

// Modelo para Auditoria de Webhooks e Logs
const saleAuditSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now, required: true },
    paymentId: { type: String, required: true },
    webhookType: { type: String },
    webhookData: { type: Object }, // Dados brutos do Webhook (req.body)
    paymentDetails: { type: Object }, // Detalhes completos da API do Mercado Pago
    email: { type: String },
    planCode: { type: String },
    status: { type: String, enum: ['approved', 'pending', 'ignored', 'error', 'update'] },
    // Liga a um documento da coleção License
    licenseLink: { type: mongoose.Schema.Types.ObjectId, ref: 'license', default: null },
    auditNotes: { type: String }
});

const SaleAudit = mongoose.model('SaleAudit', saleAuditSchema);

app.post ('/webhook', express.raw({type: 'application/json'}), async (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    }
    catch (err) {
        response.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.async_payment_failed':
            const payment_failed = event.data.object;
            console.log('payment_failed!');
            break;
        case 'checkout.session.async_payment_succeeded':
            const payment_succeeded = event.data.object;
            console.log('payment_succeeded!');
            break;
        case 'checkout.session.completed':
            const session = event.data.object;
            const userEmail = session.customer_details.email; // Captura o e-mail digitado pelo usuário
            const userCountry = session.customer_details.address ? session.customer_details.address.country : ''; // Captura o país
            const customerName = userEmail.split('@')[0]; // Captura o nome do cliente

            // Captura os itens da sessão
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
            console.log(`E-mail do cliente: ${userEmail}`);
            console.log(`Nome do cliente: ${customerName}`);
            console.log(`País: ${userCountry}`);
            console.log('Id da sessão:', session.id);
            lineItems.data.forEach(item => {
                console.log(`Produto: ${item.description}, ID: ${item.id}`);

                // Definir a data de expiração com base no produto
                let expirationDate;
                let description;
                const currentDate = new Date();

                if (item.description === 'GLDbot - 60 dias') {
                    expirationDate = new Date(currentDate.setDate(currentDate.getDate() + 60)); // Adiciona 60 dias
                } else if (item.description === 'GLDbot - 30 dias') {
                    expirationDate = new Date(currentDate.setDate(currentDate.getDate() + 30)); // Adiciona 30 dias
                } else if (item.description === 'GLDbot - 15 dias') {
                    expirationDate = new Date(currentDate.setDate(currentDate.getDate() + 15)); // Adiciona 15 dias
                }

                // Gerar chave UUID
                const licenseKey = uuidv4();

                // Salvar no banco de dados
                const newLicense = new License({
                    playerid: "",
                    licenseKey: licenseKey,
                    plan: item.description,
                    expireDate: expirationDate,
                    trial: false, // Set trial como false
                    email: userEmail,
                    country: userCountry,
                    sessionId: session.id,
                });

                newLicense.save()
                    .then(() => console.log(`License for ${customerName} saved successfully.`))
                    .catch((err) => console.error('Error saving license:', err));
            });
            break;
        case 'checkout.session.expired':
            const expired = event.data.object;
            console.log('expired!');
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }
    // Return a response to acknowledge receipt of the event
    response.json({received: true});
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para verificar o JWT
function authenticateAdminToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Espera o formato: Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ success: false, message: 'Acesso negado. Token não fornecido.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // Token inválido, expirado ou alterado
            return res.status(403).json({ success: false, message: 'Token inválido ou expirado.' });
        }

        // Verifica se o usuário autenticado tem permissão de administrador
        if (!user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Permissão insuficiente.' });
        }

        req.user = user; // Adiciona os dados do usuário à requisição
        next(); // Continua para a rota protegida
    });
}

app.post('/admin/login', async (req, res) => {
    const { user, password } = req.body;

    if (!user || !password) {
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
    }

    try {
        // Busca o usuário E verifica se ele tem a permissão isAdmin
        // NOTE: Mesmo que user: ... retorne algo, se isAdmin for false, ele é filtrado aqui.
        const adminUser = await License.findOne({ user, isAdmin: true });

        if (!adminUser) {
            // Se não encontrou o usuário OU o usuário não é admin
            return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
        }

        // VERIFICAÇÃO ESSENCIAL: Garante que o campo password existe antes de usar bcrypt
        if (!adminUser.password) {
            console.error(`Admin user ${user} found but has no password hash.`);
            return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
        }


        // Verifica a senha (o campo password do adminUser é o hash)
        const passwordMatch = await bcrypt.compare(password, adminUser.password);

        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
        }

        // 1. Cria o payload do JWT
        const jwtPayload = {
            id: adminUser._id,
            user: adminUser.user,
            isAdmin: adminUser.isAdmin
        };

        // 2. Cria o JWT com um tempo de expiração
        const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '1h' });

        return res.status(200).json({
            success: true,
            message: 'Login bem-sucedido!',
            token: token // Retorna o JWT para o frontend
        });

    } catch (error) {
        console.error('Erro no login de administrador:', error);
        return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
});

app.get('/', async (req, res) => {
    return res.sendFile(path.join(__dirname, 'welcome.html'));
});

app.get('/home-gld', (req, res) => {
    res.redirect(301, '/');
});

app.get('/gld-admin-login', async (req, res) => {
    return res.sendFile(path.join(__dirname, 'admin_login.html'));
});

// Altere sua rota existente /gld-admin para forçar a checagem de login
app.get('/gld-admin', async (req, res) => {
    return res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/privacy', async (req, res) => {
    return res.sendFile(path.join(__dirname, 'privacy.html'));
});

app.get('/privacy-policy', (req, res) => {
    res.redirect(301, '/privacy');
});

app.get('/licenses', async (req, res) => {
    const licenses = await License.find()
    return res.send(licenses)
})

app.get('/license-info', async (req, res) => {
    const sessionId = req.query.session_id;
    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
    }
    try {
        const license = await License.findOne({ sessionId: sessionId });
        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }
        res.json({
            licenseKey: license.licenseKey,
            expirationDate: license.expireDate,
            plan: license.plan,
            customerName: license.customerName,
            email: license.email,
            country: license.country
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/license-info-mp', async (req, res) => {
    const payment_id = req.query.payment_id;
    if (!payment_id) {
        return res.status(400).json({ error: 'Session ID required' });
    }
    try {
        const license = await License.findOne({ payment_id: payment_id });
        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }
        res.json({
            licenseKey: license.licenseKey,
            expirationDate: license.expireDate,
            plan: license.plan,
            customerName: license.customerName,
            email: license.email,
            country: license.country
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/contact', upload, async (req, res) => {
    const { name, email, message } = req.body;

    // Verifique se há um arquivo anexado
    const attachment = req.file;

    console.log('Dados recebidos:', { name, email, message, attachment });

    const msg = {
        to: 'raphaelmarquesr@gmail.com', // Seu e-mail para receber as mensagens de contato
        from: 'gldbotsuport@gmail.com', // Endereço de origem
        subject: `Nova mensagem de contato de ${name}`,
        text: `Nome: ${name}\nE-mail: ${email}\nMensagem: ${message}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; color: #333;">
                <h2 style="color: #4CAF50;">Nova Mensagem de Contato</h2>
                <p><strong>Nome:</strong> ${name}</p>
                <p><strong>E-mail:</strong> ${email}</p>
                <p><strong>Mensagem:</strong></p>
                <p style="white-space: pre-line;">${message}</p>
            </div>
        `,
    };

    // Se houver um arquivo, adicione-o como anexo
    if (attachment) {
        msg.attachments = [{
            filename: attachment.originalname,
            content: attachment.buffer.toString('base64'),
            type: attachment.mimetype,
            disposition: 'attachment',
        }];
    }

    try {
        await sgMail.send(msg);
        console.log('E-mail de contato enviado com sucesso');
        res.status(200).json({ success: true, message: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar o e-mail de contato:', error);
        if (error.response) {
            console.error(error.response.body);
        }
        res.status(500).json({ success: false, message: 'Erro ao enviar a mensagem, tente novamente mais tarde.' });
    }
});

app.post('/announcement', authenticateAdminToken, async (req, res) => {
    const { announcement } = req.body;

    if (announcement !== undefined && typeof announcement !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid announcement string' });
    }

    globalAnnouncement = announcement || '';

    return res.status(200).json({
        success: true,
        message: 'Announcement saved successfully',
        announcement: globalAnnouncement,
    });
});


app.get('/announcement', (req, res) => {
    return res.status(200).json({ success: true, announcement: globalAnnouncement });
});

app.get('/admin/announcement', authenticateAdminToken, (req, res) => {
    return res.status(200).json({
        success: true,
        announcement: globalAnnouncement,
        updatedAt: globalAnnouncement ? null : null,
    });
});

app.post('/admin/announcement', authenticateAdminToken, async (req, res) => {
    const { announcement } = req.body;
    if (announcement !== undefined && typeof announcement !== 'string') {
        return res.status(400).json({ success: false, message: 'Texto de anúncio inválido.' });
    }
    globalAnnouncement = announcement || '';
    return res.json({
        success: true,
        message: globalAnnouncement
            ? 'Anúncio publicado com sucesso.'
            : 'Anúncio removido. Os usuários verão a mensagem padrão do bot.',
        announcement: globalAnnouncement,
    });
});

app.get('/admin/bot-monitor', authenticateAdminToken, (req, res) => {
    return res.json({ success: true, ...getDashboard() });
});

app.get('/admin/customer-emails', authenticateAdminToken, async (req, res) => {
    try {
        const filter = ['all', 'active', 'inactive'].includes(req.query.filter)
            ? req.query.filter
            : 'all';
        const customers = await aggregateCustomerEmails(License, filter);
        const counts = await getCustomerEmailStats(License);
        return res.json({ success: true, filter, counts, customers });
    } catch (error) {
        console.error('Erro ao buscar e-mails de clientes:', error);
        return res.status(500).json({ success: false, message: 'Erro ao buscar e-mails de clientes.' });
    }
});

app.post('/admin/broadcast-email', authenticateAdminToken, async (req, res) => {
    try {
        const { subject, message, mode, filter, recipients } = req.body;
        const trimmedMessage = String(message || '').trim();

        if (!trimmedMessage) {
            return res.status(400).json({ success: false, message: 'A mensagem é obrigatória.' });
        }
        if (trimmedMessage.length > 8000) {
            return res.status(400).json({ success: false, message: 'Mensagem muito longa (máx. 8000 caracteres).' });
        }

        let targetEmails = [];

        if (mode === 'selected') {
            if (!Array.isArray(recipients) || recipients.length === 0) {
                return res.status(400).json({ success: false, message: 'Selecione ao menos um destinatário.' });
            }
            targetEmails = recipients.map(normalizeEmail).filter(isValidEmail);
        } else {
            const listFilter = ['all', 'active', 'inactive'].includes(filter) ? filter : 'all';
            const customers = await aggregateCustomerEmails(License, listFilter);
            targetEmails = customers.map((c) => c.email);
        }

        if (targetEmails.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum destinatário válido encontrado.' });
        }

        const html = buildBroadcastEmailHtml(trimmedMessage);
        const result = await sendBroadcastEmails(
            sgMail,
            targetEmails,
            String(subject || '').trim() || DEFAULT_SUBJECT,
            html
        );

        if (result.sent === 0) {
            return res.status(500).json({
                success: false,
                message: 'Falha ao enviar os e-mails.',
                ...result,
            });
        }

        return res.json({
            success: true,
            message: `Campanha enviada: ${result.sent} de ${result.total} e-mail(s). Cada destinatário recebe individualmente (sem lista visível).`,
            ...result,
        });
    } catch (error) {
        console.error('Erro no broadcast de e-mail:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao enviar campanha.' });
    }
});

app.get('/admin/broadcast-email/preview', authenticateAdminToken, (req, res) => {
    const message = String(req.query.message || '').trim();
    if (!message) {
        return res.status(400).json({ success: false, message: 'Informe uma mensagem para preview.' });
    }
    return res.json({
        success: true,
        subject: DEFAULT_SUBJECT,
        html: buildBroadcastEmailHtml(message),
    });
});

app.post('/mercadopago/checkout', async (req, res) => {
    const { plan_code, email } = req.body;

    const selectedPlan = getMercadoPagoPlan(plan_code);

    if (!selectedPlan) {
        return res.status(400).send({ error: 'Plano inválido.' });
    }

    try {
        const checkoutId = uuidv4();
        const externalReference = buildMercadoPagoExternalReference(plan_code, checkoutId);

        // Cria a preferência de pagamento
        const preference = {
            external_reference: externalReference,
            statement_descriptor: MP_STATEMENT_DESCRIPTOR,
            items: [
                {
                    id: plan_code,
                    title: selectedPlan.title,
                    description: selectedPlan.description,
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: selectedPlan.price,
                },
            ],
            payer: { email },
            payment_methods: {
                default_installments: 1, // Parcelamento padrão ao abrir o checkout
                max_installments: 12    // Máximo de parcelas permitido
            },
            back_urls: {
                success: `https://gldbotserver.com/success.html`,
                failure: `https://gldbotserver.com/checkout.html`,
                pending: `https://gldbotserver.com/checkout.html`,
            },
            auto_return: 'approved',
            metadata: {
                plan_code,
                email,
                checkout_id: checkoutId,
                external_reference: externalReference,
            },
        };
        console.log('preference: ', preference)

        // Cria a preferência usando o SDK
        const response = await preferenceAPI.create({ body: preference });
        console.log('response: ', response)

        // Retorna o link de checkout
        res.send({ checkoutUrl: response.init_point });
    } catch (error) {
        console.error('Erro ao criar preferência:', error);
        res.status(500).send({ error: 'Erro ao criar preferência' });
    }
});

// Webhook do Mercado Pago
app.post('/mercadopago/webhook', async (req, res) => {
    const { type, data } = req.body;
    console.log('req.body: ', req.body);
    const paymentId = req.body.data?.id;

    let auditLogData = {
        paymentId: paymentId || 'unknown',
        webhookType: type,
        webhookData: req.body,
        status: 'pending',
        auditNotes: 'Processamento iniciado.'
    };

    // Adiciona um atraso de 5 segundos antes de consultar o pagamento
    await new Promise((resolve) => setTimeout(resolve, 5000));


    if (type === 'payment') {
        const paymentId = req.body.data.id;

        try {
            // Consulta os detalhes do pagamento
            const payment = await paymentAPI.get({id: paymentId});
            console.log("Detalhes do pagamento: ", payment);
            auditLogData.paymentDetails = payment;

            if (payment?.status === 'approved' || payment.date_approved !== null) {
                auditLogData.status = 'approved';

                if (payment.date_approved) {
                    const approvedDate = new Date(payment.date_approved);
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                    if (approvedDate < sevenDaysAgo) {
                        auditLogData.status = 'ignored';
                        auditLogData.auditNotes = 'Pagamento aprovado há mais de 7 dias. Ignorando notificação (provavelmente Liberação de Dinheiro).';
                        await new SaleAudit(auditLogData).save();
                        console.warn(`Pagamento aprovado em ${approvedDate.toISOString()}, que é mais de 7 dias atrás. Ignorando notificação (provavelmente Liberação de Dinheiro).`);
                        return res.status(200).send();
                    }
                }

                const email = payment.metadata?.email || payment.payer?.email;
                let planCode = payment.metadata?.plan_code
                    || parsePlanCodeFromExternalReference(payment.external_reference);
                const externalReference = payment.external_reference
                    || payment.metadata?.external_reference
                    || null;

                auditLogData.email = email;
                auditLogData.planCode = planCode;
                if (externalReference) {
                    auditLogData.auditNotes = `external_reference: ${externalReference}`;
                }

                if (!email || !planCode) {
                    auditLogData.status = 'error';
                    auditLogData.auditNotes = `Dados insuficientes no pagamento (email ou plano). external_reference=${externalReference || 'N/A'}`;
                    await new SaleAudit(auditLogData).save();
                    console.error('Webhook MP sem email ou planCode:', { email, planCode, externalReference });
                    return res.status(200).send();
                }

                const plans = MP_PLANS;

                const selectedPlan = plans[planCode];

                if (!selectedPlan) {
                    auditLogData.status = 'error';
                    auditLogData.auditNotes = `Plano inválido: ${planCode}. Licença não gerada.`;
                    await new SaleAudit(auditLogData).save();
                    console.error('Plano inválido:', planCode);
                    return res.status(400).send();
                }

                // Verifica se já existe uma licença para o payment_id
                const existingLicense = await License.findOne({ payment_id: paymentId });
                if (existingLicense) {
                    auditLogData.status = 'ignored';
                    auditLogData.licenseLink = existingLicense._id; // Liga à licença encontrada
                    auditLogData.auditNotes = 'Licença já existe para este pagamento. Nenhuma ação realizada (Webhook duplicado).';
                    // Salva o log e retorna
                    await new SaleAudit(auditLogData).save();
                    console.log('Licença já existe para este pagamento. Nenhuma ação será realizada.');
                    return res.status(200).send();
                }

                // Gera a licença
                const licenseKey = uuidv4();
                const planTitle = resolvePlanTitleForDb({
                    planCode,
                    paymentDescription: payment.description,
                });
                const expireDate = new Date();
                const transactionAmount = payment.transaction_amount; // Captura o valor da transação
                expireDate.setDate(expireDate.getDate() + selectedPlan.duration);
                let country;
                const payment_method = payment.payment_method.id;
                if (payment.currency_id === "BRL") {
                    country = "Brasil";
                } else {
                    country = payment.currency_id;
                }

                // Salva a licença no banco
                const newLicense = new License({
                    playerid: "",
                    licenseKey: licenseKey,
                    plan: planTitle,
                    expireDate: expireDate,
                    trial: false,
                    email: email,
                    country: country,
                    payment_method: payment_method,
                    payment_id: paymentId,
                    transaction_amount: transactionAmount,
                });

                await newLicense.save();

                console.log('Pagamento aprovado, licença gerada:', licenseKey);
                auditLogData.licenseLink = newLicense._id;
                auditLogData.auditNotes = externalReference
                    ? `Pagamento aprovado e nova licença gerada. external_reference=${externalReference}`
                    : 'Pagamento aprovado e nova licença gerada com sucesso.';


                // ---- CHAMAR A ROTA /sendMail PARA ENVIAR O E-MAIL ----
                let customerName;
                if (payment.card && payment.card.cardholder && payment.card.cardholder.name) {
                    customerName = payment.card.cardholder.name;
                } else {
                    customerName = email.split('@')[0];
                }

                try {
                    const sendMailResponse = await fetch('https://gldbotserver.com/sendMail', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            customerName: customerName,
                            planCode: planCode,
                            itemDescription: planTitle,
                            licenseKey: licenseKey,
                            expirationDate: expireDate,
                            email: email
                        })
                    });

                    const responseData = await sendMailResponse.json();
                    console.log('Resposta do envio de e-mail:', responseData);
                } catch (error) {
                    console.error('Erro ao chamar a rota /sendMail:', error);
                }
            } else {
                auditLogData.status = 'pending';
                auditLogData.auditNotes = 'Pagamento em status PENDENTE ou com falha. Nenhuma licença gerada.';
                console.warn('Pagamento não aprovado ou pendente.');
            }
        } catch (error) {
            auditLogData.status = 'error';
            auditLogData.auditNotes = `ERRO FATAL: ${error.message}.`;
            console.error('Erro ao consultar detalhes do pagamento:', error);
            try { await new SaleAudit(auditLogData).save(); } catch(e) { console.error("Falha ao salvar log de erro:", e); }
        }
    } else if (type !== 'payment') {
        auditLogData.status = 'ignored';
        auditLogData.auditNotes = `Tipo de webhook ignorado: ${type}.`;
    }
    await new SaleAudit(auditLogData).save();
    res.status(200).send();
});


app.post('/sendMail', async (req, res) => {
    const { customerName, itemDescription, licenseKey, expirationDate, email, planCode } = req.body;
    console.log('Received Parameters:', { customerName, itemDescription, licenseKey, expirationDate, email, planCode });

    if (!email || !licenseKey) {
        return res.status(400).json({ message: 'E-mail e licenseKey são obrigatórios.' });
    }

    const planLabel = resolvePlanLabel({ planCode, itemDescription });

    const msg = {
        to: [email, 'gldbotsuport@gmail.com'],
        from: PURCHASE_FROM,
        replyTo: PURCHASE_REPLY_TO,
        subject: 'Sua licença GladiusBot — compra confirmada',
        html: buildPurchaseEmailHtml({
            customerName,
            planLabel,
            licenseKey,
            expirationDate,
        }),
        attachments: getPurchaseEmailAttachments(),
    };

    try {
        await sgMail.send(msg);
        console.log('E-mail de compra enviado com sucesso');
        res.send({ message: 'E-mail enviado com sucesso!', planLabel });
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
        if (error.response) {
            console.error(error.response.body);
        }
        res.status(500).json({ message: 'Erro ao enviar e-mail.' });
    }
});

app.post('/admin/sales-overview', authenticateAdminToken, async (req, res) => {
    try {
        const currentDate = new Date();

        // 1. Total de Licenças (Total de Vendas)
        const totalLicenses = await License.countDocuments({ trial: false });

        // 2. Licenças Ativas (Pagamento Aprovado E Não Expirado)
        const activeLicenses = await License.countDocuments({
            expireDate: { $gt: currentDate },
            trial: false
        });

        // 3. Vendas por Método de Pagamento (Aggregation)
        const salesByMethod = await License.aggregate([
            { $match: { payment_method: { $ne: null }, trial: false } },
            { $group: {
                    _id: "$payment_method",
                    count: { $sum: 1 },
                    totalRevenue: { $sum: "$transaction_amount" } // Soma a receita total por método
                }},
            { $sort: { count: -1 } }
        ]);

        // 4. Receita total de vendas pagas
        const totalRevenueResult = await License.aggregate([
            { $match: { transaction_amount: { $exists: true, $ne: null }, trial: false } },
            { $group: {
                    _id: null,
                    total: { $sum: "$transaction_amount" }
                }}
        ]);

        const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total.toFixed(2) : '0.00';

        const totalPaidSales = await License.countDocuments({ trial: false, payment_method: { $ne: null } });

        return res.json({
            success: true,
            totalLicenses,
            activeLicenses,
            totalPaidSales,
            totalRevenue,
            salesByMethod,
        });

    } catch (error) {
        console.error('Erro ao buscar estatísticas de vendas:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao buscar dados.' });
    }
});

app.get('/admin/sales', authenticateAdminToken, async (req, res) => {
    try {
        const { days } = req.query; // '1', '7', '14', '30', ou 'all'
        let dateFilter = {};

        if (days && days !== 'all') {
            const date = new Date();
            date.setDate(date.getDate() - parseInt(days, 10));
            dateFilter = { timestamp: { $gte: date } };
        }

        // Busca, ordena e popula o campo licenseLink com os dados completos da licença
        const sales = await SaleAudit.find(dateFilter)
            .sort({ timestamp: -1 })
            .populate('licenseLink') // Popula os dados da licença
            .limit(100);

        res.json(sales);

    } catch (error) {
        console.error('Erro ao buscar logs de auditoria:', error);
        res.status(500).json({ message: 'Erro interno ao buscar logs de auditoria.' });
    }
});

app.post('/admin/licenses/search', authenticateAdminToken, async (req, res) => {
    try {
        const { filter, searchTerm } = req.body;
        const currentDate = new Date();
        let query = {};

        // 1. Construir o filtro de status
        switch (filter) {
            case 'active':
                query.expireDate = { $gt: currentDate };
                // CORREÇÃO: Garante que está vinculada (playerid NÃO é "")
                query.playerid = { $exists: true, $ne: "" };
                break;
            case 'inactive':
                query.expireDate = { $lte: currentDate };
                // CORREÇÃO: Garante que está vinculada (playerid NÃO é "")
                query.playerid = { $exists: true, $ne: "" };
                break;
            case 'unlinked_active':
                query.playerid = "";
                query.$or = [
                    { expireDate: { $gt: currentDate } },
                    {
                        payment_method: 'itch',
                        $or: [
                            { expireDate: null },
                            { expireDate: { $exists: false } },
                        ],
                    },
                    {
                        licenseKey: { $regex: /^ITCH-/i },
                        $or: [
                            { expireDate: null },
                            { expireDate: { $exists: false } },
                        ],
                    },
                ];
                break;
            case 'unlinked_inactive':
                query.playerid = "";
                query.expireDate = { $lte: currentDate, $ne: null, $exists: true };
                break;
            case 'itch_unused':
                query.payment_method = 'itch';
                query.playerid = '';
                query.$or = [
                    { expireDate: null },
                    { expireDate: { $exists: false } },
                ];
                break;
            case 'all':
            default:
                // Nenhum filtro de data ou vínculo
                break;
        }

        // 2. Construir o filtro de busca (se houver)
        if (searchTerm && searchTerm.trim() !== '') {
            query.$or = [
                { licenseKey: searchTerm },
                { playerid: searchTerm }
            ];
        }

        // 3. Executar a busca
        const licenses = await License.find(query)
            .select('licenseKey playerid expireDate email trial plan payment_method')
            .sort({ expireDate: -1 })
            .limit(500);

        res.json({ success: true, licenses });

    } catch (error) {
        console.error('Erro ao buscar licenças:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor' });
    }
});

/**
 * Rota para desvincular um playerid de uma licença.
 * Recebe um corpo { licenseKey }
 */
app.get('/admin/itch/licenses/stats', authenticateAdminToken, async (req, res) => {
    try {
        const itchBase = { payment_method: 'itch', trial: false };
        const unusedQuery = {
            ...itchBase,
            playerid: '',
            $or: [
                { expireDate: null },
                { expireDate: { $exists: false } },
            ],
        };

        const unusedTotal = await License.countDocuments(unusedQuery);
        const byPlan = {};
        for (const [code, plan] of Object.entries(ITCH_PLANS)) {
            byPlan[code] = await License.countDocuments({
                ...unusedQuery,
                plan: plan.title,
            });
        }

        const activated = await License.countDocuments({
            ...itchBase,
            playerid: { $ne: '' },
        });

        return res.json({
            success: true,
            unusedTotal,
            activated,
            byPlan,
            plans: ITCH_PLANS,
            itchApiConfigured: Boolean(process.env.ITCH_API_KEY),
        });
    } catch (error) {
        console.error('Erro ao buscar stats itch:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao buscar estatísticas itch.' });
    }
});

app.post('/admin/itch/licenses/generate', authenticateAdminToken, async (req, res) => {
    try {
        const { planCode, quantity } = req.body;
        const qty = Math.min(Math.max(parseInt(quantity, 10) || 0, 1), 500);

        if (!ITCH_PLANS[planCode]) {
            return res.status(400).json({
                success: false,
                message: 'Plano inválido. Use 15DAYS, 30DAYS ou 60DAYS.',
            });
        }

        const docs = [];
        const keys = new Set();
        let attempts = 0;

        while (docs.length < qty && attempts < qty * 8) {
            attempts += 1;
            const doc = buildItchLicenseDocument(planCode);
            if (keys.has(doc.licenseKey)) continue;

            const exists = await License.findOne({ licenseKey: doc.licenseKey }).select('_id');
            if (exists) continue;

            keys.add(doc.licenseKey);
            docs.push(doc);
        }

        if (docs.length < qty) {
            return res.status(500).json({
                success: false,
                message: 'Não foi possível gerar chaves únicas. Tente novamente.',
            });
        }

        await License.insertMany(docs);

        return res.json({
            success: true,
            message: `${docs.length} licença(s) itch gerada(s). Faça upload do CSV no itch.io → Distribute → External keys.`,
            count: docs.length,
            planCode,
            plan: ITCH_PLANS[planCode].title,
            licenses: docs.map((doc) => ({
                licenseKey: doc.licenseKey,
                plan: doc.plan,
            })),
            csv: licensesToItchCsv(docs),
        });
    } catch (error) {
        console.error('Erro ao gerar licenças itch:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao gerar licenças itch.' });
    }
});

app.get('/admin/itch/games', authenticateAdminToken, async (req, res) => {
    try {
        const games = await fetchProfileGames();
        return res.json({
            success: true,
            games: games.map((game) => ({
                id: game.id,
                title: game.title,
                url: game.url,
                purchases_count: game.purchases_count,
            })),
            configuredGameIds: {
                '15DAYS': process.env.ITCH_GAME_ID_15D || null,
                '30DAYS': process.env.ITCH_GAME_ID_30D || null,
                '60DAYS': process.env.ITCH_GAME_ID_60D || null,
            },
        });
    } catch (error) {
        console.error('Erro ao listar jogos itch:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Erro ao consultar API do itch.io.',
        });
    }
});

app.post('/admin/itch/enrich', authenticateAdminToken, async (req, res) => {
    try {
        const { licenseKey, downloadKey, planCode } = req.body;

        if (!licenseKey || !downloadKey) {
            return res.status(400).json({
                success: false,
                message: 'licenseKey e downloadKey são obrigatórios.',
            });
        }

        const license = await License.findOne({ licenseKey });
        if (!license || !isItchLicenseRecord(license)) {
            return res.status(404).json({
                success: false,
                message: 'Licença itch não encontrada.',
            });
        }

        const enrichment = await enrichLicenseFromDownloadKey({
            planCode,
            planTitle: license.plan,
            downloadKey,
        });

        if (enrichment.email) {
            license.email = enrichment.email;
        }
        license.country = license.country || 'itch.io';
        await license.save();

        return res.json({
            success: true,
            message: enrichment.email
                ? 'E-mail do comprador vinculado via itch.io.'
                : 'Download key válida, mas nenhum e-mail de compra foi encontrado.',
            licenseKey: license.licenseKey,
            email: license.email || null,
            itchUsername: enrichment.itchUsername,
            itchUserId: enrichment.itchUserId,
        });
    } catch (error) {
        console.error('Erro ao enriquecer licença itch:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Erro ao consultar itch.io.',
        });
    }
});

app.post('/admin/licenses/unlink', authenticateAdminToken, async (req, res) => {
    try {
        const { licenseKey } = req.body;

        if (!licenseKey) {
            return res.status(400).json({ success: false, message: 'licenseKey é obrigatória.' });
        }

        const license = await License.findOne({ licenseKey: licenseKey });

        if (!license) {
            return res.status(404).json({ success: false, message: 'Licença não encontrada.' });
        }

        if (!license.playerid || license.playerid === "") {
            return res.status(400).json({ success: false, message: 'Esta licença já está sem vínculo.' });
        }

        const oldPlayerId = license.playerid;
        license.playerid = ""; // Remove o vínculo

        await license.save();

        res.json({
            success: true,
            message: `Vínculo com o PlayerID ${oldPlayerId} removido com sucesso!`
        });

    } catch (error) {
        console.error('Erro ao desvincular licença:', error);
        res.status(500).json({ success: false, message: 'Erro interno no servidor' });
    }
});

app.post('/country', (req, res) => {
    const { country } = req.body;

    if (country === 'br') {
        res.json({ redirectTo: 'checkout' });
    } else {
        res.json({ redirectTo: 'itch', url: ITCH_HUB_URL });
    }
});

app.post('/checkout15', async (req, res) => {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
                price: 'price_1QKLLuAgZqiodFBThrtZMlzj',
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `https://gldbotserver.com/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://gldbotserver.com/checkout.html`,
    });
    res.redirect(303, session.url);
});

app.post('/checkout30', async (req, res) => {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
                price: 'price_1QKLKDAgZqiodFBTn6IkgSME',
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `https://gldbotserver.com/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://gldbotserver.com/checkout.html`,
    });
    res.redirect(303, session.url);
});

app.post('/checkout60', async (req, res) => {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
                price: 'price_1QKLMyAgZqiodFBTBK4PXXMV',
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `https://gldbotserver.com/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://gldbotserver.com/checkout.html`,
    });
    res.redirect(303, session.url);
});

app.post('/teste', async (req, res) => {
    console.log('Dados recebidos do Gumroad:', req.body);
    const data = req.body;
    console.log('JSON recebido:', data);

    res.status(200).send('Webhook received');
});

app.get('/emails', authenticateAdminToken, async (req, res) => {
    try {
        const customers = await aggregateCustomerEmails(License, 'all');
        const emails = customers.map((c) => c.email);
        if (!emails.length) {
            return res.status(404).json({ success: false, message: 'Nenhum email encontrado.' });
        }
        return res.json({ success: true, emails });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Erro ao buscar emails', error: error.message });
    }
});

app.post('/activeplayers', async (req, res) => {
    const { password } = req.body;


    if (password !== 'adminacessall') {
        return res.status(403).json({ success: false, message: 'Acesso negado!' });
    }
    try {
        const currentDate = new Date();

        const activePlayers = await License.find({
            expireDate: { $gt: currentDate }
        }, 'playerid email country');

        if (!activePlayers || activePlayers.length === 0) {
            return res.status(404).json({ success: false, message: 'Nenhum player ativo encontrado.' });
        }

        res.json({ success: true, activePlayers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao buscar players ativos', error: error.message });
    }
});

app.post('/gumroad', async (req, res) => {
    console.log("Dados recebidos:", req.body);

    const { license_key, sale_timestamp, variants, email, ip_country } = req.body;

    try {
        switch (variants.Version) {
            case 'Send 10 times':
            case 'Send 20 times':
            case 'Send 30 times':
            case 'Vitalicy': {
                let additionalMessages = 0;

                switch (variants.Version) {
                    case 'Send 10 times':
                        additionalMessages = 10;
                        break;
                    case 'Send 20 times':
                        additionalMessages = 20;
                        break;
                    case 'Send 30 times':
                        additionalMessages = 30;
                        break;
                    case 'Vitalicy':
                        additionalMessages = 999999;
                        break;
                }

                const newLicense = new License({
                    user: "",
                    licenseKey: license_key,
                    valid: "valid",
                    country: ip_country,
                    plan: variants.Version,
                    messages: additionalMessages,
                });

                await newLicense.save();
                console.log('Licença salva com sucesso:', newLicense);
                return res.status(200).json({ success: true, message: 'Webhook received and processed' });
            }

            case '90 days':
            case '60 days':
            case '30 days':
            case '15 days': {
                const createdAtDate = new Date(sale_timestamp);
                let expireDate;

                switch (variants.Version) {
                    case '90 days':
                        expireDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 3));
                        break;
                    case '60 days':
                        expireDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 2));
                        break;
                    case '30 days':
                        expireDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 1));
                        break;
                    case '15 days':
                        expireDate = new Date(createdAtDate.setDate(createdAtDate.getDate() + 15));
                        break;
                }

                const newLicense = new License({
                    playerid: "",
                    licenseKey: license_key,
                    expireDate: expireDate,
                    trial: false,
                    email: email,
                    country: ip_country,
                });

                await newLicense.save();
                console.log('Licença salva com sucesso:', newLicense);
                return res.status(200).json({ success: true, message: 'Webhook received and processed' });
            }

            default:
                console.log("Erro: Variant desconhecido");
                return res.status(400).json({ success: false, message: 'Variant desconhecido' });
        }
    } catch (error) {
        console.error('Erro ao salvar a licença:', error);
        return res.status(500).json({ success: false, message: 'Erro ao processar o webhook' });
    }
});

app.post('/manage-license', async (req, res) => {
    const { action, n, licenseKey } = req.body;

    try {
        if (action === 'create') {
            // Criação de uma nova licença
            const newLicenseKey = uuidv4();
            const currentDate = new Date();
            currentDate.setMonth(currentDate.getMonth() + parseInt(n));

            const newLicense = new License({
                playerid: "",
                licenseKey: newLicenseKey,
                expireDate: currentDate,
                trial: false,
                email: "",
                country: "",
            });

            await newLicense.save();

            return res.json({
                success: true,
                message: 'Licença criada com sucesso',
                licenseKey: newLicenseKey,
                expireDate: currentDate,
            });

        } else if (action === 'updateKey') {
            // Atualização da licença existente
            let licenseData = await License.findOne({ licenseKey });

            if (licenseData) {
                // Calcula a nova data de expiração
                const updatedExpireDate = new Date(licenseData.expireDate);
                updatedExpireDate.setMonth(updatedExpireDate.getMonth() + parseInt(n));

                // Atualiza o campo expireDate no documento Mongoose
                licenseData.expireDate = updatedExpireDate;

                // Salva as alterações no banco de dados
                await licenseData.save();

                return res.json({
                    success: true,
                    message: 'Licença atualizada com sucesso',
                    licenseKey: licenseKey,
                    expireDate: licenseData.expireDate.toISOString(), // Certifica-se de retornar a data em formato ISO
                });
            } else {
                // Criar nova licença se a chave não for encontrada
                const newLicenseKey = uuidv4();
                const currentDate = new Date();
                currentDate.setMonth(currentDate.getMonth() + parseInt(n));

                const newLicense = new License({
                    playerid: "",
                    licenseKey: newLicenseKey,
                    expireDate: currentDate,
                    trial: false,
                    email: "",
                    country: "",
                });

                await newLicense.save();

                return res.json({
                    success: true,
                    message: 'Key não encontrada, uma nova foi gerada',
                    licenseKey: newLicenseKey,
                    expireDate: currentDate,
                });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Ação inválida' });
        }
    } catch (error) {
        console.error('Erro ao gerenciar a licença:', error);
        return res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

app.post('/login', async (req, res) => {
    const { user, password } = req.body;

    if (!user || !password) {
        return res.status(400).json({ success: false, message: 'User and password are required' });
    }

    try {
        const existingUser = await License.findOne({ user });
        if (!existingUser) {
            return res.status(400).json({ success: false, message: 'User does not exist' });
        }

        const passwordMatch = await bcrypt.compare(password, existingUser.password);
        if (!passwordMatch) {
            return res.status(400).json({ success: false, message: 'Invalid password' });
        }

        let newMessageCount = existingUser.messages;
        if (newMessageCount > 50000) {
            newMessageCount = -43;
        }

        return res.status(200).json({ success: true, q: newMessageCount, message: 'Login successful' });
    } catch (error) {
        console.error('Error in /login:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/register', async (req, res) => {
    const { user, password, email } = req.body;

    if (!user || !password || !email) {
        return res.status(400).json({ success: false, message: 'User and password are required' });
    }

    try {
        // Verifica se o usuário já existe
        const existingUser = await License.findOne({ user });

        if (existingUser) {
            return res.status(200).json({ success: false, message: 'User already exists' });
        }
        // Verifica se o e-mail já está registrado com um usuário vinculado
        const emailInUse = await License.findOne({ email, user: { $ne: null } });
        if (emailInUse) {
            return res.status(200).json({ success: false, message: 'Email already registered' });
        }

        // Criptografa a senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Cria e salva o novo usuário com a senha criptografada
        const newUser = new License({
            user: user,
            password: hashedPassword,
            messages: 0,
            email: email,
        });

        await newUser.save();
        return res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        console.error('Error in /register:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/request-password-reset', async (req, res) => {
    const { user } = req.body;

    if (!user) {
        return res.status(400).json({ success: false, message: 'User is required' });
    }

    try {
        // Verifica se o usuário existe no banco
        const existingUser = await License.findOne({ user });
        if (!existingUser) {
            return res.status(404).json({ success: false, message: 'User does not exist' });
        }

        // Gera um token de redefinição de senha
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiration = Date.now() + 3600000; // Token válido por 1 hora
        const imagePath = path.join(__dirname, 'images/gldicon.png');
        const imageData = fs.readFileSync(imagePath).toString('base64');


        existingUser.resetToken = resetToken;
        existingUser.resetTokenExpiration = resetTokenExpiration;
        await existingUser.save();

        // Cria o link para redefinição de senha
        const resetLink = `https://gldbotserver.com/reset_password.html?token=${resetToken}`;


        const msg = {
            to: existingUser.email,
            from: 'gldbotsuport@gmail.com',
            subject: 'Password Reset',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; max-width: 600px; margin: auto; border-radius: 8px;">
                    <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
                        <div style="text-align: center;">
                            <img src="cid:gldicon" alt="GLDbot" style="width: 200px;">
                            <h2 style="color: #4d3131; text-align: center;">Password Reset</h2>
                        </div>
                        <p style="font-size: 16px; color: #555555;">Hello, ${existingUser.user}</p>
                        <p style="font-size: 16px; color: #555555;">
                            We received a request to reset your password. Please click the button below to reset your password.
                        </p>
                        <div style="text-align: center;">
                            <a href="${resetLink}" style="background-color: #590f0f; color: #ffffff; padding: 15px 25px; font-size: 16px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">
                                Reset Password
                            </a>
                        </div>
                        <p style="font-size: 14px; color: #555555; margin-top: 20px;">
                            This link will expire in 1 hour. If you did not request this, you can ignore this email.
                        </p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                        <p style="font-size: 14px; color: #888888; text-align: center;">
                            If you have any questions, feel free to contact our support team.
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: 'gldicon.png',
                    content: imageData,
                    type: 'image/png',
                    disposition: 'inline',
                    content_id: 'gldicon'
                }
            ]
        };

        // Envia o e-mail via SendGrid
        await sgMail.send(msg);

        return res.status(200).json({ success: true, message: 'Password reset link sent to email' });
    } catch (error) {
        console.error('Error in /request-password-reset:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const { token, password } = req.body;

    // Verificar se todos os dados foram fornecidos
    if (!token || !password) {
        return res.status(400).json({ success: false, message: 'Token and password are required' });
    }

    try {
        // Procurar o usuário no banco de dados com base no token e na validade do token
        const user = await License.findOne({
            resetToken: token,
            resetTokenExpiration: { $gt: Date.now() }, // Certificar que o token não expirou
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired token' });
        }

        // Criptografar a nova senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Atualizar a senha no banco e limpar o token e sua validade
        user.password = hashedPassword;
        user.resetToken = undefined;
        user.resetTokenExpiration = undefined;

        await user.save();

        return res.status(200).json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        console.error('Error resetting password:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


app.post('/ps', async (req, res) => {
    const { licenseKey, user } = req.body;

    // Verifica se os campos obrigatórios foram enviados
    if (!licenseKey || !user) {
        return res.status(400).json({ success: false, message: 'License key and user are required' });
    }

    try {
        // Procura a licença no banco de dados
        const licenseRecord = await License.findOne({ licenseKey });

        if (!licenseRecord) {
            return res.status(404).json({ success: false, message: 'License key does not exist' });
        }

        // Verifica se a licença está válida ou já utilizada
        if (licenseRecord.valid === 'used') {
            return res.status(400).json({ success: false, message: 'License key already used' });
        } else if (licenseRecord.valid !== 'valid') {
            return res.status(400).json({ success: false, message: 'License key is not valid' });
        }

        // Procura o usuário no banco de dados
        const userRecord = await License.findOne({ user });

        if (!userRecord) {
            return res.status(404).json({ success: false, message: 'User does not exist, please login' });
        }

        // Soma as mensagens
        let newMessageCount = userRecord.messages + licenseRecord.messages;

        // Atualiza o registro do usuário com o novo valor de mensagens
        userRecord.messages = newMessageCount;
        await userRecord.save();

        // Marca a licença como "used"
        licenseRecord.valid = 'used';
        await licenseRecord.save();

        if (newMessageCount > 50000) {
            newMessageCount = -43;
        }

        // Retorna o novo valor de mensagens
        return res.status(200).json({ success: true, message: 'License key applied successfully', newMessageCount });
    } catch (error) {
        console.error('Error in /ps route:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/ls', async (req, res) => {
    const { user } = req.body;

    if (!user) {
        return res.status(400).json({ success: false, message: "Usuário não fornecido." });
    }

    try {
        const foundLicense = await License.findOne({ user });

        if (!foundLicense) {
            return res.status(404).json({ success: false, message: "Usuário não encontrado." });
        }

        if (foundLicense.messages <= 0) {
            return res.json({
                success: false,
                message: "Você possui 0 mensagens disponíveis, faça uma recarga!",
            });
        }

        let remainingMessages = foundLicense.messages - 1;
        foundLicense.messages = remainingMessages;
        await foundLicense.save();

        if (remainingMessages > 50000) {
            remainingMessages = -43;
        }

        res.json({
            success: true,
            w: remainingMessages,
            t: "index.php?mod=messages&submod=messageNew",
        });
    } catch (error) {
        console.error("Erro ao processar a rota '/ls':", error);
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
});

app.post('/validate-key', async (req, res) => {
    const { idkps } = req.body;

    try {
        const licenseData = await assertLicenseActive(License, idkps);

        if (licenseData) {
            const session = issueLicenseSession(JWT_SECRET, idkps, licenseData.expireDate);
            recordSessionOk('validate-key', idkps, { trial: !!licenseData.trial });
            return res.json({
                valid: true,
                p: session.p,
                token: session.token,
                qs: session.qs,
                globalAnnouncement: String(globalAnnouncement),
                expirationDate: GLOBAL_EXPIRATION_DATE,
                refreshToken: GLOBAL_REFRESH_TOKEN,
            });
        }
        recordSessionFail('validate-key', idkps, 'invalid_or_expired');
        return res.json({ valid: false, message: 'Invalid license Key or player without access' });
    } catch (error) {
        console.error("Erro ao buscar licença:", error);
        recordSessionFail('validate-key', req.body?.idkps, 'server_error');
        res.status(500).json({ valid: false, message: 'Server error' });
    }
});

app.post('/validate-license', async (req, res) => {
    const { idkps, license } = req.body;

    try {
        // Verificar se a licença existe com um playerid vazio
        let licenseData = await License.findOne({ licenseKey: license });

        if (licenseData && !licenseData.playerid) {
            await linkLicenseToPlayer(License, licenseData, idkps);
        }

        // Revalida a licença agora com o playerid
        licenseData = await License.findOne({ playerid: idkps, licenseKey: license });

        if (licenseData) {
            const currentDate = new Date();
            if (currentDate <= new Date(licenseData.expireDate)) {
                const session = issueLicenseSession(JWT_SECRET, idkps, licenseData.expireDate);
                recordSessionOk('validate-license', idkps, { trial: !!licenseData.trial });
                return res.json({
                    valid: true,
                    token: session.token,
                    qs: session.qs,
                    expirationDate: GLOBAL_EXPIRATION_DATE,
                    refreshToken: GLOBAL_REFRESH_TOKEN,
                    p: session.p,
                    globalAnnouncement: String(globalAnnouncement)
                });
            } else {
                recordSessionFail('validate-license', idkps, 'expired');
                return res.json({ valid: false, message: 'Expired license Key' });
            }
        } else {
            recordSessionFail('validate-license', idkps, 'invalid');
            return res.json({ valid: false, message: 'Invalid license Key or player without access' });
        }
    } catch (error) {
        console.error('Erro na validação da licença:', error);
        recordSessionFail('validate-license', req.body?.idkps, 'server_error');
        return res.status(500).json({ valid: false, message: 'Server error' });
    }
});

app.post('/v-s', async (req, res) => {
    const { idkps, tk, botVersion, serverId, country, botActive } = req.body;
    if (!idkps || !tk) {
        recordSessionFail('v-s', idkps, 'missing_params');
        return res.json({ ok: false });
    }
    try {
        verifyLicenseSession(JWT_SECRET, tk, idkps);
        const licenseData = await assertLicenseActive(License, idkps);
        if (!licenseData) {
            recordSessionFail('v-s', idkps, 'license_expired');
            return res.json({ ok: false });
        }
        const session = issueLicenseSession(JWT_SECRET, idkps, licenseData.expireDate);
        recordSessionOk('v-s', idkps, {
            botVersion,
            serverId,
            country,
            botActive,
            trial: !!licenseData.trial,
        });
        return res.json({
            ok: true,
            p: session.p,
            token: session.token,
            qs: session.qs,
            globalAnnouncement: String(globalAnnouncement),
        });
    } catch (error) {
        const reason = error.name === 'TokenExpiredError' ? 'jwt_expired' : 'jwt_invalid';
        recordSessionFail('v-s', idkps, reason);
        return res.json({ ok: false });
    }
});

app.post('/get-trial', async (req, res) => {
    const { playerId } = req.body;

    if (!playerId) {
        return res.status(400).json({ success: false, message: 'Player ID is required' });
    }
    try {
        // Procura o playerid no banco de dados
        let licenseData = await License.findOne({ playerid: playerId });

        // Se não encontrar, cria uma nova licença
        if (!licenseData) {
            const newLicenseKey = uuidv4();
            const newExpireDate = new Date();
            newExpireDate.setDate(newExpireDate.getDate() + 1);

            // Cria um novo documento no banco de dados
            licenseData = new License({
                playerid: playerId,
                licenseKey: newLicenseKey,
                expireDate: newExpireDate,
                trial: true,
                email: "",
                country: "",
            });

            await licenseData.save();

            return res.json({ success: true, trialKey: newLicenseKey });
        }

        // Verifica se já usou o trial
        if (licenseData.trial) {
            return res.json({ success: false, message: 'You have already used a trial key' });
        }

        // Verifica se a licença expirou
        const currentDate = new Date();
        if (!licenseData.licenseKey || currentDate > new Date(licenseData.expireDate)) {
            // Gera uma nova licenseKey
            const newLicenseKey = uuidv4();

            // Define a nova data de expiração para um dia a mais
            const newExpireDate = new Date(currentDate);
            newExpireDate.setDate(newExpireDate.getDate() + 1);

            // Atualiza a licença no banco de dados
            licenseData.licenseKey = newLicenseKey;
            licenseData.expireDate = newExpireDate;
            licenseData.trial = true;

            await licenseData.save();

            return res.json({ success: true, trialKey: newLicenseKey });
        } else {
            return res.json({
                success: false,
                message: formatLicenseStillValidMessage(licenseData.licenseKey, licenseData.expireDate)
            });
        }
    } catch (error) {
        console.error('Error handling /get-trial:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.put("/:id", async(req, res) => {
    const license = await License.findByIdAndUpdate(req.params.id, {
        playerid: req.body.idkps,
        licenseKey: req.body.license,
        expireDate: req.body.expirationDate,
    }, {
        new: true
    })
    return res.send(license)
})

app.delete("/:id", async(req, res) => {
    const  license = await License.findByIdAndDelete(req.params.id)
    return res.send(license)
})

const { registerBotProxyRoutes } = require('./bot-proxy');
registerBotProxyRoutes(app, {
    jwtSecret: JWT_SECRET,
    globalToken: GLOBAL_TOKEN,
    License,
    verifyLicenseSession,
    assertLicenseActive,
});

app.listen(port, () => {
    mongoose.connect(process.env.MONGO_URI)
    mongoose.connection.on('error', err => {
        console.error('Erro na conexão com o MongoDB:', err);
    });
    mongoose.connection.on('connected', () => {
        console.log('Conectado ao MongoDB!');
    });

    console.log('app rodando')
})
