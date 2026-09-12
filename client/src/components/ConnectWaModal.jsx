import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  QrCode,
  KeyRound,
  Plug,
  PlugZap,
  LogOut,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  Smartphone,
  Loader2,
  WifiOff,
  Link2,
  Timer,
} from 'lucide-react';
import Modal from './Modal.jsx';
import Logo from './Logo.jsx';
import {
  useAppState,
  connectWa,
  requestPairing,
  disconnectWa,
  setConnectTab,
  closeModal,
} from '../hooks/useAppState.js';
import { normalizePhone, isValidPhone, prettyPhone } from '../lib/format.js';
import { WARNING_BANNED } from '../lib/constants.js';

/* ---------------------------------------------------------- QR panel ---- */
function QrPanel() {
  const { wa } = useAppState();
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setLeft(wa.qr?.expiresAt ? Math.max(0, Math.round((wa.qr.expiresAt - Date.now()) / 1000)) : 0);
    }, 500);
    return () => clearInterval(t);
  }, [wa.qr?.expiresAt]);

  const start = async () => {
    setBusy(true);
    await connectWa('qr');
    setBusy(false);
  };

  const qr = wa.qr?.dataUrl ? wa.qr : null;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,240px)_1fr]">
      {/* kotak QR */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <div className="absolute -inset-3 rounded-3xl bg-brand-gradient-soft blur-2xl" />
          <div className="relative flex h-[228px] w-[228px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white p-3">
            <AnimatePresence mode="wait">
              {qr ? (
                <motion.img
                  key={qr.dataUrl}
                  src={qr.dataUrl}
                  alt="QR code WhatsApp KyyPureStatus"
                  className="h-full w-full object-contain"
                  initial={{ opacity: 0, scale: 0.94, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35 }}
                />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 px-4 text-center"
                >
                  <div className="rounded-xl border border-white/10 bg-base-900/60 p-3">
                    {busy ? <Loader2 size={26} className="animate-spin text-brand-violet" /> : <QrCode size={26} className="text-gray-500" />}
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-gray-600">
                    {busy ? 'Lagi manggil server WhatsApp...' : 'QR-nya belum nongol. Klik tombol di bawah buat mancing.'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* corner marker */}
            <span className="pointer-events-none absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-brand-violet/70" />
            <span className="pointer-events-none absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-brand-fuchsia/70" />
            <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-brand-cyan/70" />
            <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-brand-violet/70" />

            {/* garis scan */}
            {qr && (
              <motion.span
                className="pointer-events-none absolute inset-x-3 h-[2px] rounded-full bg-gradient-to-r from-transparent via-brand-cyan to-transparent"
                animate={{ top: ['8%', '92%', '8%'] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ boxShadow: '0 0 14px rgba(34,211,238,.75)' }}
              />
            )}
          </div>
        </div>

        {/* countdown */}
        <div className="mt-3 flex items-center gap-2">
          {qr ? (
            <span className="pill !text-[10.5px]">
              <Timer size={11} className="text-brand-cyan" />
              {left > 0 ? `refresh otomatis dalam ${left}s` : 'nunggu QR baru dari server...'}
            </span>
          ) : (
            <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={start} disabled={busy} className="btn-primary btn-sm">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Tampilkan QR
            </motion.button>
          )}
        </div>

        <p className="mt-2 text-center text-[10px] text-gray-600">
          QR auto-refresh tiap ±20–40 detik dari server WhatsApp
          <br />
          {wa.qr?.count ? <span className="font-mono">QR ke-{wa.qr.count}</span> : null}
        </p>
      </div>

      {/* instruksi */}
      <div className="space-y-3">
        <h4 className="text-[13px] font-bold text-white">Cara scan-nya gini bos:</h4>
        <ol className="space-y-2">
          {[
            'Buka WhatsApp di HP lu.',
            'Ketuk titik tiga (⋮) di kanan atas → "Perangkat tertaut" / "Linked devices".',
            'Pilih "Tautkan perangkat" / "Link a device".',
            'Arahin kamera HP ke QR di sebelah kiri. Kelar.',
          ].map((step, i) => (
            <motion.li
              key={step}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
              className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-gray-400"
            >
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-brand-violet/35 bg-brand-violet/10 font-mono text-[10px] font-bold text-brand-violet">
                {i + 1}
              </span>
              {step}
            </motion.li>
          ))}
        </ol>

        <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-gray-400">
          <Link2 size={13} className="mt-0.5 shrink-0 text-brand-cyan" />
          <span>
            Session lu disimpen di <code className="rounded bg-black/50 px-1 font-mono text-[10.5px] text-brand-cyan">/data/sessions</code> — jadi
            kalo server restart, nggak perlu scan ulang. Kalo ke-logout dari HP, folder itu dibersihkan otomatis.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Pairing panel --- */
function PairingPanel() {
  const { wa } = useAppState();
  const [phone, setPhone] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const normalized = useMemo(() => normalizePhone(phone), [phone]);
  const valid = isValidPhone(normalized);
  const code = wa.pairing?.code || '';

  const submit = async (e) => {
    e?.preventDefault();
    setErr('');
    if (!valid) {
      setErr('Nomornya belum valid bro. Contoh: 081234567890 atau 6281234567890.');
      return;
    }
    if (custom && !/^[A-Za-z0-9]{1,8}$/.test(custom.trim())) {
      setErr('Kode custom cuma boleh huruf & angka, maks 8 karakter (misal: KYYDEVV8).');
      return;
    }
    setBusy(true);
    const res = await requestPairing(normalized, custom.trim());
    setBusy(false);
    if (res?.ok === false) setErr(res.error || 'Pairing gagal. Coba QR aja kali ya.');
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="kyy-pair-phone">
            Nomor WA yang mau ditautkan
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-900/70 px-3 py-2 focus-within:border-brand-violet/60">
            <Smartphone size={15} className="shrink-0 text-gray-500" />
            <input
              id="kyy-pair-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\-\s()]/g, '').slice(0, 20))}
              placeholder="081234567890"
              className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-gray-100 placeholder:font-sans placeholder:text-gray-600 focus:outline-none"
            />
          </div>
          <p className="mt-1 text-[10.5px] text-gray-600">
            {valid ? (
              <>
                jadi <span className="font-mono text-gray-400">{prettyPhone(normalized)}</span> — pairing code dikirim ke nomor ini
              </>
            ) : (
              'nomor lu sendiri ya, bukan nomor tujuan kirim'
            )}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="kyy-pair-custom">
            Kode custom 8 digit <span className="normal-case tracking-normal text-gray-600">(opsional)</span>
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-900/70 px-3 py-2 focus-within:border-brand-violet/60">
            <KeyRound size={15} className="shrink-0 text-gray-500" />
            <input
              id="kyy-pair-custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
              placeholder="KYYDEVV8"
              maxLength={8}
              className="min-w-0 flex-1 bg-transparent font-mono text-[14px] uppercase tracking-[0.25em] text-gray-100 placeholder:tracking-normal placeholder:text-gray-600 focus:outline-none"
            />
            <span className="font-mono text-[10px] text-gray-600">{custom.length}/8</span>
          </div>
          <p className="mt-1 text-[10.5px] text-gray-600">Kosongin aja kalo mau server yang bikin kode random.</p>
        </div>

        <AnimatePresence>
          {err && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/[0.08] px-2.5 py-2 text-[11.5px] text-rose-200"
            >
              <ShieldAlert size={12} className="mt-0.5 shrink-0" />
              {err}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} disabled={busy || !valid} className="btn-primary w-full">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          {busy ? 'Lagi minta kode ke WhatsApp...' : 'Bikin Pairing Code'}
        </motion.button>
      </form>

      {/* hasil kode */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/[0.08] bg-base-900/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">pairing code lu</span>
            {code && (
              <button
                type="button"
                onClick={copyCode}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:text-white"
              >
                {copied ? <Check size={11} className="text-emerald-300" /> : <Copy size={11} />}
                {copied ? 'tersalin' : 'salin'}
              </button>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => {
              const ch = code[i];
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={
                    ch
                      ? { opacity: 1, y: 0, scale: 1 }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  transition={{ delay: i * 0.04, type: 'spring', stiffness: 320, damping: 22 }}
                  className={`flex h-11 w-8 items-center justify-center rounded-lg border font-mono text-[19px] font-bold sm:h-12 sm:w-9 ${
                    ch
                      ? 'border-brand-violet/50 bg-brand-violet/15 text-white shadow-[0_0_18px_-6px_rgba(139,92,246,.8)]'
                      : 'border-white/[0.08] bg-white/[0.02] text-gray-700'
                  }`}
                >
                  {ch || '•'}
                </motion.div>
              );
            })}
          </div>

          {!code && <p className="mt-3 text-center text-[11px] text-gray-600">Belum ada kode. Isi nomor terus klik tombol di sebelah.</p>}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <h5 className="mb-1.5 text-[11.5px] font-bold text-white">Masukin kode-nya di HP:</h5>
          <ol className="space-y-1 text-[11.5px] leading-relaxed text-gray-400">
            <li>1. WhatsApp → <b className="text-gray-200">Perangkat tertaut</b></li>
            <li>2. <b className="text-gray-200">Tautkan perangkat</b></li>
            <li>3. Pilih <b className="text-gray-200">"Tautkan dengan nomor telepon"</b></li>
            <li>4. Ketik 8 digit di atas → lanjut</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- connected panel --- */
function ConnectedPanel() {
  const { wa } = useAppState();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-5 text-center sm:flex-row sm:text-left">
        <div className="relative">
          <Logo size={54} />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-base-800 bg-emerald-500">
            <Check size={11} className="text-white" />
          </span>
        </div>
        <div className="min-w-0">
          <h4 className="text-[15px] font-bold text-white">WA lu udah nyambung nih bos 🔗</h4>
          <p className="mt-0.5 text-[12px] text-gray-400">
            <span className="font-mono text-emerald-300">{wa.me?.phonePretty || wa.me?.phone || '—'}</span>
            {wa.me?.pushName ? <> • <span className="text-gray-300">{wa.me.pushName}</span></> : null}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            {wa.sentCount || 0} video udah kekirim lewat sesi ini • device <span className="font-mono">{wa.me?.deviceId ?? '—'}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">status</div>
          <div className="mt-0.5 font-mono text-[12.5px] text-emerald-300">{wa.status}</div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">uptime sesi</div>
          <div className="mt-0.5 font-mono text-[12.5px] text-gray-200">{Math.round((wa.uptimeSec || 0) / 60)} menit</div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">reconnect</div>
          <div className="mt-0.5 font-mono text-[12.5px] text-gray-200">2s → 30s backoff</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={async () => {
            setBusy(true);
            await connectWa('qr');
            setBusy(false);
          }}
          disabled={busy}
          className="btn-ghost btn-sm"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} restart koneksi
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => disconnectWa(false)}
          className="btn-ghost btn-sm"
        >
          <PlugZap size={13} /> putus aja (session tetep)
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (window.confirm('Hapus session + logout total? Lu harus scan QR lagi nanti.')) disconnectWa(true);
          }}
          className="btn-danger btn-sm ml-auto"
        >
          <LogOut size={13} /> logout & hapus session
        </motion.button>
      </div>
    </div>
  );
}

/* ============================================================ modal ====== */
export default function ConnectWaModal() {
  const { ui, wa, config } = useAppState();
  const open = ui.modal === 'connect';
  const tab = ui.connectTab || 'qr';

  const tabs = [
    { id: 'qr', label: 'QR Code', icon: QrCode },
    { id: 'pair', label: 'Pairing Code', icon: KeyRound },
  ];

  const isConnected = wa.status === 'open' && wa.registered;

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={isConnected ? 'Koneksi WhatsApp' : 'Sambungkan WhatsApp lu'}
      subtitle={
        config.mockSend
          ? 'MOCK_SEND lagi nyala — semua kirim cuma simulasi, nggak nyentuh WhatsApp beneran.'
          : isConnected
            ? 'Udah kekunci. Mau restart, ganti nomor, atau logout?'
            : 'Pilih mau scan QR atau pakai pairing code 8 digit. Session-nya disimpen, jadi nggak perlu ulang tiap restart.'
      }
      icon={isConnected ? PlugZap : Plug}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-200/85">
          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-400" />
          <span>{WARNING_BANNED}</span>
          {wa.lastError && wa.status !== 'open' && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-rose-300">
              <WifiOff size={11} /> {wa.lastError}
            </span>
          )}
        </div>
      }
    >
      {config.mockSend ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.07] p-3.5">
            <PlugZap size={16} className="mt-0.5 shrink-0 text-cyan-300" />
            <div className="text-[12.5px] leading-relaxed text-cyan-100">
              <b>Mode uji (MOCK_SEND=true) lagi aktif.</b>
              <br />
              Baileys sengaja nggak dinyalain, jadi kompresi tetep jalan normal tapi tahap kirim langsung ditembak sukses. Cocok buat
              ngetes UI/UX atau bikin konten demo tanpa nyentuh nomor asli.
            </div>
          </div>
          <p className="text-[11.5px] text-gray-500">
            Mau beneran kirim? Set <code className="rounded bg-black/50 px-1 font-mono text-[10.5px] text-brand-cyan">MOCK_SEND=false</code> di{' '}
            <code className="rounded bg-black/50 px-1 font-mono text-[10.5px]">.env</code> terus restart server-nya.
          </p>
        </div>
      ) : isConnected ? (
        <ConnectedPanel />
      ) : (
        <div className="space-y-4">
          {/* tab */}
          <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-base-900/60 p-1">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setConnectTab(t.id)}
                  className={`relative flex-1 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                    active ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="kyy-wa-tab"
                      className="absolute inset-0 rounded-lg border border-brand-violet/40 bg-brand-violet/15"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative flex items-center justify-center gap-1.5">
                    <t.icon size={13} />
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              {tab === 'qr' ? <QrPanel /> : <PairingPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </Modal>
  );
}
