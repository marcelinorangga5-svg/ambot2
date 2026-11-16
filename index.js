const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');
const rateLimit = new Map();

// ============ CONFIG ============
const BOT_TOKEN = 'process.env.BOT_TOKEN';
const API       = 'https://restapidhan.vercel.app';
const APIKEY    = 'freeapikeydhan26';
const ADMIN_ID  = 1564275538;
const GROUP_ID  = -1003729559381;

const bot = new Telegraf(BOT_TOKEN);

// ============ CACHE & DATABASE SEDERHANA ============
const userSessions = {};
const premiumAccounts = {};
const activeProcesses = new Set(); // Proteksi agar tidak looping/spam

// Fungsi sensor email (misal: am_3zputeqe@emalupe.com -> am_3zpu******.com atau sensor 6 karakter tengah)
function sensorEmail(email) {
  if (!email || !email.includes('@')) return '***@***.com';
  const [name, domain] = email.split('@');
  if (name.length <= 3) return name[0] + '***@' + domain;
  const visible = name.slice(0, 3);
  return visible + '******@' + domain;
}

// ============ RATE LIMIT ============
function checkRateLimit(userId) {
  const now = Date.now();
  const last = rateLimit.get(userId) || 0;
  if (now - last < 5000) {
    return false;
  }
  rateLimit.set(userId, now);
  return true;
}

// ============ MAIL.TM HELPER FUNCTIONS ============
async function createMailTmAccount() {
  try {
    const domainRes = await fetch('https://api.mail.tm/domains');
    const domainData = await domainRes.json();
    if (!domainData['hydra:member'] || domainData['hydra:member'].length === 0) {
      throw new Error('Tidak ada domain mail.tm yang tersedia.');
    }
    const domain = domainData['hydra:member'][0].domain;

    const username = 'am_' + Math.random().toString(36).substring(2, 10);
    const address = `${username}@${domain}`;
    const password = 'Password123!';

    const regRes = await fetch('https://api.mail.tm/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password })
    });
    
    if (!regRes.ok) {
      throw new Error('Gagal membuat akun email mail.tm');
    }

    const tokenRes = await fetch('https://api.mail.tm/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password })
    });
    const tokenData = await tokenRes.json();
    
    if (!tokenData.token) {
      throw new Error('Gagal mendapatkan token mail.tm');
    }

    return {
      email: address,
      token: tokenData.token
    };
  } catch (err) {
    throw new Error('Mail.tm Error: ' + err.message);
  }
}

async function getEnglishVerificationLink(token, maxAttempt = 30) {
  const headers = { "Authorization": `Bearer ${token}` };
  
  for (let i = 0; i < maxAttempt; i++) {
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const msgRes = await fetch('https://api.mail.tm/messages', { headers });
      const msgData = await msgRes.json();
      const messages = msgData['hydra:member'] || [];

      if (messages.length > 0) {
        for (const msg of messages) {
          const detailRes = await fetch(`https://api.mail.tm/messages/${msg.id}`, { headers });
          const detailData = await detailRes.json();
          
          const sender = detailData.from && detailData.from.address ? detailData.from.address.toLowerCase() : '';
          const content = `${detailData.text || ''} ${detailData.html || ''}`;

          if (sender.includes('alight-creative.firebaseapp.com') && content.includes('Sign in to Alight Creative')) {
            const regex = /href=["'](https:\/\/alight-creative\.firebaseapp\.com\/__\/auth\/links\?[^"']+)["']/i;
            const match = content.match(regex);
            if (match && match[1]) {
              return { url: match[1].replace(/&amp;/g, '&'), msgId: msg.id };
            }
          }
        }
      }
    } catch (e) {}
  }
  return null;
}

async function getIndonesianVerificationLink(token, excludeMsgId, maxAttempt = 60) {
  const headers = { "Authorization": `Bearer ${token}` };
  
  for (let i = 0; i < maxAttempt; i++) {
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const msgRes = await fetch('https://api.mail.tm/messages', { headers });
      const msgData = await msgRes.json();
      const messages = msgData['hydra:member'] || [];

      if (messages.length > 0) {
        for (const msg of messages) {
          if (msg.id === excludeMsgId) continue;

          const detailRes = await fetch(`https://api.mail.tm/messages/${msg.id}`, { headers });
          const detailData = await detailRes.json();
          
          const sender = detailData.from && detailData.from.address ? detailData.from.address.toLowerCase() : '';
          const content = `${detailData.text || ''} ${detailData.html || ''}`;

          if (sender.includes('alight-creative.firebaseapp.com') && content.includes('Login ke Alight Creative')) {
            const regex = /href=["'](https:\/\/alight-creative\.firebaseapp\.com\/__\/auth\/links\?[^"']+)["']/i;
            const match = content.match(regex);
            if (match && match[1]) {
              return { url: match[1].replace(/&amp;/g, '&'), msgId: msg.id };
            }
          }
        }
      }
    } catch (e) {}
  }
  return null;
}

// ============ PREMIUM ACCOUNT GENERATOR ============
async function generatePremiumAccount(email) {
  try {
    const trialRes = await fetch(`${API}/api/am/trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email, 
        apikey: APIKEY,
        device_id: generateDeviceId()
      })
    });
    const trialData = await trialRes.json();
    
    if (trialData.status) {
      return {
        success: true,
        email: email,
        password: generatePassword(),
        expiry: trialData.expiry || '7 days',
        codeorder: trialData.codeorder
      };
    }
    
    const poolRes = await fetch(`${API}/api/am/pool?apikey=${APIKEY}`);
    const poolData = await poolRes.json();
    if (poolData.status && poolData.accounts.length > 0) {
      return {
        success: true,
        ...poolData.accounts[0],
        from_pool: true
      };
    }
    
    return { success: false, error: trialData.error || 'No accounts available' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function generateDeviceId() {
  return 'xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$';
  let pass = '';
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// ============ COMMAND HANDLERS ============
const commands = {
  async start(ctx) {
    const userId = ctx.from.id;
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    
    if (!checkRateLimit(userId)) {
      return ctx.reply('⏳ Tunggu 5 detik sebelum perintah berikutnya.');
    }

    // Proteksi anti-looping: Cegah proses menumpuk jika user mengirim /start saat sesi sebelumnya masih berjalan
    if (activeProcesses.has(userId)) {
      return ctx.reply('⚠️ Sesi sebelumnya sedang berjalan. Mohon tunggu hingga proses selesai.', { parse_mode: 'Markdown' });
    }

    activeProcesses.add(userId);

    try {
      await ctx.reply('⚡ *Inisialisasi Sistem* — Menyiapkan infrastruktur email sementara...', { parse_mode: 'Markdown' });

      const mailAccount = await createMailTmAccount();
      const email = mailAccount.email;
      
      userSessions[userId] = {
        email: email,
        token: mailAccount.token
      };

      const res = await fetch(`${API}/api/am?action=send&apikey=${APIKEY}&email=${encodeURIComponent(email)}`);
      const data = await res.json();
      
      if (!data.status) {
        activeProcesses.delete(userId);
        return ctx.reply(`❌ *Gagal:* ${data.error || data.message || 'Terjadi kesalahan pada server.'}`, { parse_mode: 'Markdown' });
      }

      const englishEmail = await getEnglishVerificationLink(mailAccount.token, 30);

      if (!englishEmail) {
        activeProcesses.delete(userId);
        return ctx.reply('❌ *Waktu Habis:* Gagal mendeteksi verifikasi awal. Silakan ketik `/start` untuk mengulang.', { parse_mode: 'Markdown' });
      }

      const initVerifRes = await fetch(`${API}/api/am?action=verif&apikey=${APIKEY}&email=${encodeURIComponent(email)}&url=${encodeURIComponent(englishEmail.url)}`);
      const initVerifData = await initVerifRes.json();

      if (!initVerifData.status) {
        activeProcesses.delete(userId);
        return ctx.reply(`❌ *Kesalahan Sistem:* ${initVerifData.error || 'Gagal memproses verifikasi.'}`, { parse_mode: 'Markdown' });
      }

      const modernInfoText = `✨ *Sesi Alight Motion Berhasil Dibuat*\n\n` +
                             `📧 *Email Eksklusif Anda:*\n` +
                             `\`${email}\`\n\n` +
                             `📌 *Panduan Aktivasi:*\n` +
                             `1️⃣ Salin email di atas.\n` +
                             `2️⃣ Buka aplikasi *Alight Motion* Anda.\n` +
                             `3️⃣ Pilih opsi *Login* menggunakan email.\n` +
                             `4️⃣ Tempelkan (*Paste*) email tersebut.\n` +
                             `5️⃣ Kembali ke bot ini untuk menerima link verifikasi instan.\n` +
                             `6️⃣ *Done!* Akun siap digunakan.\n\n` +
                             `🔄 _Status: Sistem aktif memantau inbox secara real-time..._`;

      await ctx.reply(modernInfoText, { parse_mode: 'Markdown' });

      const indoVerification = await getIndonesianVerificationLink(mailAccount.token, englishEmail.msgId, 60);

      if (!indoVerification) {
        activeProcesses.delete(userId);
        return ctx.reply('⏳ *Waktu Sesi Habis:* Anda belum melakukan login di aplikasi dalam batas waktu yang ditentukan. Ketik `/start` untuk mencoba kembali.', { parse_mode: 'Markdown' });
      }

      // Kirim log ke grup dengan format yang diminta
      try {
        const maskedEmail = sensorEmail(email);
        const groupLogText = `🎉 Halo ${username}\n\n` +
                             `Akun Alight Motion Premium Anda telah berhasil dibuat!\n\n` +
                             `📧 *Email Terdaftar:* \`${maskedEmail}\`\n\n` +
                             `🚀 _Terima kasih telah menggunakan layanan bot otomatis kami. Simpan kredensial Anda dengan aman dan nikmati fitur premium sepenuhnya!_`;
        
        await ctx.telegram.sendMessage(GROUP_ID, groupLogText, { parse_mode: 'Markdown' });
      } catch (groupErr) {
        console.error('Gagal mengirim log ke grup:', groupErr);
      }

      delete userSessions[userId];
      activeProcesses.delete(userId);

      return ctx.reply(
        `📬 *Verifikasi Berhasil Diterima!*\n\n` +
        `Silakan ketuk tombol di bawah ini untuk melanjutkan ke aplikasi Alight Motion:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.url('🚀 Buka & Login Alight Motion', indoVerification.url)]
          ])
        }
      );

    } catch (err) {
      activeProcesses.delete(userId);
      return ctx.reply(`❌ *Critical Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  },
  
  async verif(ctx, args) {
    const userId = ctx.from.id;
    const url = args.join(' ');
    
    if (!url || !url.startsWith('http')) {
      return ctx.reply('❌ Format tidak valid.\nContoh: `/verif https://example.com/verify?token=xxx`', { parse_mode: 'Markdown' });
    }
    
    const session = userSessions[userId];
    const email = session ? session.email : null;
    
    if (!email) {
      return ctx.reply('⚠️ Sesi email aktif tidak ditemukan. Silakan jalankan `/start` terlebih dahulu.', { parse_mode: 'Markdown' });
    }
    
    try {
      await ctx.reply('⏳ Memproses verifikasi kredensial akun...', { parse_mode: 'Markdown' });
      const res = await fetch(`${API}/api/am?action=verif&apikey=${APIKEY}&email=${encodeURIComponent(email)}&url=${encodeURIComponent(url)}`);
      const data = await res.json();
      
      if (data.status) {
        const premium = await generatePremiumAccount(email);
        delete userSessions[userId];
        
        const text = `🎉 *Premium Account Activated!*\n\n` +
                     `Akun Alight Motion Premium berhasil diaktifkan sepenuhnya!\n\n` +
                     `📧 *Email:* \`${email}\`\n` +
                     `🔑 *Password AM:* \`${premium.password || 'Gunakan lupa password'}\`\n` +
                     `📦 *Code Order:* \`${data.codeorder || premium.codeorder || '-'}\`\n` +
                     `⏳ *Masa Aktif:* ${premium.expiry || '7 hari trial'}\n\n` +
                     `🔒 _Simpan informasi kredensial ini dengan aman._`;
        
        if (premium.success) {
          premiumAccounts[email] = premium;
        }
        
        return ctx.reply(text, { parse_mode: 'Markdown' });
      } else {
        return ctx.reply(`❌ *Verifikasi Gagal:* ${data.error || data.message || 'Tautan tidak valid atau sudah kadaluarsa.'}`, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      return ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  },
  
  async create(ctx, args) {
    const userId = ctx.from.id;
    
    if (!checkRateLimit(userId)) {
      return ctx.reply('⏳ Harap tunggu 5 detik sebelum mengeksekusi perintah berikutnya.');
    }
    
    let email = args[0];
    if (!email) {
      const random = Math.random().toString(36).substring(2, 10);
      email = `am_${random}@gmail.com`;
    }
    
    try {
      await ctx.reply('⏳ Memproses pembuatan akun premium instan...', { parse_mode: 'Markdown' });
      const result = await generatePremiumAccount(email);
      
      if (result.success) {
        const text = `✅ *Instant Account Generated!*\n\n` +
                     `📧 *Email:* \`${result.email}\`\n` +
                     `🔑 *Password:* \`${result.password || 'Cek inbox email'}\`\n` +
                     `⏳ *Durasi:* ${result.expiry || '7 days'}\n` +
                     `📦 *Code Order:* \`${result.codeorder || '-'}\`\n\n` +
                     `🔒 _Simpan informasi kredensial ini dengan aman._`;
        
        premiumAccounts[result.email] = result;
        return ctx.reply(text, { parse_mode: 'Markdown' });
      } else {
        return ctx.reply(`❌ *Gagal membuat akun:* ${result.error || 'Stok tidak tersedia.'}`, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      return ctx.reply(`❌ *Error:* \`${err.message}\``, { parse_mode: 'Markdown' });
    }
  },
  
  async cancel(ctx) {
    const userId = ctx.from.id;
    if (userSessions[userId]) {
      const email = userSessions[userId].email;
      delete userSessions[userId];
      activeProcesses.delete(userId);
      return ctx.reply(`✅ Sesi aktif untuk email \`${email}\` berhasil dibatalkan.`, { parse_mode: 'Markdown' });
    } else {
      return ctx.reply('⚠️ Tidak ada sesi aktif yang sedang berjalan.', { parse_mode: 'Markdown' });
    }
  },
  
  async list(ctx) {
    const entries = Object.entries(premiumAccounts);
    if (entries.length === 0) {
      return ctx.reply('📭 Belum ada riwayat akun premium yang tercatat pada sistem bot.', { parse_mode: 'Markdown' });
    }
    
    const list = entries.map(([email, data]) => 
      `• \`${email}\` | Exp: ${data.expiry || '?'} | Code: \`${data.codeorder || '-'}\``
    ).join('\n');
    
    const text = `📋 *Daftar Riwayat Akun Premium*\nTotal Tersimpan: ${entries.length} Akun\n\n${list}`;
    return ctx.reply(text, { parse_mode: 'Markdown' });
  },
  
  async help(ctx) {
    const text = `📖 *Alight Motion Bot Assistant*\n\n` +
                 `Sistem otomatisasi pembuatan akun premium berbasis integrasi API & Mail Server.\n\n` +
                 `⚙️ *Daftar Perintah:*-\n` +
                 `/start - Mulai proses pembuatan akun otomatis\n` +
                 `/create \`[email]\` - Generator akun instan\n` +
                 `/verif \`<url>\` - Verifikasi manual\n` +
                 `/list - Lihat daftar riwayat akun\n` +
                 `/cancel - Batalkan sesi aktif\n` +
                 `/help - Tampilkan pusat bantuan\n\n` +
                 `💡 _Gunakan layanan ini secara bijak._`;
    
    return ctx.reply(text, { parse_mode: 'Markdown' });
  }
};

// ============ TELEGRAF COMMAND ROUTER ============
bot.start((ctx) => commands.start(ctx));
bot.command('verif', (ctx) => commands.verif(ctx, ctx.message.text.split(' ').slice(1)));
bot.command('create', (ctx) => commands.create(ctx, ctx.message.text.split(' ').slice(1)));
bot.command('cancel', (ctx) => commands.cancel(ctx));
bot.command('list', (ctx) => commands.list(ctx));
bot.command('help', (ctx) => commands.help(ctx));

// ============ LAUNCH BOT ============
bot.launch().then(() => {
  console.log(`✅ Bot Telegram berhasil dijalankan!`);
});

// ============ ERROR HANDLING ============
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
