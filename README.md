# 🤖 Asisten MI

### Chatbot pembelajaran Pemrograman API untuk mahasiswa Prodi D-III Manajemen Informatika — Politeknik Negeri Lampung

Asisten MI adalah aplikasi chatbot berbasis web yang membantu mahasiswa mempelajari konsep dan praktik Pemrograman API. Aplikasi menyediakan akun pengguna, percakapan yang tersimpan secara lokal, serta dashboard admin untuk memantau dan mengelola akun.

> 🎓 **Konteks proyek:** dikembangkan untuk mendukung praktikum Pemrograman API.  
> 🗣️ **Bahasa:** antarmuka dan arahan chatbot menggunakan bahasa Indonesia.  
> 🖥️ **Mode operasi:** server lokal pada komputer pengguna.

## ✨ Fitur

### 💬 Asisten belajar

- Mengirim pertanyaan ke model AI melalui layanan OmniRoute.
- Meneruskan konteks percakapan terbaru agar jawaban tetap relevan.
- Menampilkan teks, daftar, penebalan, dan blok kode pada jawaban.
- Menghentikan permintaan yang sedang berjalan atau mengirim pesan baru untuk menginterupsinya.
- Membatasi panjang pertanyaan hingga 1.000 karakter dan laju chat hingga 10 pertanyaan per menit per akun.

### 🗂️ Riwayat percakapan

- Membuat, mencari, membuka, memberi nama, menyematkan, dan menghapus percakapan.
- Menyimpan riwayat di database SQLite lokal dan memisahkannya berdasarkan akun.
- Menampilkan hingga 100 percakapan terbaru pada daftar riwayat.

### 👤 Akun dan administrasi

- Pendaftaran dan masuk menggunakan nama pengguna serta kata sandi.
- Nama pengguna: 3–30 karakter, hanya huruf kecil, angka, dan garis bawah.
- Kata sandi akun baru: minimal 8 karakter.
- Dashboard admin menampilkan jumlah pengguna, status akun, waktu masuk terakhir, dan jumlah pertanyaan.
- Admin dapat mencari pengguna dan mengaktifkan atau menonaktifkan akun.
- Akun yang dinonaktifkan langsung ditolak pada permintaan berikutnya.

### 🎨 Antarmuka

- Tata letak responsif untuk desktop dan layar kecil.
- Mengikuti preferensi tema terang atau gelap dari perangkat.
- Sesi masuk disimpan pada sesi tab browser, bukan sebagai sesi permanen.

## 🧰 Teknologi

| Bagian | Teknologi |
|---|---|
| Server | Node.js, modul HTTP bawaan |
| Database | SQLite melalui `node:sqlite` |
| Antarmuka | HTML, CSS, dan JavaScript |
| Layanan AI | OmniRoute Chat Completions API |
| Model | `bansos.v1.prodi.mi` |

Proyek tidak memerlukan instalasi paket npm. Server menggunakan modul bawaan Node.js dan menyimpan data pada `chatbot.db`.

## ✅ Persyaratan

- **Node.js 22.5 atau lebih baru** dengan dukungan modul `node:sqlite`.
- **API key OmniRoute** yang valid dan memiliki akses ke model proyek.
- Koneksi internet untuk menghubungi layanan AI.
- Port lokal **3100** tersedia.

Periksa versi Node.js:

```powershell
node --version
```

## 🚀 Menjalankan aplikasi

Buka PowerShell, pindah ke folder proyek, atur API key pada sesi terminal, lalu jalankan server:

```powershell
Set-Location "C:\Users\User\chatbotai"
$env:OMNIROUTE_API_KEY = "<API_KEY_OMNIROUTE_ANDA>"
node .\server.mjs
```

Ganti placeholder dengan API key Anda sendiri. Jangan memasukkan key sungguhan ke README, kode sumber, atau repositori.

Jika server berhasil dijalankan, buka alamat berikut di browser:

```text
http://127.0.0.1:3100/
```

Untuk menghentikan server, tekan **Ctrl+C** pada jendela PowerShell yang menjalankannya. Variabel `$env:OMNIROUTE_API_KEY` di atas hanya berlaku pada sesi PowerShell tersebut.

### 🔐 Masuk dan membuat akun

1. Pada halaman Asisten MI, pilih **Daftar** untuk membuat akun pengguna baru.
2. Masuk dengan nama pengguna dan kata sandi akun tersebut.
3. Admin awal dibuat saat database pertama kali diinisialisasi. Aplikasi belum menyediakan fitur untuk mengubah kata sandi; amankan atau rotasi kredensial awal melalui administrasi server/database sebelum aplikasi dipakai bersama.
4. Setelah masuk sebagai admin, buka **Dashboard** untuk melihat dan mengelola akun.

> ⚠️ Jangan membagikan kredensial admin atau API key. Jangan gunakan kredensial awal untuk penerapan yang dapat diakses orang lain.

## 🧭 Alur aplikasi

1. 🌐 Browser membuka halaman yang disajikan oleh server lokal.
2. 🔑 Pengguna mendaftar atau masuk; server memverifikasi akun dan menerbitkan token sesi.
3. 💾 Pesan dan riwayat percakapan disimpan di SQLite lokal.
4. 🔒 Server memvalidasi sesi dan kepemilikan percakapan sebelum memproses permintaan.
5. ☁️ Server mengirim konteks percakapan ke OmniRoute dan meneruskan jawaban AI ke browser.

API key hanya digunakan oleh server untuk komunikasi dengan layanan AI; API key tidak perlu dimasukkan ke antarmuka browser.

## 🔌 Endpoint API

Semua endpoint berada pada host lokal `127.0.0.1:3100`. Endpoint bertanda **🔐** memerlukan token Bearer. Endpoint admin juga memerlukan peran admin.

| Metode | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/` | Publik | Menyajikan aplikasi web |
| `POST` | `/api/daftar` | Publik | Membuat akun pengguna |
| `POST` | `/api/masuk` | Publik | Masuk dan memperoleh token |
| `GET` | `/api/saya` | 🔐 Pengguna | Memeriksa identitas dan peran akun |
| `GET` | `/api/percakapan` | 🔐 Pengguna | Mengambil daftar percakapan |
| `POST` | `/api/percakapan` | 🔐 Pengguna | Membuat percakapan baru |
| `GET` | `/api/percakapan/{id}` | 🔐 Pemilik percakapan | Membuka pesan pada percakapan |
| `POST` | `/api/percakapan/{id}/pin` | 🔐 Pemilik percakapan | Menyematkan atau melepas sematan |
| `POST` | `/api/percakapan/{id}/rename` | 🔐 Pemilik percakapan | Mengubah judul percakapan |
| `DELETE` | `/api/percakapan/{id}` | 🔐 Pemilik percakapan | Menghapus percakapan dan pesannya |
| `GET` | `/api/riwayat` | 🔐 Pengguna | Mengambil riwayat percakapan terbaru |
| `POST` | `/api/chat` | 🔐 Pengguna | Mengirim pertanyaan ke asisten AI |
| `GET` | `/api/admin/pengguna` | 🔐 Admin | Melihat daftar akun dan statistik |
| `POST` | `/api/admin/pengguna/{id}/aktif` | 🔐 Admin | Mengaktifkan atau menonaktifkan akun |

Permintaan yang mengirim JSON menggunakan `Content-Type: application/json`. Untuk endpoint terproteksi, kirim token masuk dengan header:

```text
Authorization: Bearer <TOKEN_SESI>
```

## 📁 Struktur berkas

```text
.
├── README.md          # Dokumentasi proyek
├── server.mjs         # Server HTTP, endpoint API, autentikasi, dan akses AI
├── website.html       # Antarmuka aplikasi
└── chatbot.db         # Database SQLite lokal; dibuat atau diperbarui saat server berjalan
```

> 📝 Berkas database berisi data akun dan percakapan lokal. Jangan mengunggahnya ke repositori publik atau membagikannya tanpa memastikan data telah diamankan.

## 🛡️ Keamanan dan privasi

- Server hanya mendengarkan pada `127.0.0.1`, bukan semua antarmuka jaringan.
- Permintaan dari asal yang tidak diizinkan ditolak.
- Kata sandi disimpan sebagai hash berbasis `scrypt` dengan salt per akun.
- Token sesi bertanda tangan dan berlaku selama 15 menit.
- Setelah lima percobaan masuk yang gagal, percobaan berikutnya dibatasi sementara.
- Akses percakapan dibatasi berdasarkan pemilik akun.
- Pesan dikirim ke penyedia AI eksternal saat pengguna meminta jawaban; hindari mengirim data pribadi atau rahasia.
- API key disediakan melalui variabel lingkungan `OMNIROUTE_API_KEY`, bukan ditulis ke README.
- Kredensial admin awal harus diamankan atau dirotasi melalui administrasi server/database sebelum aplikasi digunakan bersama. Aplikasi belum menyediakan fitur ubah kata sandi. Jangan simpan API key, kata sandi, atau data pengguna di README atau repositori publik.

## 🧯 Pemecahan masalah

| Gejala | Kemungkinan penyebab | Tindakan |
|---|---|---|
| Server meminta `OMNIROUTE_API_KEY` | Variabel lingkungan belum diatur pada terminal aktif | Atur variabel tersebut di PowerShell yang sama, lalu jalankan ulang server |
| Browser tidak dapat membuka aplikasi | Server belum berjalan atau port 3100 tidak tersedia | Pastikan server aktif dan port lokal tersedia |
| Permintaan AI gagal | Koneksi internet, API key, batas layanan, atau layanan OmniRoute bermasalah | Periksa koneksi dan akses API key; coba kembali setelah beberapa saat |
| Token tidak valid atau kedaluwarsa | Sesi berakhir atau server dimulai ulang | Masuk kembali melalui halaman aplikasi |
| Pendaftaran ditolak | Nama pengguna atau kata sandi tidak memenuhi ketentuan | Periksa format nama pengguna dan panjang kata sandi |

## 🧑‍💻 Pengembangan

Tidak ada skrip build atau paket npm yang diperlukan. Perubahan antarmuka dapat dilakukan pada `website.html`, sedangkan server, validasi, dan endpoint API berada di `server.mjs`.

Sebelum membagikan atau menerbitkan proyek:

1. 🔄 Tinjau dan amankan mekanisme kredensial admin awal; rotasi kredensial melalui administrasi server/database.
2. 🔑 Pastikan API key disediakan melalui lingkungan lokal yang aman.
3. 🗃️ Jangan sertakan database lokal atau berkas yang berisi kredensial/data pribadi.
4. 🧪 Jalankan server secara lokal dan uji alur daftar, masuk, chat, serta dashboard admin.

---

📚 **Asisten MI** — teman belajar Pemrograman API untuk mahasiswa Manajemen Informatika Polinela.
