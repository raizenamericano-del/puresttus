import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Search,
  MessageSquareText,
  History,
  X,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { useAppState, checkNumber, setLastCaption } from '../hooks/useAppState.js';
import { normalizePhone, isValidPhone, prettyPhone, maskPhone } from '../lib/format.js';

/**
 * Input nomor tujuan + caption.
 * Normalisasi live 08... -> 628..., cek onWhatsApp sebelum kirim,
 * dan chip nomor yang terakhir dipakai.
 *
 * (c) KyyDevv
 */
export default function TargetInput({
  target,
  setTarget,
  caption,
  setCaption,
  disabled = false,
  showCaption = true,
}) {
  const { wa, config, state: appState } = useAppState();
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null); // {exists, reason, phonePretty}
  const [showCaptionBox, setShowCaptionBox] = useState(Boolean(caption));

  const normalized = useMemo(() => normalizePhone(target), [target]);
  const valid = isValidPhone(normalized);
  const needsWa = !config.mockSend;

  useEffect(() => {
    setCheckResult(null);
  }, [normalized]);

  useEffect(() => {
    if (!appState.lastTarget && !target) setTarget(appState.lastTarget || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCheck = async () => {
    if (!valid) return;
    setChecking(true);
    setCheckResult(null);
    const res = await checkNumber(normalized);
    setChecking(false);
    if (!res) return;
    setCheckResult({
      exists: Boolean(res.exists),
      reason: res.reason || (res.exists ? 'OK' : 'TIDAK_TERDAFTAR'),
      phonePretty: res.phonePretty || prettyPhone(normalized),
      mock: Boolean(res.mock),
      error: res.error || null,
    });
  };

  const statusTone = !normalized
    ? 'idle'
    : !valid
      ? 'bad'
      : checkResult
        ? checkResult.exists
          ? 'good'
          : 'bad'
        : 'ok';

  const borderClass = {
    idle: 'border-white/10 focus-within:border-brand-violet/60',
    ok: 'border-white/10 focus-within:border-brand-violet/60',
    good: 'border-emerald-400/40 focus-within:border-emerald-400/70',
    bad: 'border-rose-400/40 focus-within:border-rose-400/70',
  }[statusTone];

  return (
    <div className="space-y-3">
      {/* ---------------- nomor tujuan ---------------- */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label !mb-0" htmlFor="kyy-target">
            Kirim ke nomor
          </label>
          {config.mockSend && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300">
              <ShieldCheck size={11} /> mode uji — nggak beneran dikirim
            </span>
          )}
        </div>

        <div className={`flex items-center gap-2 rounded-xl border bg-base-900/70 px-3 py-2 transition-colors ${borderClass}`}>
          <Phone size={15} className="shrink-0 text-gray-500" />
          <input
            id="kyy-target"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={disabled}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value.replace(/[^0-9+\-\s()]/g, '').slice(0, 20));
              setLastCaption(caption || '');
            }}
            placeholder="081234567890 atau 6281234567890"
            className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-gray-100 placeholder:font-sans placeholder:text-gray-600 focus:outline-none disabled:opacity-50"
          />

          <AnimatePresence mode="wait">
            {normalized && valid && (
              <motion.span
                key="pretty"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                className="hidden shrink-0 rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-gray-400 sm:inline"
                title="Format yang dikirim ke server"
              >
                → {prettyPhone(normalized)}
              </motion.span>
            )}
          </AnimatePresence>

          {needsWa && valid && (
            <motion.button
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={runCheck}
              disabled={checking || wa.status !== 'open' || disabled}
              className="btn-ghost btn-sm shrink-0 !py-1.5 disabled:opacity-40"
              title={wa.status === 'open' ? 'Cek nomor ini beneran ada di WhatsApp atau nggak' : 'Sambungin WA dulu buat bisa ngecek'}
            >
              {checking ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              cek
            </motion.button>
          )}
        </div>

        {/* feedback */}
        <div className="mt-1.5 min-h-[18px] text-[11px] leading-snug">
          {!normalized && <span className="text-gray-600">Nomor lu sendiri juga boleh — biar bisa langsung diterusin ke Status.</span>}
          {normalized && !valid && (
            <span className="inline-flex items-center gap-1 text-rose-300">
              <CircleAlert size={11} /> Nomornya kependekan/kepanjangan bro.
            </span>
          )}
          {valid && !checkResult && !checking && (
            <span className="text-gray-500">
              Format aman → <span className="font-mono text-gray-400">{maskPhone(normalized)}</span>
              {needsWa ? ' • klik "cek" buat mastiin nomornya punya WA' : ''}
            </span>
          )}
          {checking && (
            <span className="inline-flex items-center gap-1.5 text-brand-cyan">
              <Loader2 size={11} className="animate-spin" /> Nanya ke server WhatsApp...
            </span>
          )}
          {checkResult && checkResult.exists && (
            <motion.span initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1 text-emerald-300">
              <CheckCircle2 size={11} />
              {checkResult.mock ? 'Mode uji: nomor dianggap valid ✅' : `Mantap, ${checkResult.phonePretty} terdaftar di WhatsApp ✅`}
            </motion.span>
          )}
          {checkResult && !checkResult.exists && (
            <motion.span initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1 text-rose-300">
              <CircleAlert size={11} />
              {checkResult.error
                ? checkResult.error
                : checkResult.reason === 'FORMAT_SALAH'
                  ? 'Format nomornya salah bro.'
                  : 'Nomor ini nggak terdaftar di WhatsApp. Cek lagi ya.'}
            </motion.span>
          )}
        </div>
      </div>

      {/* ---------------- nomor terakhir ---------------- */}
      {appState.recentTargets?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-gray-600">
            <History size={11} /> terakhir
          </span>
          {appState.recentTargets.slice(0, 5).map((t) => (
            <motion.button
              key={t.phone}
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={disabled}
              onClick={() => setTarget(t.phone)}
              className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-gray-400 transition-colors hover:border-brand-violet/40 hover:text-white disabled:opacity-40"
            >
              {t.pretty || prettyPhone(t.phone)}
            </motion.button>
          ))}
        </div>
      )}

      {/* ---------------- caption ---------------- */}
      {showCaption && (
        <div>
          {!showCaptionBox ? (
            <button
              type="button"
              onClick={() => setShowCaptionBox(true)}
              className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 transition-colors hover:text-brand-cyan"
            >
              <MessageSquareText size={12} /> tambahin caption (opsional)
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="relative">
              <textarea
                value={caption}
                disabled={disabled}
                maxLength={200}
                rows={2}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={() => setLastCaption(caption)}
                placeholder="Caption singkat, misal: 'HD nih bos 🔥'"
                className="input resize-none pr-16 font-sans text-[13px]"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <span className="font-mono text-[10px] text-gray-600">{caption.length}/200</span>
                <button
                  type="button"
                  onClick={() => {
                    setCaption('');
                    setShowCaptionBox(false);
                  }}
                  className="rounded p-0.5 text-gray-600 transition-colors hover:text-rose-300"
                  title="Buang caption"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-600">
                <Smartphone size={10} /> Caption nempel di chat — pas diterusin ke Status, caption-nya ikut.
              </p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
