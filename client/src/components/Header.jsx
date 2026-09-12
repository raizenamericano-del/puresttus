import React from 'react';
import { motion } from 'framer-motion';
import { Plug, PlugZap, Info, FlaskConical, Wifi, WifiOff, ShieldAlert } from 'lucide-react';
import Logo, { LogoWordmark } from './Logo.jsx';
import { useAppState, connectWa, openModal, disconnectWa } from '../hooks/useAppState.js';
import { WARNING_BANNED } from '../lib/constants.js';

const STATUS_META = {
  open: { label: 'WA Nyambung', tone: 'live', icon: PlugZap, text: 'text-emerald-300' },
  connecting: { label: 'Nyambungin...', tone: 'warn', icon: Wifi, text: 'text-amber-300' },
  qr: { label: 'Tunggu Scan QR', tone: 'warn', icon: Wifi, text: 'text-amber-300' },
  pairing: { label: 'Tunggu Pairing', tone: 'warn', icon: Wifi, text: 'text-amber-300' },
  closed: { label: 'Keputus', tone: 'warn', icon: WifiOff, text: 'text-amber-300' },
  loggedOut: { label: 'Ke-logout', tone: 'bad', icon: ShieldAlert, text: 'text-rose-300' },
  idle: { label: 'Belum Nyambung', tone: 'idle', icon: Plug, text: 'text-gray-400' },
};

export function WaStatusPill({ onClick, compact = false }) {
  const { wa, config } = useAppState();
  const meta = STATUS_META[wa.status] || STATUS_META.idle;
  const Icon = meta.icon;

  if (config.mockSend) {
    return (
      <button type="button" onClick={onClick} className="pill pill-live group" title="MOCK_SEND aktif">
        <FlaskConical size={13} className="text-cyan-300" />
        <span className="text-cyan-200">Mode Uji (MOCK)</span>
        <span className="relative ml-0.5 flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
        </span>
      </button>
    );
  }

  const toneClass =
    meta.tone === 'live' ? 'pill-live' : meta.tone === 'warn' ? 'pill-warn' : meta.tone === 'bad' ? 'border-rose-400/30 bg-rose-400/10 text-rose-300' : 'pill-idle';

  return (
    <button type="button" onClick={onClick} className={`pill group ${toneClass}`} title={wa.me?.phonePretty ? `Nomor: ${wa.me.phonePretty}` : 'Klik buat sambungin WA'}>
      <Icon size={13} />
      {!compact && <span>{meta.label}</span>}
      {wa.me?.phonePretty && !compact && <span className="font-mono text-[10px] opacity-70">{wa.me.phonePretty}</span>}
      <span className="relative ml-0.5 flex h-1.5 w-1.5">
        {meta.tone === 'live' && (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </>
        )}
        {meta.tone !== 'live' && <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
      </span>
    </button>
  );
}

export default function Header() {
  const { wa, config, connected } = useAppState();

  const handleConnect = () => {
    if (wa.status === 'open' && !config.mockSend) {
      openModal('connect');
      return;
    }
    if (config.mockSend) {
      openModal('info');
      return;
    }
    connectWa('qr');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-base-900/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6">
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}>
          <LogoWordmark size={34} />
        </motion.div>

        <div className="ml-auto flex items-center gap-2">
          {/* Status koneksi socket ke server */}
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
              connected ? 'border-white/10 bg-white/[0.04] text-gray-400' : 'border-rose-400/30 bg-rose-400/10 text-rose-300'
            }`}
            title={connected ? 'Socket.io nyambung ke server' : 'Socket.io putus dari server'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {connected ? 'server live' : 'server off'}
          </span>

          <WaStatusPill onClick={handleConnect} />

          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleConnect}
            className="btn-primary btn-sm hidden sm:inline-flex"
          >
            {wa.status === 'open' || config.mockSend ? <PlugZap size={14} /> : <Plug size={14} />}
            {wa.status === 'open' ? 'Kelola WA' : config.mockSend ? 'Mode Uji' : 'Sambungkan WA'}
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.06, rotate: 4 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => openModal('info')}
            className="btn-ghost btn-sm !px-2.5"
            title="Info engine & spesifikasi encode"
            aria-label="Info"
          >
            <Info size={15} />
          </motion.button>

          <button
            type="button"
            onClick={handleConnect}
            className="btn-primary btn-sm sm:hidden"
            aria-label="Sambungkan WhatsApp"
          >
            <Plug size={14} />
          </button>
        </div>
      </div>

      {/* Warning permanen soal banned */}
      <div className="border-t border-amber-400/10 bg-gradient-to-r from-amber-500/[0.07] via-amber-400/[0.04] to-transparent">
        <div className="mx-auto flex max-w-[1240px] items-center gap-2 px-4 py-1.5 text-[11px] leading-relaxed text-amber-200/85 sm:px-6">
          <ShieldAlert size={13} className="mt-px shrink-0 text-amber-400" />
          <span>
            <b className="font-semibold text-amber-300">Peringatan:</b> {WARNING_BANNED}
          </span>
          {wa.status === 'open' && !config.mockSend && (
            <button
              type="button"
              onClick={() => disconnectWa(true)}
              className="ml-auto shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:border-rose-400/40 hover:text-rose-300"
            >
              logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
