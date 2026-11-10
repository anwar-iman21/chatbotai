// Chatbot Prodi MI: backend lokal (Node.js 22.5+ tanpa paket npm, data di SQLite).
// Jalankan di PowerShell, di folder ini:
//   $env:OMNIROUTE_API_KEY = "key_praktikum"
//   node server.mjs        -> buka http://127.0.0.1:3100/
// Akun admin awal: admin / Admin-2026!  (ganti setelah masuk bila perlu)
import { createServer } from 'node:http';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const API = 'https://omni.ib-center.com', MODEL = 'bansos.v1.prodi.mi', PORT = 3100;
const KEY = process.env.OMNIROUTE_API_KEY;
if (!KEY) { console.error('Atur OMNIROUTE_API_KEY terlebih dahulu.'); process.exit(1); }
const SECRET = randomBytes(32), TTL = 15 * 60_000, MAX_FAIL = 5, LOCK = 60_000, CHAT_PER_MENIT = 10;

const db = new DatabaseSync(fileURLToPath(new URL('./chatbot.db', import.meta.url)));
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, nama TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, hash BLOB NOT NULL,
  peran TEXT NOT NULL DEFAULT 'pengguna', aktif INTEGER NOT NULL DEFAULT 1, dibuat TEXT DEFAULT CURRENT_TIMESTAMP, terakhir_masuk TEXT);
 CREATE TABLE IF NOT EXISTS percakapan(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, judul TEXT NOT NULL DEFAULT 'Percakapan baru',
  dibuat TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, diperbarui TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS pesan(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, peran TEXT NOT NULL, isi TEXT NOT NULL, waktu TEXT DEFAULT CURRENT_TIMESTAMP);`);
const kolomPesan = db.prepare('PRAGMA table_info(pesan)').all().map((x) => x.name);
if (!kolomPesan.includes('percakapan_id')) db.exec('ALTER TABLE pesan ADD COLUMN percakapan_id INTEGER');
const kolomPercakapan = db.prepare('PRAGMA table_info(percakapan)').all().map((x) => x.name);
if (!kolomPercakapan.includes('dipin')) db.exec('ALTER TABLE percakapan ADD COLUMN dipin INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE INDEX IF NOT EXISTS idx_percakapan_user_updated ON percakapan(user_id, diperbarui DESC); CREATE INDEX IF NOT EXISTS idx_pesan_percakapan ON pesan(percakapan_id, id);');
const pesanLama = db.prepare('SELECT DISTINCT user_id FROM pesan WHERE percakapan_id IS NULL').all();
if (pesanLama.length) {
  db.exec('BEGIN');
  try {
    const pertama = db.prepare("SELECT isi FROM pesan WHERE user_id=? AND percakapan_id IS NULL AND peran='user' ORDER BY id LIMIT 1");
    const buatPercakapanLama = db.prepare("INSERT INTO percakapan(user_id,judul) VALUES(?,?)");
    const pindahPesan = db.prepare('UPDATE pesan SET percakapan_id=? WHERE user_id=? AND percakapan_id IS NULL');
    for (const { user_id } of pesanLama) {
      const judul = pertama.get(user_id)?.isi.trim().replace(/\s+/g, ' ').slice(0, 60) || 'Percakapan lama';
      const result = buatPercakapanLama.run(user_id, judul);
      pindahPesan.run(result.lastInsertRowid, user_id);
      db.prepare("UPDATE percakapan SET diperbarui=COALESCE((SELECT MAX(waktu) FROM pesan WHERE percakapan_id=?), diperbarui) WHERE id=?")
        .run(result.lastInsertRowid, result.lastInsertRowid);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
const hash = (p, s) => scryptSync(p, s, 64);
const buat = (nama, sandi, peran) => { const salt = randomBytes(16); db.prepare('INSERT INTO users(nama,salt,hash,peran) VALUES(?,?,?,?)').run(nama, salt, hash(sandi, salt), peran); };
if (!db.prepare("SELECT 1 FROM users WHERE peran='admin'").get()) buat('admin', 'Admin-2026!', 'admin');
const dummySalt = randomBytes(16), dummyHash = hash('tidak-dipakai', dummySalt);

const send = (res, s, p, h = {}) => { res.writeHead(s, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(p)); };
const fail = (res, s, code, message, h) => send(res, s, { error: { code, message } }, h);
const b64 = (v) => Buffer.from(v).toString('base64url');
const sign = (body) => createHmac('sha256', SECRET).update(body).digest('base64url');
const issue = (claims) => { const body = b64(JSON.stringify(claims)); return `${body}.${sign(body)}`; };
function verify(token) {
  const [body, sig, extra] = String(token).split('.');
  if (!body || !sig || extra !== undefined) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { const c = JSON.parse(Buffer.from(body, 'base64url').toString()); return c.exp > Date.now() ? c : 'exp'; } catch { return null; }
}
async function readJson(req) {
  let s = ''; for await (const c of req) { s += c; if (s.length > 4096) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

// Penjaga: 401 = identitas belum terbukti, 403 = dikenali tetapi tidak berhak atau akun nonaktif.
// Status akun dibaca dari database pada SETIAP request, sehingga penonaktifan berlaku seketika walau token belum kedaluwarsa.
function guard(req, res, peran) {
  const h = req.headers.authorization;
  if (!h) { fail(res, 401, 'TOKEN_KOSONG', 'Kirim header Authorization: Bearer <token>.', { 'WWW-Authenticate': 'Bearer' }); return null; }
  const m = /^Bearer (\S+)$/.exec(h);
  if (!m) { fail(res, 401, 'FORMAT_SALAH', 'Format header harus: Authorization: Bearer <token>.', { 'WWW-Authenticate': 'Bearer' }); return null; }
  const c = verify(m[1]);
  if (c === 'exp') { fail(res, 401, 'TOKEN_KEDALUWARSA', 'Token kedaluwarsa. Masuk lagi.', { 'WWW-Authenticate': 'Bearer' }); return null; }
  if (!c) { fail(res, 401, 'TOKEN_TIDAK_VALID', 'Token tidak valid.', { 'WWW-Authenticate': 'Bearer' }); return null; }
  const u = db.prepare('SELECT id,nama,peran,aktif FROM users WHERE id=?').get(c.sub);
  if (!u) { fail(res, 401, 'TOKEN_TIDAK_VALID', 'Token tidak valid.'); return null; }
  if (!u.aktif) { fail(res, 403, 'AKUN_NONAKTIF', 'Akun Anda dinonaktifkan oleh admin.'); return null; }
  if (peran && u.peran !== peran) { fail(res, 403, 'HAK_TIDAK_CUKUP', `Peran ${u.peran} tidak boleh mengakses fitur ini.`); return null; }
  return u;
}

const persona = () => [
  'Anda adalah Asisten MI, chatbot ramah milik mahasiswa Program Studi D-III Manajemen Informatika Politeknik Negeri Lampung, dibuat untuk membantu belajar Pemrograman API.',
  'Jawab dalam bahasa Indonesia yang formal, singkat, dan jelas. Bila tidak yakin, katakan terus terang dan sarankan memeriksa sumber resmi.',
  `Tanggal hari ini: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' })}.`,
].join('\n');

const gagalMasuk = new Map(), jejakChat = new Map();

createServer(async (req, res) => {
  try {
    const port = req.socket.localPort, origin = `http://127.0.0.1:${port}`;
    if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site')
      return fail(res, 403, 'ASAL_DITOLAK', 'Hanya halaman lokal yang diizinkan.');
    const { method, url } = req;
    if (method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'" });
      return res.end(await readFile(new URL('./website.html', import.meta.url)));
    }
    if (method === 'POST' && (url === '/api/daftar' || url === '/api/masuk')) {
      if (!req.headers['content-type']?.startsWith('application/json')) return fail(res, 415, 'TIPE_KONTEN', 'Gunakan Content-Type application/json.');
      const { nama, sandi } = (await readJson(req)) ?? {};
      if (typeof nama !== 'string' || typeof sandi !== 'string' || !nama || !sandi || nama.length > 30 || sandi.length > 100) return fail(res, 422, 'DATA_TIDAK_VALID', 'Isi nama dan sandi (teks, tidak kosong).');
      const key = nama.trim().toLowerCase();
      if (url === '/api/daftar') {
        if (!/^[a-z0-9_]{3,30}$/.test(key)) return fail(res, 422, 'NAMA_TIDAK_VALID', 'Nama 3–30 karakter: huruf kecil, angka, atau garis bawah.');
        if (sandi.length < 8) return fail(res, 422, 'SANDI_PENDEK', 'Kata sandi minimal 8 karakter.');
        if (db.prepare('SELECT 1 FROM users WHERE nama=?').get(key)) return fail(res, 409, 'NAMA_TERPAKAI', 'Nama sudah dipakai.');
        buat(key, sandi, 'pengguna');
        return send(res, 201, { pesan: 'Akun dibuat. Silakan masuk.' });
      }
      const st = gagalMasuk.get(key);
      if (st && st.until > Date.now()) return fail(res, 429, 'AKUN_TERKUNCI', 'Terlalu banyak percobaan gagal. Coba lagi sebentar lagi.', { 'Retry-After': String(Math.ceil((st.until - Date.now()) / 1000)) });
      const u = db.prepare('SELECT * FROM users WHERE nama=?').get(key);
      const ok = timingSafeEqual(hash(sandi, u ? Buffer.from(u.salt) : dummySalt), u ? Buffer.from(u.hash) : dummyHash);
      if (!u || !ok) {
        const n = (st?.count ?? 0) + 1; gagalMasuk.set(key, { count: n, until: n >= MAX_FAIL ? Date.now() + LOCK : 0 });
        return fail(res, 401, 'KREDENSIAL_SALAH', 'Nama atau kata sandi salah.');
      }
      gagalMasuk.delete(key);
      if (!u.aktif) return fail(res, 403, 'AKUN_NONAKTIF', 'Akun Anda dinonaktifkan oleh admin.');
      db.prepare("UPDATE users SET terakhir_masuk=datetime('now','localtime') WHERE id=?").run(u.id);
      return send(res, 200, { token: issue({ sub: u.id, exp: Date.now() + TTL }), tipe: 'Bearer', berlaku_detik: TTL / 1000, nama: u.nama, peran: u.peran });
    }
    if (method === 'GET' && url === '/api/saya') { const u = guard(req, res); return u && send(res, 200, u); }
    if (method === 'GET' && url === '/api/percakapan') {
      const u = guard(req, res); if (!u) return;
      return send(res, 200, { percakapan: db.prepare(`SELECT c.id,c.judul,c.diperbarui,c.dipin,COUNT(p.id) AS jumlah_pesan
        FROM percakapan c JOIN pesan p ON p.percakapan_id=c.id WHERE c.user_id=?
        GROUP BY c.id ORDER BY c.dipin DESC,c.diperbarui DESC,c.id DESC LIMIT 100`).all(u.id) });
    }
    if (method === 'GET' && url === '/api/riwayat') {
      const u = guard(req, res); if (!u) return;
      const latest = db.prepare('SELECT id FROM percakapan WHERE user_id=? ORDER BY diperbarui DESC,id DESC LIMIT 1').get(u.id);
      return send(res, 200, { pesan: latest ? db.prepare('SELECT peran,isi FROM pesan WHERE percakapan_id=? ORDER BY id DESC LIMIT 50').all(latest.id).reverse() : [] });
    }
    if (method === 'POST' && url === '/api/percakapan') {
      const u = guard(req, res); if (!u) return;
      const result = db.prepare('INSERT INTO percakapan(user_id) VALUES(?)').run(u.id);
      return send(res, 201, { id: Number(result.lastInsertRowid), judul: 'Percakapan baru' });
    }
    const percakapanMatch = /^\/api\/percakapan\/(\d+)$/.exec(url);
    if (method === 'GET' && percakapanMatch) {
      const u = guard(req, res); if (!u) return;
      const id = Number(percakapanMatch[1]);
      const c = db.prepare('SELECT id,judul FROM percakapan WHERE id=? AND user_id=?').get(id, u.id);
      if (!c) return fail(res, 404, 'PERCAKAPAN_TIDAK_ADA', 'Percakapan tidak ditemukan.');
      return send(res, 200, { percakapan: c, pesan: db.prepare('SELECT peran,isi,waktu FROM pesan WHERE percakapan_id=? ORDER BY id').all(id) });
    }
    const aksiPercakapan = /^\/api\/percakapan\/(\d+)\/(pin|rename)$/.exec(url);
    if (method === 'POST' && aksiPercakapan) {
      const u = guard(req, res); if (!u) return;
      const id = Number(aksiPercakapan[1]), aksi = aksiPercakapan[2];
      const c = db.prepare('SELECT id FROM percakapan WHERE id=? AND user_id=?').get(id, u.id);
      if (!c) return fail(res, 404, 'PERCAKAPAN_TIDAK_ADA', 'Percakapan tidak ditemukan.');
      const body = await readJson(req) ?? {};
      if (aksi === 'pin') {
        if (typeof body.dipin !== 'boolean') return fail(res, 422, 'DATA_TIDAK_VALID', 'Status pin harus berupa true atau false.');
        db.prepare('UPDATE percakapan SET dipin=? WHERE id=? AND user_id=?').run(body.dipin ? 1 : 0, id, u.id);
        return send(res, 200, { id, dipin: body.dipin });
      }
      if (typeof body.judul !== 'string' || !body.judul.trim() || body.judul.trim().length > 80)
        return fail(res, 422, 'JUDUL_TIDAK_VALID', 'Judul harus berisi 1–80 karakter.');
      const judul = body.judul.trim().replace(/\s+/g, ' ');
      db.prepare('UPDATE percakapan SET judul=? WHERE id=? AND user_id=?').run(judul, id, u.id);
      return send(res, 200, { id, judul });
    }
    const hapusPercakapan = /^\/api\/percakapan\/(\d+)$/.exec(url);
    if (method === 'DELETE' && hapusPercakapan) {
      const u = guard(req, res); if (!u) return;
      const id = Number(hapusPercakapan[1]);
      if (!db.prepare('SELECT 1 FROM percakapan WHERE id=? AND user_id=?').get(id, u.id))
        return fail(res, 404, 'PERCAKAPAN_TIDAK_ADA', 'Percakapan tidak ditemukan.');
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM pesan WHERE percakapan_id=? AND user_id=?').run(id, u.id);
        db.prepare('DELETE FROM percakapan WHERE id=? AND user_id=?').run(id, u.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return send(res, 200, { id, dihapus: true });
    }
    if (method === 'POST' && url === '/api/chat') {
      const u = guard(req, res); if (!u) return;
      const { question: q, percakapanId: requestedId } = (await readJson(req)) ?? {};
      let percakapanId = requestedId;
      if (typeof q !== 'string' || !q.trim()) return fail(res, 422, 'DATA_TIDAK_VALID', 'Isi pertanyaan dahulu.');
      if (q.length > 1000) return fail(res, 413, 'TERLALU_BESAR', 'Pertanyaan maksimal 1000 karakter.');
      if (percakapanId === undefined) {
        const latest = db.prepare('SELECT id FROM percakapan WHERE user_id=? ORDER BY diperbarui DESC,id DESC LIMIT 1').get(u.id);
        percakapanId = latest?.id ?? Number(db.prepare('INSERT INTO percakapan(user_id) VALUES(?)').run(u.id).lastInsertRowid);
      }
      if (!Number.isSafeInteger(percakapanId) || percakapanId < 1 ||
          !db.prepare('SELECT 1 FROM percakapan WHERE id=? AND user_id=?').get(percakapanId, u.id))
        return fail(res, 404, 'PERCAKAPAN_TIDAK_ADA', 'Percakapan tidak ditemukan.');
      const t = (jejakChat.get(u.id) ?? []).filter((x) => Date.now() - x < 60_000);
      if (t.length >= CHAT_PER_MENIT) return fail(res, 429, 'BATAS_PERMINTAAN', 'Batas 10 pertanyaan per menit tercapai. Tunggu sebentar.');
      jejakChat.set(u.id, [...t, Date.now()]);
      const hist = db.prepare('SELECT peran AS role,isi AS content FROM pesan WHERE percakapan_id=? ORDER BY id DESC LIMIT 6').all(percakapanId).reverse();
      const title = q.trim().replace(/\s+/g, ' ').slice(0, 60);
      db.prepare(`UPDATE percakapan SET judul=CASE WHEN NOT EXISTS(SELECT 1 FROM pesan WHERE percakapan_id=?)
        THEN ? ELSE judul END,diperbarui=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(percakapanId, title, percakapanId, u.id);
      db.prepare("INSERT INTO pesan(user_id,percakapan_id,peran,isi) VALUES(?,?,'user',?)").run(u.id, percakapanId, q.trim());
      const controller = new AbortController();
      res.once('close', () => { if (!res.writableEnded) controller.abort(); });
      const r = await fetch(`${API}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: persona() }, ...hist, { role: 'user', content: q.trim() }], max_tokens: 600, stream: false }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]) });
      if (!r.ok) return fail(res, r.status === 429 ? 429 : 502, 'LAYANAN_AI', `OmniRoute mengembalikan HTTP ${r.status}`);
      const answer = (await r.json()).choices?.[0]?.message?.content ?? 'Tidak ada teks jawaban.';
      db.prepare("INSERT INTO pesan(user_id,percakapan_id,peran,isi) VALUES(?,?,'assistant',?)").run(u.id, percakapanId, answer);
      db.prepare("UPDATE percakapan SET diperbarui=CURRENT_TIMESTAMP WHERE id=?").run(percakapanId);
      return send(res, 200, { answer });
    }
    if (method === 'GET' && url === '/api/admin/pengguna') {
      if (!guard(req, res, 'admin')) return;
      return send(res, 200, { pengguna: db.prepare("SELECT u.id,u.nama,u.peran,u.aktif,u.dibuat,u.terakhir_masuk,(SELECT COUNT(*) FROM pesan p WHERE p.user_id=u.id AND p.peran='user') AS jumlah_pertanyaan FROM users u ORDER BY u.id").all() });
    }
    const m = /^\/api\/admin\/pengguna\/(\d+)\/aktif$/.exec(url);
    if (method === 'POST' && m) {
      const admin = guard(req, res, 'admin'); if (!admin) return;
      const aktif = (await readJson(req))?.aktif;
      if (typeof aktif !== 'boolean') return fail(res, 422, 'DATA_TIDAK_VALID', 'Kirim {"aktif": true atau false}.');
      if (Number(m[1]) === admin.id) return fail(res, 422, 'DIRI_SENDIRI', 'Admin tidak dapat menonaktifkan akunnya sendiri.');
      const r = db.prepare('UPDATE users SET aktif=? WHERE id=?').run(aktif ? 1 : 0, Number(m[1]));
      return r.changes ? send(res, 200, { id: Number(m[1]), aktif }) : fail(res, 404, 'TIDAK_ADA', 'Pengguna tidak ditemukan.');
    }
    fail(res, 404, 'TIDAK_ADA', 'Halaman tidak ditemukan.');
  } catch { if (!res.destroyed) fail(res, 502, 'LAYANAN_AI', 'Gagal menghubungi OmniRoute. Periksa koneksi atau coba lagi.'); }
}).listen(PORT, '127.0.0.1', () => console.log(`Chatbot siap: http://127.0.0.1:${PORT}/  (Ctrl+C untuk berhenti)`));
