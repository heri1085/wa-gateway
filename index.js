const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('SCAN QR CODE INI DENGAN WHATSAPP ANDA:');
    qrcode.generate(qr, { small: true });
});


client.on('ready', async () => {
    console.log('✅ WhatsApp API Siap Digunakan!');

    // Mengambil daftar semua chat/grup secara otomatis
    const chats = await client.getChats();
    console.log('--- DAFTAR GRUP & ID ---');
    chats.forEach(chat => {
        if (chat.isGroup) {
            console.log(`Nama Grup: ${chat.name} | ID: ${chat.id._serialized}`);
        }
    });
    console.log('------------------------');
});
// Fitur untuk cek ID Grup
client.on('message', async msg => {
    if (msg.body === '!cekid') {
        const chat = await msg.getChat();
        msg.reply(`ID obrolan ini adalah:\n*${chat.id._serialized}*`);
        console.log(`Grup: ${chat.name} | ID: ${chat.id._serialized}`);
    }
});

client.initialize();

// Endpoint untuk UptimeRobot
app.get('/', (req, res) => {
    res.send('Server WA Gateway Aktif!');
});

// Endpoint untuk menerima perintah dari Google Sheets
app.post('/send', async (req, res) => {
    const { target, message } = req.body;
    if (!target || !message) return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });

    try {
        const targetList = Array.isArray(target) ? target : [target];
        let options = {};
        
        // Deteksi fitur tag/mention (@628xxxx)
        const mentionMatches = message.match(/@(\d{10,15})/g); 
        if (mentionMatches) {
            options.mentions = mentionMatches.map(match => match.replace('@', '') + '@c.us');
        }

        for (let i = 0; i < targetList.length; i++) {
            await client.sendMessage(targetList[i], message, options);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Jeda 1 detik
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});