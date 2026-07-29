const crypto = require('crypto');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;
let isReady = false;
let reconnecting = false;

// Helper delay (Poin 5)
const delay = ms => new Promise(r => setTimeout(r, ms));

// --- 11. SISTEM ANTREAN (QUEUE) PENGIRIMAN ---
let messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { target, message, options, resResolve } = messageQueue.shift();
        try {
            await sock.sendMessage(target, { text: message, ...options });
            await delay(300); // Jeda lebih bersih (Poin 5)
            resResolve({ success: true });
        } catch (error) {
            console.error(`Gagal kirim ke ${target}:`, error.message);
            resResolve({ success: false, error: error.message });
        }
    }
    isProcessingQueue = false;
}

function enqueueMessage(target, message, options) {
    return new Promise((resolve) => {
        messageQueue.push({ target, message, options, resResolve: resolve });
        processQueue();
    });
}

// --- 9. LOGGING MEMORI ---
setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`RSS ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
}, 60000);

async function connectToWhatsApp() {
    // 1. Mencegah koneksi ganda
    if (reconnecting) return;
    reconnecting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        sock = makeWASocket({
            auth: state,
            // 12. Jangan pakai logger silent total (ubah ke level error)
            logger: pino({ level: 'error' }),
            printQRInTerminal: false
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('SCAN QR CODE INI DENGAN WHATSAPP ANDA:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                isReady = false; // 2. Set status belum siap
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Koneksi terputus, mencoba menghubungkan kembali...', shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(reconnect, 3000); // 1. Jeda 3 detik untuk reconnect
                }
            } else if (connection === 'open') {
                isReady = true; // 2. Set status benar-benar siap
                console.log('✅ WhatsApp API (Baileys) Siap Digunakan!');

                // 6. Gunakan setTimeout untuk groupFetch agar socket stabil dulu
                setTimeout(async () => {
                    try {
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
                }, 3000);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Fitur pesan masuk & perintah '!cekid'
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const messageBody = m.message.conversation || m.message.extendedTextMessage?.text || '';
            const remoteJid = m.key.remoteJid;

            if (messageBody === '!cekid') {
                const isGroup = remoteJid.endsWith('@g.us');
                if (isGroup) {
                    const metadata = await sock.groupMetadata(remoteJid).catch(() => null);
                    const groupName = metadata ? metadata.subject : 'Grup';
                    
                    await sock.sendMessage(remoteJid, { text: `ID obrolan ini adalah:\n*${remoteJid}*` }, { quoted: m });
                    console.log(`Grup: ${groupName} | ID: ${remoteJid}`);
                }
            }
        });

    } finally {
        reconnecting = false;
    }
}

async function reconnect() {
    await connectToWhatsApp();
}

// Jalankan koneksi awal
connectToWhatsApp();

// Endpoint untuk UptimeRobot
app.get('/', (req, res) => {
    res.send('Server WA Gateway (Baileys) Aktif!');
});

// --- 10. ENDPOINT STATUS ---
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        user: sock?.user?.id || null
    });
});

// Endpoint untuk menerima perintah dari Google Sheets
app.post('/send', async (req, res) => {
    // 2. Cek apakah socket benar-benar sudah siap
    if (!isReady || !sock) {
        return res.status(503).json({
            status: "error",
            message: "WhatsApp belum terkoneksi"
        });
    }

    const { target, message } = req.body;
    if (!target || !message) return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });

    // 7. Validasi target yang lebih aman
    const targetList = (Array.isArray(target) ? target : [target]).filter(Boolean).map(x => String(x).trim());

    // 8. Jangan kirim jika kosong
    if (targetList.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Target kosong' });
    }

    try {
        let options = {};
        
        // 3. Regex mention yang lebih fleksibel
        const mentionMatches = message.match(/@(\d+)/g); 
        if (mentionMatches) {
            options.mentions = mentionMatches.map(match => match.replace('@', '') + '@s.whatsapp.net');
        }

        // 11. Masukkan ke antrean pengiriman (Queue)
        for (let i = 0; i < targetList.length; i++) {
            await enqueueMessage(targetList[i], message, options);
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
