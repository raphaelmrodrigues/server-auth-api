const express = require('express')
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express()
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const port = 4000

const GLOBAL_EXPIRATION_DATE = "2030-11-07T01:39:40.783Z";
const GLOBAL_REFRESH_TOKEN = "ded2cbef-bec7-41db-94d7-27de530912c2";
const GLOBAL_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsaWNlbnNlS2V5IjoiODI1QTcyNTItQUI3OTRDOTgtQkQwQTY2MkQtNTZBOEQxQTQiLCJpYXQiOjE3MzA4NjMwOTYsImV4cCI6MTczMzU0MDk4MH0._OE4kDcTpHcX8s4u9ck0AxDa8zR2Osz2oKjfkz21wqU";

const License = mongoose.model('license', {
    playerid: String,
    licenseKey: String,
    expireDate: Date,
    trial: Boolean,
    email: String,
    country: String,
})

app.get('/', async (req, res) => {

    return res.send("API esta rodando!")
})

app.get('/licenses', async (req, res) => {
    const licenses = await License.find()
    return res.send(licenses)
})

app.post('/teste', async (req, res) => {
    console.log('Dados recebidos do Gumroad:', req.body);
    const data = req.body;
    console.log('JSON recebido:', data);

    res.status(200).send('Webhook received');
});

app.post('/gumroad', async (req, res) => {
    console.log("Dados recebidos:", req.body);

    const { license_key, created_at, variants, email, ip_country } = req.body;


    // Convertendo a data de created_at para um objeto Date
    const createdAtDate = new Date(created_at);
    let expireDate;

    // Definindo a data de expiração com base no variants
    switch (variants) {
        case '(90 days)':
            expireDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 3));
            break;
        case '(60 days)':
            expireDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 2));
            break;
        case '(30 days)':
            expireDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 1));
            break;
        case '(15 days)':
            expireDate = new Date(createdAtDate.setDate(createdAtDate.getDate() + 15));
            break;
        default:
            console.log("Erro: Variant desconhecido");
            return res.status(400).json({ success: false, message: 'Variant desconhecido' });
    }

    // Criando um novo documento de licença
    const newLicense = new License({
        playerid: "",
        licenseKey: license_key,
        expireDate: expireDate,
        trial: false,
        email: email,
        country: ip_country,
    });

    try {
        await newLicense.save();
        console.log('Licença salva com sucesso:', newLicense);
        res.status(200).json({ success: true, message: 'Webhook received and processed' });
    } catch (error) {
        console.error('Erro ao salvar a licença:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar o webhook' });
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

app.post('/validate-key', async (req, res) => {
    const { idkps } = req.body;

    try {
        const licenseData = await License.findOne({ playerid: idkps });

        if (licenseData) {
            const currentDate = new Date();

            // Verifica se a data de expiração é maior que a data atual
            if (currentDate <= new Date(licenseData.expireDate)) {
                return res.json({ valid: true, p: licenseData.expireDate}); // Retorna true se a licença for válida
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
                    // Retornar que a licença vinculada ainda está ativa
                    return res.json({ valid: false, message: `The account still has an active license to use: ${existingLicense.licenseKey}` });
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
                    p: licenseData.expireDate
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
