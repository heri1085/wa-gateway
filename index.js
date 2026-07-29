// --- Polyfill Global Crypto (Diperbarui) ---
const { webcrypto } = require("crypto");
globalThis.crypto = webcrypto;
// -------------------------------------------

const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock;
let isReady = false;
let reconnecting = false;

// Helper delay
const delay = ms => new Promise(r => setTimeout(r, ms));

// --- SISTEM ANTREAN (QUEUE) PENGIRIMAN ---
let messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { target, message, options, resResolve } = messageQueue.shift();
        try {
            await sock.sendMessage(target, { text: message, ...options });
            await delay(300);
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

// --- LOGGING MEMORI ---
setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`RSS ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
}, 60000);

async function connectToWhatsApp() {
    if (reconnecting) return;
    reconnecting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        sock = makeWASocket({
            auth: state,
            // --- Logger diubah ke debug ---
            logger: pino({
                level: "debug"
            }),
            printQRInTerminal: false
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('SCAN QR CODE INI DENGAN WHATSAPP ANDA:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                isReady = false;
                
                // --- Tambahkan console.dir untuk melihat detail disconnect ---
                console.log('Detail Disconnect:');
                console.dir(lastDisconnect, {
                    depth: null
                });

                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Koneksi terputus, mencoba menghubungkan kembali...', shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(reconnect, 3000);
                }
            } else if (connection === 'open') {
                isReady = true;
                console.log('✅ WhatsApp API (Baileys) Siap Digunakan!');

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

connectToWhatsApp();

app.get('/', (req, res) => {
    res.send('Server WA Gateway (Baileys) Aktif!');
});

app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        user: sock?.user?.id || null
    });
});

app.post('/send', async (req, res) => {
    if (!isReady || !sock) {
        return res.status(503).json({
            status: "error",
            message: "WhatsApp belum terkoneksi"
        });
    }

    const { target, message } = req.body;
    if (!target || !message) return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });

    const targetList = (Array.isArray(target) ? target : [target]).filter(Boolean).map(x => String(x).trim());

    if (targetList.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Target kosong' });
    }

    try {
        let options = {};
        const mentionMatches = message.match(/@(\d+)/g); 
        if (mentionMatches) {
            options.mentions = mentionMatches.map(match => match.replace('@', '') + '@s.whatsapp.net');
        }

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
