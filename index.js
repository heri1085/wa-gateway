// Polyfill crypto untuk kompatibilitas Baileys di Node.js
const crypto = require('crypto');
if (!global.crypto) {
    global.crypto = crypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint sederhana agar web service di Render tetap aktif
app.get('/', (req, res) => {
    res.send('WhatsApp Gateway Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});

// Timer reconnect dengan exponential backoff
let reconnectTimer = null;
let retryDelay = 5000; // mulai dari 5 detik

function scheduleReconnect() {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        console.log(`Mencoba menghubungkan ulang ke WhatsApp (delay ${retryDelay / 1000}s)...`);
        await connectToWhatsApp();
        retryDelay = Math.min(retryDelay * 2, 60000); // maksimum 1 menit
    }, retryDelay);
}

async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' })
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('SCAN QR CODE INI DENGAN WHATSAPP ANDA:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || statusCode;
                console.log(`Koneksi terputus. Status: ${statusCode} (${reason})`);

                if (statusCode !== DisconnectReason.loggedOut) {
                    scheduleReconnect();
                } else {
                    console.log('Perangkat telah logout. Hapus folder auth_info_baileys dan scan ulang QR code.');
                }
            } else if (connection === 'open') {
                console.log('Bot WhatsApp berhasil terhubung dengan sukses! 🎉');
                retryDelay = 5000; // reset delay ke awal
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;

            console.log(`Pesan masuk dari ${sender}: ${messageContent}`);

            if (messageContent && messageContent.toLowerCase() === 'ping') {
                await sock.sendMessage(sender, { text: 'Pong! Bot aktif dan terhubung.' }, { quoted: msg });
            }
        });

        return sock;
    } catch (err) {
        console.error('Error saat mencoba connect:', err);
        scheduleReconnect();
    }
}

// Jalankan fungsi utama
connectToWhatsApp();
