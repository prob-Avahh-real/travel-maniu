#!/usr/bin/env node
// Copy the web build into www/ for Capacitor.
// Keeps the shipped game byte-identical to what the browser runs — no bundler,
// no transforms, so `index.html` stays the single source of truth.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const ENTRIES = ['index.html', 'src'];

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const entry of ENTRIES) {
  const from = path.join(ROOT, entry);
  if (!fs.existsSync(from)) throw new Error(`missing ${entry}`);
  fs.cpSync(from, path.join(WWW, entry), { recursive: true });
}

const assets = path.join(ROOT, 'android/app/src/main/assets/public');
if (fs.existsSync(path.dirname(assets))) {
  fs.rmSync(assets, { recursive: true, force: true });
  fs.cpSync(WWW, assets, { recursive: true });
  console.log('synced → android/app/src/main/assets/public');
}

const count = (function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce(
    (a, e) => a + (e.isDirectory() ? walk(path.join(dir, e.name)) : 1), 0);
})(WWW);
console.log(`built www/ (${count} files)`);
