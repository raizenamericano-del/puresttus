import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  Cpu,
  Layers,
  Radio,
  HardDrive,
  Brush,
  KeyRound,
  Terminal,
  Heart,
  Save,
  Check,
  Loader2,
  FlaskConical,
  ShieldCheck,
} from 'lucide-react';
import Modal from './Modal.jsx';
import Logo from './Logo.jsx';
import { useAppState, closeModal } from '../hooks/useAppState.js';
import api, { getToken, setToken } from '../lib/api.js';
import { formatBytes } from '../lib/format.js';
import { TIER_INFO, ENCODE_SPEC } from '../lib/constants.js';

function Section({ icon: Icon, title, children, right = null }) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon size={13} className="text-brand-violet" />
        <h4 className="text-[12px] font-bold uppercase tracking-[0.14em] text-gray-300">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

function SpecRow({ k, v, mono = true }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1.5 last:border-0">
      <span className="text-[11.5px] text-gray-500">{k}</span>
      <span className={`text-right text-[11.5px] text-gray-200 ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  );
}

export default function InfoModal() {
  const { ui, config, wa } = useAppState();
  const open = ui.modal === 'info';
  const [storage, setStorage] = useState(null);
  const [sweeping, setSweeping] = useState(false);
  const [tokenInput, setTokenInput] = useState(getToken());
  const [tokenSaved, setTokenSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .storage()
      .then((r) => setStorage(r))
      .catch(() => setStorage(null));
    setTokenInput(getToken());
  }, [open]);

  const forceCleanup = async () => {
    setSweeping(true);
    try {
      const res = await api.forceCleanup();
      setStorage(await api.storage().catch(() => null));
      window.alert(
        `Cleanup manual kelar:\n- ${res.results?.uploads?.removed ?? 0} file upload\n- ${res.results?.output?.removed ?? 0} file hasil\n- ${res.results?.orphans?.removed ?? 0} file yatim\nTotal ${res.removedFiles} file kehapus dalam ${res.tookMs}ms.`,
      );
    } catch (err) {
      window.alert(`Gagal cleanup: ${err.message}`);
    } finally {
      setSweeping(false);
    }
  };

  const saveToken = () => {
    setToken(tokenInput.trim());
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 1800);
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="Info Engine & Spesifikasi"
      subtitle="Semua yang terjadi di balik layar KyyPureStatus — transparan, nggak ada yang disensor."
      icon={Info}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Logo size={20} animated={false} />
          <span>
            KyyPureStatus v1.0.0 • dibuat pakai <Heart size={10} className="inline text-brand-fuchsia" /> oleh{' '}
            <b className="text-gradient">KyyDevv</b>
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-gray-600">
            {config.mockSend ? <FlaskConical size={10} className="text-cyan-300" /> : <ShieldCheck size={10} className="text-emerald-300" />}
            MOCK_SEND={String(config.mockSend)}
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        {/* ----------------------------- LADDER ----------------------------- */}
        <Section
          icon={Layers}
          title="Ladder kompresi adaptif (murni dari durasi)"
          right={<span className="ml-auto text-[10px] text-gray-600">anti-upscale • orientasi dijaga</span>}
        >
          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-left">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-gray-500">
                <tr>
                  <th className="px-2.5 py-1.5 font-semibold">durasi input</th>
                  <th className="px-2.5 py-1.5 font-semibold">tier</th>
                  <th className="px-2.5 py-1.5 font-semibold">target</th>
                  <th className="px-2.5 py-1.5 font-semibold">max bitrate</th>
                  <th className="px-2.5 py-1.5 font-semibold">rate control</th>
                </tr>
              </thead>
              <tbody>
                {TIER_INFO.map((t) => (
                  <tr key={t.tier} className="border-t border-white/[0.04] text-[11.5px] text-gray-300">
                    <td className="px-2.5 py-1.5">{t.dur}</td>
                    <td className="px-2.5 py-1.5 font-mono text-brand-violet">{t.tier}</td>
                    <td className="px-2.5 py-1.5 font-mono text-white">{t.res}</td>
                    <td className="px-2.5 py-1.5 font-mono text-brand-cyan">{t.cap}</td>
                    <td className="px-2.5 py-1.5 font-mono">{t.crf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            Kotak target tiap tier: <span className="font-mono text-gray-400">1080×1920 / 720×1280 / 480×854 / 360×640</span>. Video portrait
            (9:16) diisi penuh ke kotak itu, video landscape di-scale pas tanpa dipaksa jadi portrait. Nggak pernah upscale.
          </p>
        </Section>

        {/* ----------------------------- SPESIFIKASI ------------------------ */}
        <Section icon={Cpu} title="Spesifikasi output encoder">
          <div className="grid gap-x-5 sm:grid-cols-2">
            <div>
              <SpecRow k="container" v={ENCODE_SPEC.container} />
              <SpecRow k="video codec" v={ENCODE_SPEC.video} />
              <SpecRow k="preset" v={ENCODE_SPEC.preset} />
              <SpecRow k="profile / level" v={ENCODE_SPEC.profile} />
            </div>
            <div>
              <SpecRow k="pixel format" v={ENCODE_SPEC.pixFmt} />
              <SpecRow k="frame rate" v={ENCODE_SPEC.fps} />
              <SpecRow k="audio" v={ENCODE_SPEC.audio} />
              <SpecRow k="limit kirim WA" v={`${config.waMediaLimitMb} MB (fallback ABR)`} />
            </div>
          </div>
          <div className="mt-2.5 rounded-lg border border-white/[0.06] bg-black/40 p-2.5">
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-600">x264-params</div>
            <code className="block break-all font-mono text-[11px] text-brand-cyan">{ENCODE_SPEC.x264}</code>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            Rotasi 90°/270° dideteksi dari ffprobe (tag <span className="font-mono">rotate</span> &amp; display matrix), diputer manual pakai{' '}
            <span className="font-mono">transpose</span>, lalu tag rotate dibuang — jadi video HP lu tetep tegak, bukan miring.
          </p>
        </Section>

        {/* ----------------------------- SOCKET / API ----------------------- */}
        <Section icon={Radio} title="Socket & REST yang dipakai UI ini">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
              <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-gray-600">socket.io events</div>
              <ul className="space-y-0.5 font-mono text-[10.5px] text-gray-400">
                {[
                  '→ video:process {uploadId,target,caption}',
                  '→ video:cancel {jobId}',
                  '→ video:resend {historyId,target}',
                  '→ wa:connect {method,phone,code}',
                  '← compress:progress {percent,eta,speed}',
                  '← job:stage / job:done / job:error',
                  '← wa:qr / wa:pairing / wa:connected',
                  '← history:update / cleanup:done',
                ].map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
              <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-gray-600">REST endpoints</div>
              <ul className="space-y-0.5 font-mono text-[10.5px] text-gray-400">
                {[
                  'POST /api/upload   (maks 100MB)',
                  'POST /api/process  • POST /api/cancel',
                  'POST /api/resend   • GET  /api/history',
                  'GET  /api/files/:id (HTTP Range)',
                  'GET  /api/thumbs/:id • /api/uploads/:id',
                  'GET/POST /api/wa/status|connect|pair',
                  'POST /api/wa/disconnect|logout|check',
                  'GET  /api/info • /api/storage • /api/jobs',
                ].map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Single-flight aktif: <span className="font-mono text-gray-300">{config.maxConcurrentJobs}</span> proses encode/kirim barengan (default
            1). Auto-cleanup tiap <span className="font-mono text-gray-300">{Math.round(config.cleanupIntervalMs / 60000)}</span> menit.
          </p>
        </Section>

        {/* ----------------------------- STORAGE ---------------------------- */}
        <Section
          icon={HardDrive}
          title="Penyimpanan server"
          right={
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={forceCleanup}
              disabled={sweeping}
              className="btn-ghost btn-sm ml-auto !py-1"
            >
              {sweeping ? <Loader2 size={12} className="animate-spin" /> : <Brush size={12} />}
              sapu sekarang
            </motion.button>
          }
        >
          {storage ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { k: 'uploads', v: storage.uploads },
                { k: 'hasil kompresi', v: storage.output },
                { k: 'thumbnail', v: storage.thumbs },
                { k: 'total', v: storage.total },
              ].map((s) => (
                <div key={s.k} className="rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-gray-600">{s.k}</div>
                  <div className="mt-0.5 font-mono text-[13px] font-semibold text-gray-200">{formatBytes(s.v || 0)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11.5px] text-gray-500">Nggak bisa baca info storage (server mungkin nggak ngasih akses).</p>
          )}
        </Section>

        {/* ----------------------------- TOKEN ------------------------------ */}
        <Section icon={KeyRound} title="API token (kalo server lu dikunci)">
          <div className="flex gap-2">
            <input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="X-Kyy-Token (kosongin kalo server nggak dikunci)"
              className="input font-mono text-[12px]"
            />
            <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={saveToken} className="btn-ghost btn-sm shrink-0">
              {tokenSaved ? <Check size={13} className="text-emerald-300" /> : <Save size={13} />}
              {tokenSaved ? 'kesimpen' : 'simpan'}
            </motion.button>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-gray-600">
            Disimpen di localStorage browser lu doang. Kalo <span className="font-mono">API_TOKEN</span> diset di server, semua request /api &amp;
            socket harus bawa token ini.
          </p>
        </Section>

        {/* ----------------------------- STATUS WA -------------------------- */}
        <Section icon={Terminal} title="Status koneksi WhatsApp sekarang">
          <div className="grid grid-cols-2 gap-x-5 sm:grid-cols-2">
            <SpecRow k="status" v={wa.status} />
            <SpecRow k="registered" v={String(Boolean(wa.registered))} />
            <SpecRow k="nomor" v={wa.me?.phonePretty || wa.me?.phone || '—'} />
            <SpecRow k="push name" v={wa.me?.pushName || '—'} />
            <SpecRow k="video terkirim" v={String(wa.sentCount || 0)} />
            <SpecRow k="reconnect attempt" v={String(wa.reconnectAttempt || 0)} />
          </div>
        </Section>
      </div>
    </Modal>
  );
}
