// 智能硬件输入接线：戒指（倾斜/摇动）+ 手杖（敲击/挥动）。
// 手势识别本身来自 src/vendor/wearable-input.js（工作区唯一实现，同步 + 指纹校验），
// 这里只负责「权限、按钮、把动作翻译成引擎调用」。

import { createWearableInput, WEARABLE_DEFAULTS } from '../vendor/wearable-input.js';

/**
 * @param {{
 *   onGesture: (kind: 'tap'|'shake'|'swing'|'tilt', detail: { dir?: string }) => void,
 *   buttonId?: string, statusId?: string,
 * }} opts
 */
export function bindWearable({ onGesture, buttonId = 'wearable-enable', statusId = 'wearable-status' } = {}) {
  const btn = document.getElementById(buttonId);
  const status = document.getElementById(statusId);
  const noop = { start: () => {}, stop: () => {}, supported: false, thresholds: WEARABLE_DEFAULTS };
  if (!btn || typeof window === 'undefined') return noop;

  const supported = 'DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window;
  btn.hidden = !supported;
  if (!supported) return noop;

  const setStatus = (text) => { if (status) status.textContent = text; };

  const input = createWearableInput({
    onRingTiltUp: () => onGesture?.('tilt', { dir: 'up' }),
    onRingTiltDown: () => onGesture?.('tilt', { dir: 'down' }),
    onRingTiltLeft: () => onGesture?.('tilt', { dir: 'left' }),
    onRingTiltRight: () => onGesture?.('tilt', { dir: 'right' }),
    onRingShake: () => onGesture?.('shake', {}),
    onCaneTap: () => onGesture?.('tap', {}),
    onCaneSwing: (dir) => onGesture?.('swing', { dir }),
  });

  async function enable() {
    setStatus('连接中…');
    const ok = await input.requestPermission();
    if (!ok) {
      setStatus('未授权');
      toastOnce('没拿到传感器权限，可在系统设置里打开后重试。');
      return;
    }
    input.start();
    btn.classList.add('on');
    setStatus('已连接');
    toastOnce('戒指：倾斜翻页、摇动送行；手杖：敲一下摘铜钱草。');
  }

  let hinted = false;
  function toastOnce(text) {
    if (hinted) return;
    hinted = true;
    console.info('[wearable]', text);
  }

  btn.addEventListener('click', enable, { once: true });
  return { start: enable, stop: () => input.stop(), supported, thresholds: WEARABLE_DEFAULTS };
}
