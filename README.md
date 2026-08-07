# wa-gateway
# 🚀 WhatsApp Gateway API (Baileys Engine)

**WhatsApp Gateway API** adalah layanan backend yang memungkinkan aplikasi Anda mengirim pesan WhatsApp secara otomatis menggunakan nomor WhatsApp pribadi/bisnis Anda. Dibuat menggunakan [Baileys](https://github.com/WhiskeySockets/Baileys) dan **Express.js**, sistem ini dirancang ringan, stabil, dan siap digunakan langsung atau lewat Docker.

---

## ✨ Fitur Utama

* **Kemudahan Otentikasi QR**: Pindai QR code langsung dari terminal untuk menghubungkan nomor WhatsApp.
* **Pengiriman Pesan Antrean (Queue System)**: Mencegah kegagalan/blokir saat mengirim pesan dalam jumlah banyak secara bersamaan.
* **Mendukung Fitur Mention**: Otomatis mendeteksi tag nomor HP (`@628123xxx`) dalam pesan.
* **Cek ID Obrolan/Grup**: Kirim pesan `!cekid` di dalam grup untuk mendapatkan ID unik grup tersebut secara otomatis.
* **Status Monitoring**: Cek status koneksi aplikasi secara *real-time* via REST API.
* **Siap Pakai dengan Docker**: Mendukung *containerization* via `Dockerfile` untuk deployment cepat.

---

## 🛠️ Persyaratan Sistem

Sebelum memulai, pastikan perangkat Anda memiliki:

* **Node.js**: Versi `20.x` atau yang lebih baru.
* **npm** atau **Docker** (Opsional, jika ingin menjalankan via container).

---

## 💻 Cara Install & Menjalankan

### Metode 1: Menggunakan Node.js (Lokal)

1. **Clone repository ini:**
```bash
git clone https://github.com/username/wa-gateway.git
cd wa-gateway

```


2. **Install dependensi:**
```bash
npm install

```


3. **Jalankan aplikasi:**
```bash
npm start

```


4. **Pindai QR Code:**
* Terminal akan menampilkan QR Code.


* Buka WhatsApp di HP Anda -> **Perangkat Tertaut (Linked Devices)** -> **Tautkan Perangkat (Link a Device)**.
* Pindai QR Code yang muncul di terminal.





---

### Metode 2: Menggunakan Docker

1. **Build Docker Image:**
```bash
docker build -t wa-gateway .

```


2. **Jalankan Container:**
```bash
docker run -p 3000:3000 -v $(pwd)/auth_info_baileys:/usr/src/app/auth_info_baileys --name wa-gateway-app wa-gateway

```


> **Note:** Mounting folder `auth_info_baileys` berguna agar sesi login WhatsApp tetap tersimpan meskipun container di-*restart*.



---

## 🔌 API Documentation (Endpoint)

Aplikasi ini berjalan di `http://localhost:3000` secara *default*.

### 1. Cek Server Active

* **URL:** `GET /`
* **Response:**
```text
Server WA Gateway (Baileys) Aktif!

```



---

### 2. Cek Status Koneksi WhatsApp

Gunakan endpoint ini untuk mengecek apakah WhatsApp sudah terhubung/siap digunakan.

* **URL:** `GET /status`

* **Response Contoh:**
```json
{
  "connected": true,
  "user": "628123456789:1@s.whatsapp.net"
}

```



---

### 3. Kirim Pesan (Send Message)

Gunakan endpoint ini untuk mengirim pesan ke nomor pribadi maupun grup.

* **URL:** `POST /send`

* **Header:** `Content-Type: application/json`
* **Body Request:**
```json
{
  "target": "628123456789@s.whatsapp.net",
  "message": "Halo! Ini pesan otomatis dari WA Gateway."
}

```


* **Mengirim ke Banyak Target Sekaligus (Bulk):**
```json
{
  "target": [
    "628123456789@s.whatsapp.net",
    "12036301234567890@g.us"
  ],
  "message": "Pemberitahuan penting!"
}

```



#### Format Target:

* **Nomor HP / Personal:** `628xxxxxxxxxx@s.whatsapp.net`
* **Grup WhatsApp:** `xxxxxxxxxxxxxxxxxx@g.us` *(Dapatkan ID grup dari logs terminal saat startup atau dengan mengetik `!cekid` di dalam grup)*.



---

## 🤖 Perintah WhatsApp (Bot Command)

Sistem ini dibekali fitur respon perintah otomatis:

| Perintah | Lokasi | Fungsi |
| --- | --- | --- |
| `!cekid` | Dalam Grup / Chat | Membalas pesan berisi ID Unik Obrolan/Grup tersebut.

 |

---

## 📁 Struktur Folder Utama

```text
.
├── auth_info_baileys/    # Menyimpan file sesi login WhatsApp (Otomatis dibuat)
├── index.js              # Kode utama aplikasi & REST API
├── Dockerfile            # Konfigurasi deployment Docker
├── package.json          # Manifest dependensi project
└── README.md             # Dokumentasi proyek

```

---

## 🛡️ Lisensi

Project ini dirilis di bawah lisensi [MIT](https://www.google.com/search?q=LICENSE). Silakan gunakan dan kembangkan sesuai kebutuhan Anda.
