# AGENTS.md — travel-maniu（旅行马牛）

> 本文件是本工程的 Harness 说明：用途、Target 判定、验收方式、扩展点、禁区。
> 根 `AGENTS.md` 的通用/设计/分阶段/Harness/Loop 规则在此之上继续适用。

## 1. 用途与 Target 判定

| 项 | 判定 | 说明 |
|----|------|------|
| 用途 | 放置收集类单机游戏 | 旅行青蛙式：备行囊 → 自动出行 → 明信片/特产收集 → 离线推进 |
| 移动端（Android APK） | **主 Target** | Capacitor 工程在 `android/`，`npm run build` 把 web 产物同步进 `assets/public` |
| 智能硬件（手表） | **次 Target（已落地）** | `@media (max-width: 320px)` 精简布局；`src/ui/wearable.js` 接戒指/手杖输入 |
| 纯网页交付 | **na** | `index.html` 只是本地跑法与真机同源的构建产物，不作为交付形态 |
| iOS | optional | 未建工程；如需，用同一 `www/` 走 Capacitor ios 流程 |

## 2. 命令

```bash
npm test                  # 单元测试（node --test）
npm run conformance       # 逐条规格报告（主指标）
npm run measure           # build + syntax + conformance + tests
node scripts/smoke.js     # 真浏览器冒烟（headless Chrome + CDP）
npm run dev               # 本地静态服务 :5177
npm run build             # www/ + android assets 同步
```

## 3. 架构不变量（务必遵守）

1. `src/core/**` 必须是纯逻辑：不含 `document/window/localStorage`、不读 `Date.now()`、
   不用 `Math.random()`。时间与随机都从外部注入（有单测与规格条款守着）。
2. 界面层只做两件事：**读状态 → 画**，**点按 → 调引擎动作**。游戏规则一律放 `src/core`。
3. 新增内容优先改数据（`src/data/*.js`），不要在主循环里加 `if`。
4. 失败一律返回 `{ ok:false, reason }`，禁止静默把失败当成功。
5. 零外部资源、零网络请求：手绘风格必须由代码生成（`src/render/ink.js`）。
6. 确定性：同一存档 + 同一操作序列 ⇒ 同一结果（`trip.determinism`）。

## 4. 如何新增

| 想加什么 | 改哪里 | 会被哪个传感器抓到 |
|----------|--------|--------------------|
| 一个新地点 | `src/data/spots.js` 加一条（含 `postcards/souvenirs/unlockAfter`） | `data.*`、`render.matrix-draws`、`trip.unlock-chain` |
| 一件新道具/干粮 | `src/data/items.js` 加一条（含 `effect` 契约） | `econ.shop.prices`、`balance.rhythm` |
| 一位访客 | `src/data/visitors.js`（含 `favours/gift/rareGift`） | `visitor.*`、`render.matrix-draws` |
| 一个称号 | `src/core/titles.js` 的 `TITLES` 加一条断言 | `titles.*` |
| 一个界面面板 | `index.html` 加 `data-sheet` + `src/ui/app.js` 的 `SHEETS` 加函数 | `ui.sheets-wired` |
| 一条新的游戏规则 | `src/core/*` + `spec/mechanics.json` 加条款 + `tests/conformance.mjs` 加检查 | 主指标本身 |

**规则：加功能必须同时加一条规格条款。** 规格就是本工程的 Done 定义。

## 5. 验收（Done 判定）

一次改动算完成，需要同时满足：

1. `METRIC syntax_errors=0`
2. `METRIC build_ok=1`
3. `METRIC conformance` 不低于改动前（低于就是回归）
4. `METRIC tests_fail=0`、`METRIC clauses_unimplemented=0`
5. `node scripts/smoke.js` 全绿（真浏览器里能开、能画、能走主流程、能存读档）
6. 新功能带新条款；新条款必须真跑逻辑，不能靠豁免通过

## 6. 已知限制（诚实记录）

- `android/` 的 Gradle wrapper 需要联网下载 gradle-8.2.1 发行包；本机缓存是空壳，
  因此 `./gradlew assembleDebug` 目前**无法在本机验证**。等价替代传感器：
  `ui.capacitor-ready` + `ui.shipped-assets-match`（逐字节比对打进包里的资源）。
  解封条件：能访问 `services.gradle.org` 时跑一次 `./gradlew assembleDebug`。
- 智能硬件输入目前是「有实现但未真机验证」：`src/ui/wearable.js` 的阈值沿用
  `active/air-shared/wearable-input.js` 的约定（戒指倾斜 >5°、摇动 >20°；手杖加速度 >8、挥动 >3）。
- 时间默认真实流速；演示可切 ×8 / ×60。

## 7. 会话与实验

- 度量脚本：`.auto/measure.sh`；实验手册与「试过什么」：`.auto/prompt.md`。
- 未做但值得做：`.auto/ideas.md`。
