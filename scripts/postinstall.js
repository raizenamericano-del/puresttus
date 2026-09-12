#!/usr/bin/env node
/**
 * Postinstall root: pasang dependency client otomatis biar `npm install` doang
 * udah cukup buat deploy (Railway / Docker build).
 *
 * (c) KyyDevv
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const clientDir = path.join(root, 'client');
const clientPkg = path.join(clientDir, 'package.json');
const clientModules = path.join(clientDir, 'node_modules');

function log(msg) {
  process.stdout.write(`\x1b[38;5;141m[postinstall]\x1b[0m ${msg}\n`);
}

if (!fs.existsSync(clientPkg)) {
  log('client/package.json nggak ada — skip.');
  process.exit(0);
}

const alreadyInstalled = fs.existsSync(clientModules) && fs.readdirSync(clientModules).length > 5;
if (alreadyInstalled && process.env.FORCE_CLIENT_INSTALL !== '1') {
  log('client/node_modules udah ada — skip install (set FORCE_CLIENT_INSTALL=1 buat maksa).');
  process.exit(0);
}

log('installing client dependencies...');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = ['install', '--no-audit', '--no-fund', '--loglevel=error'];
if (process.env.CI === 'true') args.push('--prefer-offline');

const result = spawnSync(npmCmd, args, {
  cwd: clientDir,
  stdio: 'inherit',
  env: { ...process.env, npm_config_ignore_scripts: '' },
});

if (result.status !== 0) {
  log(`WARN: install client gagal (exit ${result.status}). Jalanin manual: npm --prefix client install`);
  // Jangan gagal-in build root — server tetep bisa jalan tanpa frontend.
  process.exit(0);
}

log('client dependencies siap ✅');
