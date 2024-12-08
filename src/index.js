require('dotenv').config();

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
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.static('src'));
const port = 4000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single('attachment');


const GLOBAL_EXPIRATION_DATE = process.env.GLOBAL_EXPIRATION_DATE;
const GLOBAL_REFRESH_TOKEN = process.env.GLOBAL_REFRESH_TOKEN;
const GLOBAL_TOKEN = process.env.GLOBAL_TOKEN;
const YOUR_DOMAIN = process.env.YOUR_DOMAIN;
const endpointSecret = process.env.ENDPOINT_SECRET;
var globalAnnouncement = '';


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
    resetToken: String,
    resetTokenExpiration: Date,
})


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

app.get('/', async (req, res) => {
    return res.sendFile(path.join(__dirname, 'welcome.html'));
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

app.post('/announcement', async (req, res) => {
    const { announcement } = req.body;

    if (!announcement || typeof announcement !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid announcement string' });
    }

    globalAnnouncement = announcement;

    return res.status(200).json({ success: true, message: 'Announcement saved successfully' });
});


app.get('/announcement', (req, res) => {
    return res.status(200).json({ success: true, announcement: globalAnnouncement });
});


app.post('/sendMail', async (req, res) => {
    const { customerName, itemDescription, licenseKey, expirationDate, email } = req.body;
    console.log('Received Parameters:', { customerName, itemDescription, licenseKey, expirationDate, email });

    const enviarEmail = async (name, description, license, dateExpire, recipientEmail) => {
        const imagePath = path.join(__dirname, 'images/gldicon.png');
        const imageData = fs.readFileSync(imagePath).toString('base64');

        function formatDate(date) {
            const options = {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            };
            return new Intl.DateTimeFormat('pt-BR', options).format(date);
        }

        const Data = new Date(dateExpire);
        const formattedDate = formatDate(Data);

        const msg = {
            to: recipientEmail,
            from: 'gldbotsuport@gmail.com',
            subject: 'Detalhes da sua compra - GLDbot',
            text: 'GLDbot',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; color: #333;">
                    <div style="text-align: center;">
                        <img src="cid:gldicon" alt="GLDbot" style="width: 100px; margin-bottom: 20px;">
                        <h2 style="color: #4CAF50;">Compra Realizada com Sucesso!</h2>
                    </div>
                    <p>Olá <strong>${name}</strong>,</p>
                    <p>Agradecemos por sua compra! Abaixo estão os detalhes da sua licença:</p>
                    <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); margin-bottom: 20px;">
                        <ul style="list-style-type: none; padding: 0;">
                            <li><strong>Plano:</strong> ${description}</li>
                            <li><strong>Data de Expiração:</strong> ${formattedDate}</li>
                            <li><strong>Observação:</strong> Chave válida para uma única conta!</li>
                            <li><strong>Chave da Licença:</strong> ${license}</li>
                        </ul>
                    </div>
                    <p style="font-size: 0.9em; color: #555;">Por favor, guarde esta chave em segurança.</p>
                    <p>Atenciosamente,<br>Equipe GLDbot</p>
                    <footer style="text-align: center; margin-top: 20px; font-size: 0.8em; color: #999;">
                        <p>&copy; ${new Date().getFullYear()} GLDbot. Todos os direitos reservados.</p>
                    </footer>
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

        try {
            await sgMail.send(msg);
            console.log('E-mail enviado com sucesso');
        } catch (error) {
            console.error('Erro ao enviar e-mail:', error);
            if (error.response) {
                console.error(error.response.body);
            }
        }
    };

    // Chama a função de envio de e-mail
    await enviarEmail(customerName, itemDescription, licenseKey, expirationDate, email);
    res.send({ message: 'E-mail enviado com sucesso!' });
});

app.post('/country', (req, res) => {
    const { country } = req.body;

    if (country === 'br') {
        res.json({ redirectTo: 'checkout' });
    } else {
        res.json({ redirectTo: 'gumroad' });
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

        return res.status(200).json({ success: true, q: existingUser.messages, message: 'Login successful' });
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
        const newMessageCount = userRecord.messages + licenseRecord.messages;

        // Atualiza o registro do usuário com o novo valor de mensagens
        userRecord.messages = newMessageCount;
        await userRecord.save();

        // Marca a licença como "used"
        licenseRecord.valid = 'used';
        await licenseRecord.save();

        // Retorna o novo valor de mensagens
        return res.status(200).json({ success: true, message: 'License key applied successfully', newMessageCount });
    } catch (error) {
        console.error('Error in /ps route:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



app.post('/validate-key', async (req, res) => {
    const { idkps } = req.body;

    try {
        const licenseData = await License.findOne({ playerid: idkps });

        if (licenseData) {
            const currentDate = new Date();

            // Verifica se a data de expiração é maior que a data atual
            if (currentDate <= new Date(licenseData.expireDate)) {
                return res.json({ valid: true, p: licenseData.expireDate, globalAnnouncement: String(globalAnnouncement)}); // Retorna true se a licença for válida
            } else {
                return res.json({ valid: false, message: 'Expired license Key' }); // Retorna false se a licença expirou
            }
        } else {
            return res.json({ valid: false, message: 'Invalid license Key or player without access' });
        }
    } catch (error) {
        console.error("Erro ao buscar licença:", error);
        res.status(500).json({ valid: false, message: 'Server error' });
    }
});

app.post('/validate-license', async (req, res) => {
    const { idkps, license } = req.body;

    try {
        // Verificar se a licença existe com um playerid vazio
        let licenseData = await License.findOne({ licenseKey: license });

        if (licenseData && !licenseData.playerid) {
            // Verificar se o playerid já existe no banco de dados
            const existingLicense = await License.findOne({ playerid: idkps });

            if (existingLicense) {
                const currentDate = new Date();
                if (currentDate > new Date(existingLicense.expireDate)) {
                    // Salvar a informação de trial
                    const trialStatus = existingLicense.trial;

                    // Deletar o registro atual
                    await License.deleteOne({ _id: existingLicense._id });

                    // Atualizar a licença para vincular ao playerid recebido
                    licenseData.playerid = idkps;
                    licenseData.trial = trialStatus;
                    await licenseData.save();
                } else {
                    // Salvar a informação de trial
                    const trialStatus = existingLicense.trial;

                    // Deletar o registro atual
                    await License.deleteOne({ _id: existingLicense._id });

                    // Atualizar a licença para vincular ao playerid recebido
                    licenseData.playerid = idkps;
                    licenseData.trial = trialStatus;
                    await licenseData.save();
                    // Retornar que a licença vinculada ainda está ativa
                    // return res.json({ valid: false, message: `The account still has an active license to use: ${existingLicense.licenseKey}` });
                }
            } else {
                // Atualiza a licença para vincular ao playerid recebido
                licenseData.playerid = idkps;
                await licenseData.save();
            }
        }

        // Revalida a licença agora com o playerid
        licenseData = await License.findOne({ playerid: idkps, licenseKey: license });

        if (licenseData) {
            const currentDate = new Date();
            if (currentDate <= new Date(licenseData.expireDate)) {
                return res.json({
                    valid: true,
                    token: GLOBAL_TOKEN,
                    expirationDate: GLOBAL_EXPIRATION_DATE,
                    refreshToken: GLOBAL_REFRESH_TOKEN,
                    p: licenseData.expireDate,
                    globalAnnouncement: String(globalAnnouncement)
                });
            } else {
                return res.json({ valid: false, message: 'Expired license Key' });
            }
        } else {
            return res.json({ valid: false, message: 'Invalid license Key or player without access' });
        }
    } catch (error) {
        console.error('Erro na validação da licença:', error);
        return res.status(500).json({ valid: false, message: 'Server error' });
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
            return res.json({ success: false, message: 'License is still valid' });
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

app.listen(port, () => {
    mongoose.connect('mongodb+srv://raphaelmarquesr:fgJJOroDLWXZGgzh@server-auth-api.lzk3i.mongodb.net/?retryWrites=true&w=majority&appName=server-auth-api')
    mongoose.connection.on('error', err => {
        console.error('Erro na conexão com o MongoDB:', err);
    });
    mongoose.connection.on('connected', () => {
        console.log('Conectado ao MongoDB!');
    });

    console.log('app rodando')
})
