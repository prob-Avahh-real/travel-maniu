#!/usr/bin/env node
// 浏览器冒烟测试：真开一个 headless Chrome，加载页面，检查
//   1) 控制台没有异常
//   2) 手绘画布真的画出了东西（像素颜色有分布）
//   3) 六个面板都能打开、都有内容
//   4) 摘铜钱草 / 买 / 装 / 送 这条主流程能走通
// 输出 PASS/FAIL 与被观测到的事实，不做任何猜测。
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5199;
const CDP = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error('chrome not found');
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  const profile = '/tmp/maniu-smoke-profile';
  fs.rmSync(profile, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${CDP}`, '--remote-allow-origins=*',
    `--window-size=390,844`, `http://127.0.0.1:${PORT}/`,
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { server.kill('SIGKILL'); } catch {} };
  process.on('exit', cleanup);

  const targets = await waitFor(`http://127.0.0.1:${CDP}/json/list`);
  const page = targets.find((t) => t.type === 'page' && t.url.includes(String(PORT)));
  if (!page) throw new Error('page target not found');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error')); });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`exception: ${d.exception?.description || d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      errors.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, (msg) => res(msg.result));
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result.value;
  };

  await send('Runtime.enable');
  await sleep(2200); // let the module boot + a few animation frames run

  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); };

  check('boot: no console errors', errors.length === 0, errors.join(' | ').slice(0, 300));

  const canvasPainted = await evaluate(`(() => {
    const c = document.getElementById('scene');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4000) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
    return seen.size;
  })()`);
  check('scene: canvas has hand-drawn content', canvasPainted > 6, `${canvasPainted} distinct sampled colours`);

  const hud = await evaluate(`document.getElementById('clover-count').textContent + ' / ' + document.getElementById('ready-count').textContent`);
  check('hud: clover + patch counters render', /🪙 \d+/.test(hud) && /成熟 \d+\/\d+/.test(hud), hud);

  const navs = await evaluate(`Array.from(document.querySelectorAll('.nav-btn')).map(b => b.dataset.sheet).join(',')`);
  const sheetChecks = [];
  for (const name of navs.split(',')) {
    const n = await evaluate(`(async () => {
      document.querySelector('.nav-btn[data-sheet="${name}"]').click();
      await new Promise(r => setTimeout(r, 260));
      const body = document.getElementById('sheet-body');
      const title = document.getElementById('sheet-title').textContent;
      const kids = body.children.length;
      document.getElementById('sheet-close').click();
      return { title, kids };
    })()`);
    sheetChecks.push(`${name}:${n.title}(${n.kids})`);
    check(`sheet: ${name} opens with content`, n.kids > 0, `${n.title} · ${n.kids} nodes`);
  }

  // main loop: pick clovers → buy → pack → send
  const flow = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const clover = () => document.getElementById('clover-count').textContent;
    const before = clover();
    document.getElementById('btn-pick').click();
    await wait(320);
    const after = clover();

    document.querySelector('.nav-btn[data-sheet="shop"]').click();
    await wait(260);
    const buyBtn = document.querySelector('#sheet-body button[data-act="buy"]:not([disabled])');
    const bought = buyBtn ? buyBtn.closest('.row').querySelector('.name').textContent : null;
    if (buyBtn) buyBtn.click();
    await wait(260);

    document.querySelector('.nav-btn[data-sheet="luggage"]').click();
    await wait(260);
    const packBtn = document.querySelector('#sheet-body button[data-act="pack"]');
    const packed = packBtn ? packBtn.closest('.row').querySelector('.name').textContent : null;
    if (packBtn) packBtn.click();
    await wait(260);

    const sendBtn = document.querySelector('#sheet-body button[data-act="send"]');
    const canSend = Boolean(sendBtn);
    if (sendBtn) sendBtn.click();
    await wait(320);
    const status = document.getElementById('maniu-status').textContent;
    return { before, after, bought, packed, canSend, status };
  })()`);
  check('flow: picking clovers increases the count', flow.before !== flow.after, `${flow.before} → ${flow.after}`);
  check('flow: shop purchase is offered and works', Boolean(flow.bought), flow.bought || 'no affordable item');
  check('flow: bought item can be packed', Boolean(flow.packed), flow.packed || 'nothing to pack');
  check('flow: 送它出门 puts 马牛 on the road', flow.canSend && /在路上|在/.test(flow.status), `status="${flow.status.trim()}"`);

  // persistence: reload and confirm the save survives
  const beforeReload = await evaluate(`document.getElementById('clover-count').textContent`);
  await evaluate(`location.reload()`);
  await sleep(2000);
  const afterReload = await evaluate(`document.getElementById('clover-count').textContent`);
  check('save: state survives a reload', beforeReload === afterReload, `${beforeReload} → ${afterReload}`);

  // watch / smart-hardware target: 300x300 viewport must degrade gracefully
  await send('Emulation.setDeviceMetricsOverride', { width: 300, height: 300, deviceScaleFactor: 2, mobile: true });
  await evaluate(`location.reload()`);
  await sleep(2000);
  const watch = await evaluate(`(() => {
    const visible = (el) => el && getComputedStyle(el).display !== 'none';
    const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
    const tabs = document.querySelector('.tabs');
    const c = document.getElementById('scene');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4000) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
    const pick = document.getElementById('btn-pick');
    return {
      navVisible: navBtns.filter(visible).length,
      tabsVisible: visible(tabs),
      colours: seen.size,
      pickVisible: visible(pick),
      stageH: document.getElementById('stage').clientHeight,
      pickH: document.getElementById('btn-pick').offsetHeight,
      canvas: c.width + 'x' + c.height,
    };
  })()`);
  check('watch: only three nav entries remain', watch.navVisible === 3, `${watch.navVisible} visible`);
  check('watch: room/garden tabs are hidden', watch.tabsVisible === false, String(watch.tabsVisible));
  check('watch: scene canvas still paints', watch.colours > 6, `${watch.colours} colours @ ${watch.canvas}`);
  check('watch: primary action stays reachable', watch.pickVisible === true, String(watch.pickVisible));
  check('watch: stage gets most of the screen', watch.stageH >= 160, `stage ${watch.stageH}px of 300`);
  check('a11y: primary action is a >=44px target', watch.pickH >= 44, `${watch.pickH}px`);
  await send('Emulation.clearDeviceMetricsOverride');

  // accessibility: prefers-reduced-motion freezes the hand-drawn "boiling line"
  const frameHash = () => evaluate(`(() => {
    const c = document.getElementById('scene');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 977) h = (h * 31 + d[i] * 7 + d[i+1] * 3 + d[i+2]) >>> 0;
    return h;
  })()`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(200);
  const still1 = await frameHash();
  await sleep(700);
  const still2 = await frameHash();
  check('a11y: reduced-motion freezes the boiling line', still1 === still2, `${still1} vs ${still2}`);
  await send('Emulation.setEmulatedMedia', { features: [] });

  check('runtime: still no console errors after interaction', errors.length === 0, errors.join(' | ').slice(0, 300));
  const stillFailing = results.filter((r) => !r.ok);
  log(`\n# smoke: ${results.length - stillFailing.length}/${results.length} checks passed`);
  log(`METRIC smoke_pass=${results.length - stillFailing.length}`);
  log(`METRIC smoke_fail=${stillFailing.length}`);
  ws.close();
  cleanup();
  process.exit(stillFailing.length ? 1 : 0);
}

main().catch((e) => { console.error('smoke failed:', e.message); process.exit(1); });
