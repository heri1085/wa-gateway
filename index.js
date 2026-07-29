const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;

async function connectToWhatsApp() {
    // Menyimpan sesi auth secara lokal di folder 'auth_info_baileys'
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Mengurangi log berlebih agar konsol bersih
        printQRInTerminal: false // Kita handle QR manual menggunakan qrcode-terminal
    });

    // Handle QR Code & Status Koneksi
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('SCAN QR CODE INI DENGAN WHATSAPP ANDA:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menghubungkan kembali...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp API (Baileys) Siap Digunakan!');

            try {
                // Mengambil daftar semua chat/grup secara otomatis
                const chats = await sock.groupFetchAllParticipating();
                console.log('--- DAFTAR GRUP & ID ---');
                for (const groupId in chats) {
                    const group = chats[groupId];
                    console.log(`Nama Grup: ${group.subject} | ID: ${groupId}`);
                }
                console.log('------------------------');
            } catch (e) {
                console.log('Gagal mengambil daftar grup: ' + e.message);
            }
        }
    });

    // Simpan kredensial saat ada pembaruan sesi
    sock.ev.on('creds.update', saveCreds);

    // Fitur untuk mendeteksi pesan masuk & perintah '!cekid'
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const messageBody = m.message.conversation || m.message.extendedTextMessage?.text || '';
        const remoteJid = m.key.remoteJid;

        if (messageBody === '!cekid') {
            const isGroup = remoteJid.endsWith('@g.us');
            if (isGroup) {
                // Ambil info nama grup jika di dalam grup
                const metadata = await sock.groupMetadata(remoteJid).catch(() => null);
                const groupName = metadata ? metadata.subject : 'Grup';
                
                await sock.sendMessage(remoteJid, { text: `ID obrolan ini adalah:\n*${remoteJid}*` }, { quoted: m });
                console.log(`Grup: ${groupName} | ID: ${remoteJid}`);
            }
        }
    });
}

// Jalankan koneksi WA
connectToWhatsApp();

// Endpoint untuk UptimeRobot
app.get('/', (req, res) => {
    res.send('Server WA Gateway (Baileys) Aktif!');
});

// Endpoint untuk menerima perintah dari Google Sheets
app.post('/send', async (req, res) => {
    const { target, message } = req.body;
    if (!target || !message) return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });

    if (!sock) {
        return res.status(500).json({ status: 'error', message: 'WhatsApp Socket belum siap' });
    }

    try {
        const targetList = Array.isArray(target) ? target : [target];
        let options = {};

        // Deteksi fitur tag/mention (@628xxxx)
        const mentionMatches = message.match(/@(\d{10,15})/g);
        if (mentionMatches) {
            options.mentions = mentionMatches.map(match => match.replace('@', '') + '@s.whatsapp.net');
        }

        for (let i = 0; i < targetList.length; i++) {
            await sock.sendMessage(targetList[i], { text: message, ...options });
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
