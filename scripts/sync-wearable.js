#!/usr/bin/env node
// 把工作区里唯一的输入实现（active/air-shared/wearable-input.js）落到本工程内，并盖上
// 内容指纹。浏览器里没有打包器，运行时不可能 import 到工程外的文件，所以用「同步 + 指纹」
// 代替复制粘贴：脚本负责搬运，规格条款负责抓 drift。
//
// 用法：node scripts/sync-wearable.js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL_SOURCE = '../air-shared/wearable-input.js';
const SOURCE = path.resolve(ROOT, REL_SOURCE);
const TARGET = path.join(ROOT, 'src/vendor/wearable-input.js');
const stamp = path.join(ROOT, 'src/vendor/VENDOR.json');

if (!fs.existsSync(SOURCE)) {
  console.error(`canonical source missing: ${SOURCE}`);
  process.exit(1);
}

const body = fs.readFileSync(SOURCE, 'utf8');
const sha = crypto.createHash('sha256').update(body).digest('hex');

const header = [
  '// ─────────────────────────────────────────────────────────────────────────────',
  `// vendored-from: ${REL_SOURCE}`,
  `// payload-sha256: ${sha}`,
  '// DO NOT EDIT. Re-sync with: node scripts/sync-wearable.js',
  '// ─────────────────────────────────────────────────────────────────────────────',
  '',
].join('\n');

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, header + body);
fs.writeFileSync(stamp, JSON.stringify({
  source: REL_SOURCE,
  target: 'src/vendor/wearable-input.js',
  payloadSha256: sha,
  syncedAt: new Date().toISOString().slice(0, 10),
  note: 'payloadSha256 covers the canonical file byte-for-byte; the vendored file adds the header above.',
}, null, 2) + '\n');

console.log(`synced ${REL_SOURCE} → src/vendor/wearable-input.js (${sha.slice(0, 12)}…)`);
