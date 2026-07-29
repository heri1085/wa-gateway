const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint sederhana agar web service di Render tetap aktif (tidak sleep)
app.get('/', (req, res) => {
    res.send('WhatsApp Gateway Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});

// Timer tunggal untuk mencegah spam reconnect yang memicu error 405
let reconnectTimer = null;

function scheduleReconnect() {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        console.log('Mencoba menghubungkan ulang ke WhatsApp...');
        await connectToWhatsApp();
    }, 5000); // Jeda 5 detik
}

async function connectToWhatsApp() {
    // Menggunakan folder penyimpanan sesi lokal (auth_info_baileys)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) // Ubah ke 'info' jika ingin melihat log detail Baileys
    });

    // Simpan kredensial setiap ada pembaruan sesi
    sock.ev.on('creds.update', saveCreds);

    // Pantau pembaruan koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Jika ada QR Code baru yang dihasilkan
        if (qr) {
            console.log('Scan QR Code di bawah ini:');
            qrcode.generate(qr, { small: true });
        }

        // Jika koneksi terputus
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`Koneksi terputus. Alasan / Status:`, lastDisconnect?.error);

            // Cek apakah bukan karena logout manual
            if (statusCode !== DisconnectReason.loggedOut) {
                scheduleReconnect();
            } else {
                console.log('Perangkat telah logout. Hapus folder auth_info_baileys dan scan ulang QR code.');
            }
        } 
        // Jika koneksi berhasil terhubung
        else if (connection === 'open') {
            console.log('Bot WhatsApp berhasil terhubung dengan sukses! 🎉');
            
            // Bersihkan timer reconnect jika sudah terhubung normal
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        }
    });

    // Contoh mendengarkan pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;

        console.log(`Pesan masuk dari ${sender}: ${messageContent}`);

        // Contoh balasan otomatis sederhana
        if (messageContent && messageContent.toLowerCase() === 'ping') {
            await sock.sendMessage(sender, { text: 'Pong! Bot aktif dan terhubung.' }, { quoted: msg });
        }
    });

    return sock;
}

// Jalankan fungsi utama
connectToWhatsApp();
