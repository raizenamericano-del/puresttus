import React from 'react';
import { Heart, ShieldAlert, Github, Cpu, Film } from 'lucide-react';
import Logo from './Logo.jsx';
import { useAppState } from '../hooks/useAppState.js';
import { WARNING_BANNED, ENCODE_SPEC } from '../lib/constants.js';

/**
 * Footer: kredit KyyDevv + disclaimer + spek singkat.
 * (c) KyyDevv
 */
export default function Footer() {
  const { config, wa } = useAppState();

  return (
    <footer className="relative mt-14 border-t border-white/[0.06] bg-base-900/60 backdrop-blur-xl">
      <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* brand */}
          <div>
            <div className="flex items-center gap-2.5">
              <Logo size={30} />
              <div>
                <div className="text-[14px] font-extrabold tracking-tight text-white">
                  Kyy<span className="text-gradient">Pure</span>Status
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-600">{config.branding?.tagline}</div>
              </div>
            </div>
            <p className="mt-3 max-w-sm text-[12px] leading-relaxed text-gray-500">
              Video lu dikompres di server pakai ladder adaptif berbasis durasi, dijaga orientasinya, dibates bitrate-nya, terus otomatis
              dilempar ke WhatsApp lu. Hasil terusan ke Status jadi tetep tajem — nggak buram kayak biasanya.
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-gray-500">
              Made with <Heart size={11} className="text-brand-fuchsia" /> by{' '}
              <b className="text-gradient">KyyDevv</b>
              <span className="text-gray-700">•</span>
              <span className="font-mono text-[10.5px] text-gray-600">v1.0.0</span>
            </p>
          </div>

          {/* spek */}
          <div>
            <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
              <Cpu size={12} className="text-brand-violet" /> mesin
            </h4>
            <ul className="space-y-1 text-[11.5px] text-gray-500">
              <li className="font-mono">{ENCODE_SPEC.video} • {ENCODE_SPEC.preset}</li>
              <li className="font-mono">{ENCODE_SPEC.profile}</li>
              <li className="font-mono">{ENCODE_SPEC.fps} • {ENCODE_SPEC.pixFmt}</li>
              <li className="font-mono">{ENCODE_SPEC.audio}</li>
              <li className="font-mono text-brand-cyan">limit {config.waMediaLimitMb}MB → fallback ABR</li>
            </ul>
          </div>

          {/* status */}
          <div>
            <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
              <Film size={12} className="text-brand-cyan" /> runtime
            </h4>
            <ul className="space-y-1 text-[11.5px] text-gray-500">
              <li>
                mode: <span className="font-mono text-gray-300">{config.mockSend ? 'MOCK_SEND (uji)' : 'LIVE Baileys'}</span>
              </li>
              <li>
                wa: <span className="font-mono text-gray-300">{wa.status}</span>
              </li>
              <li>
                upload maks: <span className="font-mono text-gray-300">{config.maxUploadMb}MB</span>
              </li>
              <li>
                riwayat: <span className="font-mono text-gray-300">{config.historyLimit} terakhir</span>
              </li>
              <li>
                auto-cleanup: <span className="font-mono text-gray-300">tiap {Math.round(config.cleanupIntervalMs / 60000)} menit</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-200/70">
            <ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-400" />
            <span>
              <b className="text-amber-300">Disclaimer:</b> {WARNING_BANNED} Proyek ini nggak berafiliasi dengan WhatsApp/Meta. Pakai dengan
              risiko lu sendiri, jangan spam, jangan buat yang aneh-aneh.
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-gray-600 sm:ml-auto">
            <Github size={11} /> Baileys • FFmpeg • React • Express • Socket.io
          </span>
        </div>
      </div>
    </footer>
  );
}
