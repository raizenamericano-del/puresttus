/**
 * Logger ringkas bergaya pino tanpa dependency berat di jalur panas.
 * Output warna buat dev, plain JSON-ish buat produksi.
 */
'use strict';

const config = require('../config');

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  violet: '\x1b[38;5;141m',
};

const LEVEL_COLOR = {
  info: COLORS.cyan,
  warn: COLORS.yellow,
  error: COLORS.red,
  debug: COLORS.dim,
  ok: COLORS.green,
  wa: COLORS.violet,
  ff: COLORS.magenta,
};

const pad = (s, n) => String(s).padEnd(n, ' ').slice(0, n);

function stamp() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function write(level, scope, args) {
  const color = LEVEL_COLOR[level] || COLORS.blue;
  const prefix = `${COLORS.dim}${stamp()}${COLORS.reset} ${color}${pad(level.toUpperCase(), 5)}${COLORS.reset} ${COLORS.dim}${pad(scope, 10)}${COLORS.reset}`;
  const line = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');

  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${prefix} ${line}\n`);
}

const make = (scope) => ({
  info: (...a) => write('info', scope, a),
  warn: (...a) => write('warn', scope, a),
  error: (...a) => write('error', scope, a),
  debug: (...a) => {
    if (!config.isProd) write('debug', scope, a);
  },
  ok: (...a) => write('ok', scope, a),
  wa: (...a) => write('wa', scope, a),
  ff: (...a) => write('ff', scope, a),
});

const logger = make('kyypure');

logger.scope = make;
logger.child = make;

module.exports = logger;
