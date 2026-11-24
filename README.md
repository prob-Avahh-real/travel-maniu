# travel-maniu（旅行马牛）

手绘风放置收集游戏：一只 **马头牛角** 的旅伴独自出门旅行，带回明信片与特产。
机制复刻《旅行青蛙》，但全要素中国化：摘**铜钱草**当盘缠 → 买**馒头**等干粮 → 备行囊 → 自己出发，
走遍**东海灯塔 / 茶卡盐湖 / 漠河极光 / 舟山群岛**等中国风地点 → 归来收集 → 招待访客 → 离线推进。

## Target

- **移动端（主）**：Capacitor + Android 工程（`android/`，appId `com.maniu.travel`）。
- **智能硬件**：手表窄屏布局（`@media (max-width: 320px)`）+ 戒指/手杖输入（`src/ui/wearable.js`，
  实现同步自 `active/air-shared/wearable-input.js` 并带指纹校验）。
- **不做**：纯网页交付。`index.html` 只是本地跑法与真机同源的构建产物。

## 快速开始

```bash
npm run dev            # http://localhost:5177  零依赖静态服务
npm test               # 核心逻辑单元测试（node --test）
npm run conformance    # 规格一致性逐条报告
npm run measure        # 一次完整度量（syntax → conformance → tests）
node scripts/smoke.js  # 真浏览器冒烟：无异常 / 有画面 / 六个面板 / 主流程 / 存档
npm run build          # 产出 www/ 并同步到 android/app/src/main/assets/public
```

Android：`cd android && ./gradlew assembleDebug`。

## 玩法要点

- **天气**：晴 / 风 / 雨，由时间纯函数决定（6 小时一换）。雨天没带斗笠会提前折返（行程 ×0.72），
  顺风天走得更久（×1.08）；雨天带着斗笠照常赶路，还能多带一件特产。
- **探索链**：地点按 `unlockAfter` 解锁；干粮越好，去的地方越远（近处永远可达，不会走进死路）。
- **收集**：相册分「收集（每种明信片一张记录，无上限增长）」与「最近旅程时间线（有上限）」两套视图。

## 结构

```
src/core/    纯逻辑，无 DOM：rng / config / state(存档+迁移) / economy / trip / visitors / titles / engine(时钟)
src/data/    内容即配置：16 个地点（32 张明信片 + 特产）、物品、访客、称号
src/render/  手绘渲染：ink(墨线原语) / scenes(房间·庭院·明信片·地图) / maniu(马牛本体)
src/ui/      界面绑定：屏幕、面板、离线补算、存档时机
spec/        规格：每条都是可机检的行为断言，权重构成主指标 conformance
tests/       conformance.mjs（主指标）+ core.test.js（单元）
scripts/     build-web.js / serve.js / smoke.js
.auto/       自动驾驶实验会话（prompt.md / measure.sh / ideas.md）
```

## 设计要点

- **抽象与信息隐蔽**：`src/core` 只吃「注入的 rng 与时钟」，不碰 DOM、不读系统时间；
  界面层只会「读状态 → 画」「点按 → 调动作」，不含游戏规则。
- **可扩展**：加一个地点 = 在 `data/spots.js` 加一条；加一种道具 = 在 `data/items.js` 加一条；
  加一个面板 = 在 `index.html` 加 `data-sheet` + `SHEETS` 加一个函数（有静态检查守着）。
- **确定性**：同一存档 + 同一操作序列必然得到同一结果（有专门的规格条款与单测）。
- **离线优先**：零外链、零图片素材，手绘风格完全由代码生成；回到前台自动补算离线进度。
- **可诊断**：失败返回 `{ ok:false, reason }`，规格条款失败会打印 clauses + 名称。

## 已知限制

- 时间默认真实流速（点右上角 `⋯` 可切 ×8 / ×60 演示）。
- 手表端目前只保留「状态 + 庭院 + 摘铜钱草 + 三块面板」。
- 智能硬件输入已实现但**未真机验证**（阈值沿用 air-shared 约定）。
- `android/` 的 Gradle 发行包需要联网下载，本机缓存为空壳，`./gradlew assembleDebug` 暂时跑不了；
  替代传感器是 `ui.capacitor-ready` 与 `ui.shipped-assets-match`（打进包里的资源逐字节比对）。
