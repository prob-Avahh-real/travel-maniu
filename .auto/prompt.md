# Autoresearch: 旅行马牛（手绘风 · 旅行青蛙机制）

## Objective

Build a hand-drawn, offline-first, mobile+watch game in which the player raises
一只「马头牛角」的旅伴 **马牛**, replicating the mechanics of 《旅行青蛙》:

采摘铜钱草 → 商店买东西 → 备行囊（干粮 / 道具 / 护身符）→ 马牛自己出发 →
归来带回手绘明信片与特产 → 收集相册 / 特产 / 称号 → 招待上门访客换礼物 →
离线也在推进。

The workload being optimized is **spec conformance**: how much of the
Travel-Frog mechanic space the core engine actually implements, measured by
`spec/mechanics.json` evaluated against the real engine (not mocks).

## Metrics

- **Primary**: `conformance` (points, higher is better) — weighted sum of passing
  clauses in `spec/mechanics.json`. Max = 150. A clause with no implementation
  counts as 0, so the metric is also the to-do list.
- **Secondary**:
  - `build_ok` — the shipped bundle + android assets sync successfully
  - `smoke_pass` / `smoke_fail` — real headless-Chrome run (`node scripts/smoke.js`).
  - `conformance_pct` — percentage of spec covered (direction / context)
  - `clauses_unimplemented` — must stay 0 (harness completeness)
  - `tests_pass` / `tests_fail` — `node --test tests/`
  - `src_kb`, `core_loc` — size (guards against bloating the core to game the spec)
  - `syntax_errors` — must be 0

## How to Run

`bash .auto/measure.sh` — emits `METRIC name=number` lines.
`npm run conformance` — verbose per-clause + per-group report.

## Files in Scope

| Path | What it does |
|------|--------------|
| `src/core/*.js` | Pure logic: rng, config, weather, state/save+migration, economy, trip, visitors, titles, engine (time loop). No DOM. |
| `src/data/*.js` | Content as configuration: spots/postcards/souvenirs, items, visitors. |
| `src/render/*.js` | Hand-drawn rendering (procedural ink strokes, scenes, the 马牛 creature). |
| `src/ui/*.js`, `src/ui/style.css` | Screens, layout, mobile + watch breakpoints. |
| `index.html` | Entry point (must stay dependency-free / offline). |
| `spec/mechanics.json` | The specification. Adding a clause is a valid experiment. |
| `tests/*.mjs`, `tests/*.test.js` | Conformance harness + unit tests. |
| `capacitor.config.json`, `android/` | Mobile target packaging. |

## Off Limits

- Don't weaken a conformance check to make it pass. If a clause is wrong,
  argue it in the commit message and change the spec deliberately.
- Don't add runtime dependencies to `src/` — the game must run offline from
  `index.html` with zero external assets (a clause checks this).
- Don't put browser APIs (`document`, `window`, `localStorage`) into `src/core`.
- Don't touch other projects in this repo.

## Verification layers (don't confuse them)

| Layer | Command | Covers |
|-------|---------|--------|
| Spec conformance | `.auto/measure.sh` | every game rule, data integrity, render determinism, balance bot, perf |
| Unit tests | `npm test` | invariants of rng/economy/trip/tick/save/data |
| Browser smoke | `node scripts/smoke.js` | boots clean, canvas really paints, all 6 sheets, full main loop, save/reload, watch layout at 300×300 |
| Android build | `cd android && ./gradlew assembleDebug` | BLOCKED offline (gradle dist not cached). Substituted by `ui.capacitor-ready` + `ui.shipped-assets-match` |

## Constraints

- `syntax_errors` must be 0; `clauses_unimplemented` must be 0.
- `npm test` (node --test) must not regress.
- Determinism: same seed + same input sequence ⇒ identical state. Never use
  `Math.random()` or `Date.now()` inside `src/core`.
- Mobile-first: iPhone/Android widths AND a watch breakpoint (≤320px).
- Offline-first: no network, no image assets — the hand-drawn look must be
  generated in code.

## Sensor hygiene

Before trusting a green run, **mutate the feature and confirm the clause goes red**.
Proven this session:
- removing `weatherFactor` from `planTrip` → `weather.rain-shortens` + `weather.hat-cancels-rain` fail
- removing the rain+hat souvenir bonus → `weather.hat-bonus` fails
- (a `hat-cancels-rain` written as an equality-only check passed vacuously — fixed by also
  asserting the bare-rain penalty exists)

## What's Been Tried

- **Iteration 2 (2026-07-18)**: spec 150 → 198 → 206; UI + hand-drawn renderer + mobile/watch target.
  - *Sensor win*: the browser smoke test found `POSTCARDS_BY_ID`/`SOUVENIRS_BY_ID` were built as
    1-element arrays (flatMap/map mistake). Unit tests hadn't noticed because nothing asserted the
    index shape. Added `data.index-objects`.
  - *Design bug*: a tier-4 snack had a tier window of [3,4], so a player holding only good food and
    no unlocked far spots could not depart at all (the greedy bot sat still for 120 days). Fixed:
    reachability is always [1,max]; good food only *biases* the destination roll (`tierAffinity`).
  - *Memory bug*: `album` was an append-only trip log that grew forever (365 entries in a year).
    Split into a capped timeline (`album`, 200) + bounded `collection` (one record per postcard),
    with a v1→v2 save migration. Added `save.album-bounded`, `save.migrates-v1`.
  - *Anti-drift*: the wearable input implementation is vendored from `active/air-shared` via
    `scripts/sync-wearable.js` with a sha256 fingerprint, and `vendor.input-not-drifted` fails if the
    copy is edited locally or the upstream moves on.
  - *Calibration*: `trip.snack-affinity` initially demanded meanTier > 3.0 for 松茸饭 (actual 2.91).
    Rewrote it as the real property — strictly increasing mean tier across the four snacks.
- **Iteration 27 (2026-10-12)**: spec 361 → 370; 重逢捎礼（user: 已遇见的旅人再见面时捎回东西）。
  - **重逢**：`core/travelers.js` 新增 `rollTravelerGift` —— 只在「本次没遇到新旅人」且已见过 ≥1 位旧识时掷 12%，
    从旧识里挑一位按其 `gift` 契约发礼；无旧识必返回 null。
  - **契约**：`data/travelers.js` 12 位旅人各带 `gift{ currency: clovers|petal|leaf, amount:[min,max], line }`，三种货币全覆盖。
  - **产出统一**：把 `applyCurrency`（发货币 + 记账 cloversEarned / petalsPicked / leavesPicked）从 `fgames.js`
    抽到 `core/economy.js`，坊间游戏与捎礼共用；`state.stats.travelerGifts` 计数。
  - **称号**「礼尚往来」：收到 3 份捎礼（`titles.js` `gifted`），`summarize` 透出 `travelerGifts`。
  - **UI**：归来 toast「X 捎来 N 株铜钱草 / 片花瓣 / 片落叶」；称号页「旅途偶遇 · 捎礼 N 次」并列出每位旧识的「重逢」句。
  - 条款 `traveler.gift-data/-gift/-gift-title/-gift-shown`（+9，共 370）。
  - *Sensor 教训*：`traveler.gift` 两头钉死 —— 先断言「空 `travelers` 叠 200 种子 × 60 次掷骰，礼物恒为 null」，
    再断言「有旧识必能找到一次真实入账，且数量落在契约区间」。避免「没遇过也发礼」或「契约形同虚设」的空绿。
  - Mutation：称号阈 3→2 → `gift-title` 红。

- **Iteration 26 (2026-10-10)**: spec 361（不变）；补齐女性同路人（同行旅人此前偏男性/中性）。
  - `data/travelers.js` 增 6 位女性旅人：卖花女 / 采茶女 / 浣纱女 / 货娘 / 绣娘 / 弹词女先生，共 12 位、男女各半。
  - 纯数据改动，不加条款；相遇机制（`rollTraveler`）与既有 `traveler.meet` 条款自动覆盖。

- **Iteration 25 (2026-07-18)**: spec 348 → 361; 世界线 + 旅人（user: 玩家实时互动、影响世界线走向）。
  - **硬边界**：`实时跨玩家互动` = 联网，与「零网络」不变量（core.no-network/ux.no-external-assets）冲突。
    诚实落地为：`旅人`（确定性 NPC 同路人，离线）+ `世界线`（命运分支）。
  - **世界线**：`core/worldline.js` 的 `WORLDLINE_NODES`（霞客路成/诗满山河/流水有情/门庭若市/他乡故知），
    每条一个纯谓词 trigger + effect(rareChance/encounterChance)；`worldlineEffects` 聚合。
    `resolveTrip` 把世界线加成作用到奇遇率与稀有率；`engine` 在里程碑达成时激活节点（tick + 玩家动作）。
  - **旅人**：`data/travelers.js` 6 位同路人；`rollTraveler` 旅程结束 15% 相遇、不重复、有界；
    `finishTrip` 相遇留话；UI 称号页「旅途偶遇」区展示。
  - 条款 `worldline.data/-trigger/-effects`、`traveler.meet`、`worldline.shown`（+13）。
  - *Sensor 教训*：`worldline.effects` 用「同一地点、600 种子、稀有计数」统计对比，避免把随机率搞成空断言。
  - Mutation：世界线效果关闭→effects 红；旅人可重复→meet 红。

- **Iteration 24 (2026-07-18)**: spec 343 → 348; 开放世界机制（user: 其他不变，做成开放世界）。
  - 核心：玩家自主选目的地。`planTrip(state,rng,now,spotId)` 接受指定地点（必须在可达池内，否则 unreachable）；
    `departTo(state,rng,spotId,now)` 自由出行；`depart()` 委托给 `departTo(null)`（自动出行不变，兜底）。
  - `state.stats.freeTrips` + 称号「自由行」（自己决定去哪 5 次）。
  - UI：地图页可达地点加「去这里」按钮（马牛在家且有干粮时），点哪去哪；unreachable 有提示。
  - 条款 `trip.free-destination/-free-shown`（+5）。
  - *Sensor 教训*：把 `snack` 变量圈进了 `else` 分支，导致后续 `snack.hours` 报 "snack is not defined"——
    25 个条款一起红，立刻定位到变量作用域。
  - Mutation：departTo 忽略指定地点 → free-destination 红。

- **Iteration 22-23 (2026-07-18)**: spec 329 → 343; 访客陪你玩 + 诗笺（诗句收集, user instruction）。
  - **访客陪你玩**：`visitors.js` 每个访客加 `companion{gameId,bonus}`（蜗牛→抓子儿/蜜蜂→猜枚/乌龟→捶丸/白鹤→骑射）；
    `companionBonus(state,gameId)` 交情>=2 且游戏对上才加命中率；`playFolkGame` 的 chance = min(0.95, chance+bonus)。
    条款 `visitor.companion-data/-boosts`（统计验证陪玩平均命中确实更高）。
  - **诗笺**：`data/poems.js` 15 句名诗；`core/poems.js` `collectPoem`（确定性、不重复、集满为止）；
    飞花令/诗社加 `poem:true`，命中就收一句；`state.poems[]` + `stats.poemsCollected`；
    称号 小诗人(5 句)/诗满袖(集齐)；UI 坊间页底部「诗笺」区 + toast「对出一句…」。
    条款 `poems.data/-collect/-titles/-shown`。
  - Mutation：去掉交情门控→companion-boosts 红；去重失效→poems.collect 红。

- **Iteration 21 (2026-07-18)**: spec 327 → 329; 坊间游戏扩到 16 种 + 产出接三套资源（user: 继续加游戏、接产出）。
  - `fgames.js` 新增 11 项：斗草/射覆/踢毽子/抽陀螺/放风筝/飞花令/诗社/骑射/冰壶/摔角/赏花。
  - `reward` 泛化为 `{ currency: clovers|petal|leaf, perHit }`；`applyReward` 发到 clovers / florals.petal / florals.leaf + 统计。
    形成闭环：**games → 花瓣/落叶 → 流水许愿 → 铜钱草 → 商店 → 旅行**。
  - `drawGameGlyph` 补全 11 个手绘图标 + `drawFlower` 助手（飞花令/赏花共用）。
  - UI toast 按产出货币显示（株铜钱草/片花瓣/片落叶）。
  - 条款 `fgames.reward-outputs`（三种产出都真实发放）；`fgames.data` 收紧到「三种货币都必须覆盖」。
  - Mutation：斗草 leaf→clovers → fgames.data + reward-outputs 双红。

- **Iteration 19-20 (2026-07-18)**: spec 316 → 327; 坊间游戏（user: 古代坊间玩法如投壶）.
  - `data/fgames.js`：`FOLK_GAMES`（投壶/蹴鞠/抓子儿/猜枚/捶丸），每种一条配置：attempts/chance/rewardPerHit/cooldown。
  - `core/fgames.js`：`playFolkGame` —— 玩一局 = 投 attempts 次、每次 chance 命中、按命中给铜钱草；确定性 + 冷却。
  - `state.fgames`（战绩 best/played/hits/cooldownAt）+ `stats.gamesPlayed`。
  - 称号：神投手(投壶 5/5)/坊间常客(每种都玩过)/老玩家(15 局)。
  - UI：新增「坊间」页（每局战绩/最好/冷却 + 玩一局）+ `drawGameGlyph` 手绘图标。
  - 条款：fgames.data/-play/-titles/-shown/-rendered（+11）。
  - *扩展点*：新增一种古代游戏 = 在 FOLK_GAMES 加一条 + drawGameGlyph 加一个 case，主循环不动。
  - Mutation：去掉冷却→fgames.play 红；图标空转→fgames.rendered 红。

- **Iteration 17-18 (2026-07-18)**: spec 302 → 316; 落花飞叶玩法系列（user 纠正「是『落花流水』」）.
  - 从「落花飞叶」衍生出一套玩法：**四季拾花叶 → 投进流水许愿 → 称号**。
  - 资源 `state.florals{petal,leaf}` + `floralAt`；`core/floral.js`：`floralKind`（春=花瓣/秋=落叶/夏冬无）、
    `collectFloral`（季节门控 + 冷却 + 确定性）、`wishAtStream`（耗 3 片花叶 → 2-5 铜钱草）。
  - 称号：拾花人(20 花瓣)/扫叶人(20 落叶)/落花流水(许愿 3 次)。
  - **水区奇遇重主题**：`落水(湿)` → `落花流水(拾花瓣)`；`natureWet` 移除，`finishTrip.wet` 回到仅雨天，
    `weather.wet-card` 恢复原式（不再需要钉到非水域地点）。
  - 渲染：庭院加流水（drawStream）+ 落花飞叶（drawFallingFlorals，春/秋按季节，确定性）。
  - UI：HUD 🌸/🍂 计数 + 「拾花叶」「向流水许愿」按钮。
  - 条款：floral.seasonal/-collect/-wish/-titles/-shown/-rendered（+14）。
  - *Sensor 教训*：`floral.rendered` 用「同天气（clear）下春 vs 冬」隔离季节差异，避免天气把画面差异搞混。
  - Mutation：季节恒春→seasonal 红；许愿不消耗→wish 红；去掉落花绘制→rendered 红；去掉许愿按钮→shown 红。

- **Iteration 16 (2026-07-18)**: spec 293 → 302; 自然景点交互（自然奇遇, user instruction「落水流水这样式儿」）.
  - `data/encounters.js`：`NATURE_ENCOUNTERS` 按地区（山/水/城/荒）键控，
    水=落水(wet)/山=捡到奇石(souvenir)/城=听戏(clovers)/荒=夜观星象(rare)。
  - `core/encounters.js`：`rollEncounter(spot, rng)` 确定性掷骰。
  - `trip.resolveTrip` 掷奇遇并作用效果；`finishTrip` 的 `wet` = 雨天 OR 落水，
    相册条目录入 `encounter` 名 + 日志。
  - UI：归来提示带奇遇名，相册「最近旅程」显示奇遇。
  - 条款 `encounter.regions-covered/-deterministic/-effects-real/-shown`（+9）。
  - *Sensor 教训*：`NATURE_ENCOUNTERS` 一开始用英文键（water/mountain/...），但 `spot.region`
    是中文（山/水/城/荒）→ `rollEncounter` 永远 null，`deterministic` 条款空过（null===null）。
    改成中文键 + 让 deterministic 条款额外断言「确实能触发」。
  - *条款冲突*：落水（晴天也湿）会打乱 `weather.wet-card`（晴天必不湿）；
    把该条款的晴天用例钉到非水域地点（后山），隔离天气湿与落水湿两个来源。
  - Mutation：wet 效果空转→effects-real 红；水键改英文→regions-covered + effects-real 红。

- **Iteration 15 (2026-07-18)**: spec 286 → 293; 访客间互动（user instruction）.
  - `data/visitors.js`：每个访客加 `interactions[{with, minFriendship, line}]`（一个循环：蜗牛→乌龟、蜜蜂→蜗牛、乌龟→白鹤、白鹤→蜗牛）。
  - `core/visitors.js`：`interactionFor(state, visitor)` 纯判断；`arriveVisitor` 交情到了就用互动句替换到来日志，并存在 `current.interaction`。
  - UI：HUD 状态栏显示互动句。
  - 条款 `visitor.interaction-data/-triggers/-shown`（+7）。
  - Mutation：强制互动总是触发→interaction-triggers 红。

- **Iteration 14 (2026-07-18)**: spec 278 → 286; 特产装饰加槽位 + 中国元素再收束（user instruction）.
  - **装饰加槽位**：`decor.js` 从单一 `shelf` 扩展到 4 槽位（桌台/窗台/地板/墙上挂画），
    `placeDecor(state, slot, id)`；**一件收藏最多占一个槽位**（重摆会从旧槽位移走，避免一件多占）。
    `state.decor = { shelf, sill, floor, wall }`（旧档 `{...base, ...raw}` 自然合并不需迁移）。
    `drawRoom` 四个槽位各有画法：桌台=小木台、窗台=台沿、地板=垫子、墙上=挂绳+卷轴框。
    UI：特产页加槽位选择器（`data-decor-slot`），瓦片显示「在哪个槽位」。
    `engine.decorate(slot, id)`。条款 `decor.multi-slot`、`decor.slots-shown`（5 种画面互不相同）。
    *Sensor 教训*：槽位选择器一开始用 `data-slot`，与行囊页 pack/unpack 按钮的 `data-slot`（snack/tool/charm）
    冲突 → 冒烟「送它出门」失败（点「装上」被当成选槽位）。改成 `data-decor-slot` 解决。
    *Mutation*：去掉跨槽去重 → `decor.multi-slot` 红。
  - **中国元素再收束**：`HOME_ACTIVITIES` 里 `削木头→磨墨`、`擦帽子→理茶`（文人日常）。
    条款 `theme.chinese-activities`（磨墨/理茶必须在、削木头/擦帽子必须无）。
    *Mutation*：改回削木头/擦帽子 → 条款红。

- **Iteration 13 (2026-07-18)**: spec 276 → 278; 修 favours 假绿（user instruction）.
  - 假绿的根源：访客 `favours` 指到特产 id（rice_ear/ginkgo_leaf/…），特产在 `state.souvenirs`
    而不在 `state.inventory`，`feedVisitor` 只认 inventory → 真实游玩永远喂不到「它喜欢的」。
  - 三个假绿「同谋」一并修：
    1. `data/visitors.js`：favours 改成真实干粮（竹筒饭/栗子糕/馒头/松茸饭）；删掉死字段 `favoursAny`、死函数 `isFavoured`。
    2. `conformance.mjs`：`visitor.feed-favourite/feed-once/rare-gift` 不再把特产塞进 inventory，改用真实食物。
    3. `core.test.js`：数据完整性断言从「允许特产」收紧为「favours ⊆ SNACKS」。
  - 棘轮条款 `data.visitor-favours-feedable`：偏好必须是真实干粮 id。
  - Mutation：把蜗牛偏好改回 rice_ear → 条款红 + 单测红。

- **Iteration 12 (2026-07-18)**: spec 266 → 276; 徐霞客路线（霞客路, user instruction）.
  - `src/data/xuxiake.js`: `XU_XIAKE_ROUTE` — 7 段行迹（江南启程→天台问海→武夷寻茶→嵩山访碑→黔山梯云→漓江泛舟→鸡足西行），
    按徐霞客「江南→浙江→福建→中原→贵州→广西→云南」的走向排列；每条映射到真实 SPOTS 地点，带 stage + note；
    主题「丈夫当朝碧海而暮苍梧」作为 `XU_XIAKE_MOTTO`。
  - `src/core/xuxiake.js`: `xuxiakeProgress(state)` 纯函数（复用 `visitedSpotIds`），返回 done/total/complete；不写状态不耗 rng。
  - 称号「霞客传人」：走完 7 段才解锁。
  - UI：地图页新增「徐霞客的路线 · done/total」段落，逐段打卡。
  - 条款：`xuxiake.route-valid`（非空/真实/无重复/跨≥3 地区）、`xuxiake.progress`（只数路线地点，走完才 complete）、
    `xuxiake.title`（走完解锁、差一段不解锁）、`xuxiake.shown`（界面可见）。
  - Mutation：称号提前解锁→title 红；进度数全部地点→progress 红。
  - *设计取舍*：路线是「覆盖层」而非新增地点 —— 不改 unlock 链、不重排特产，历史足迹叠加在既有地理上；
    新增一段路 = 加一条 { spotId, stage, note }，主循环不动。

- **Iteration 11 (2026-07-18)**: spec 263 → 266; 节气特产（收束上一个会话未提交的 WIP）.
  - `spots.js` `SEASONAL`（明前茶/青团/野柿子/新米/梭子蟹，按 season 0/2 门控）并入 `SOUVENIRS_BY_ID` 与 `TOTAL_SOUVENIRS`。
  - `trip.js` `resolveTrip` 只在对应季节（`seasonIndex(trip.returnAt)`）才有机会带回季节特产。
  - 条款 `season.souvenir-gated`：注册/唯一性 + 出季必不出现 + 当季确实可得。
  - Mutation：去掉 `entry.season === tripSeason` 守卫 → 条款红。

- **Iteration 10 (2026-07-18)**: spec 260 → 263; full Chinese re-theme (user instruction).
  - Currency 三叶草/四叶草 → 铜钱草/金铜钱草; snack 饭团 → 馒头; charm 四叶草护符 → 铜钱草护符.
  - Spots 海上灯塔→东海灯塔, 盐湖→茶卡盐湖, 极光冰原→漠河极光, 海上群岛→舟山群岛,
    with their postcards/souvenirs re-voiced (渔港/晒网/白桦林/白桦皮/海螺/渔网线…).
  - Garden plant redrawn as round "coin" leaves (铜钱草), currency emoji 🍀 → 🪙.
  - Ratchet clause `theme.chinese-elements` bans a non-Chinese term blacklist and asserts the
    new currency/place names are present — mutation-tested (馒头→饭团 goes red).

- **Iteration 9 (2026-07-18)**: spec 258 → 260; offline postcard sharing.
  - Tap an album card → full postcard at 3× DPR + a save button that downloads a PNG via
    `toDataURL` into a local `<a download>`. Zero network (clause `ux.share-offline` asserts
    no http URL appears in the whole UI binding file).

- **Iteration 8 (2026-07-18)**: spec 254 → 258; album grouped by region.
  - `spots.js` gains a `region` field (山/水/城/荒) + `REGIONS` + `spotsOfRegion()`.
  - The album sheet groups collected cards into region sections (only populated ones).
  - Clauses: `data.spot-regions` (every spot has a region, each region populated, ≥2 spots each),
    `ui.album-grouped` (grouping actually wired).

- **Iteration 7 (2026-07-18)**: spec 247 → 254; souvenirs as home decor.
  - `src/core/decor.js`: place/clear a collected souvenir on the wall (no consumption).
  - `state.decor = { shelf }` survives save/load; `drawRoom` draws the glyph on a small
    stand on the desk, and the souvenirs sheet toggles it on tap.
  - Extensibility: decor is slot-keyed — adding a windowsill/floor slot = one more key.
  - Lesson: mutation-testing by `git checkout` reverted an *uncommitted* render change too.
    Re-applied; commit before mutating from now on.

- **Iteration 6 (2026-07-18)**: spec 239 → 247; watch layout + accessibility.
  - Watch stage was only 139px tall at 300×300 because the pick-button row kept its own grid
    row. Now `#secondary` is absolutely positioned on ≤320px → stage grew to 193px
    (smoke asserts ≥160).
  - Touch targets: `.action`/`.nav-btn`/`.row button`/`.tab` all ≥44px (a11y clause + smoke
    assert the real button's offsetHeight).
  - `prefers-reduced-motion`: app.js reads the system query and freezes the hand-drawn
    "boiling line" (passes motionT=0). Smoke proves it via CDP emulated media: two frame
    hashes 700ms apart are identical under reduce, and the scene still paints otherwise.
  - Mutation-checked: shrinking targets to 40px → 2 clauses red.

- **Iteration 5 (2026-07-18)**: spec 232 → 239; seasonal palette for postcards.
  - `src/core/season.js`: 24 节气 / 四季 as pure functions of time (same discipline as weather).
  - Postcard paper + room wall tint by the season the card was shot in; each card keeps its
    original season via `collection.firstAt`. 4 distinct accents, stable within a season.
  - Approx solar-term anchor (立春 ≈ day 35) — fine for tinting, documented as approximate.
  - Mutation-checked: forcing a constant accent → `season.four-accents` + `season.shown` red.

- **Iteration 4 (2026-07-18)**: spec 220 → 232; weather deepens rather than widens.
  - Rain now changes who stays and what comes back: visitors shelter under the eave until the
    sky clears (`arriveVisitor` reads `rainUntil`), and postcards shot in the rain carry a `wet`
    flag — drawn with rain streaks + a water-stained corner, badged ☂ in the album, and counted
    towards the 「冒雨赶路」 title (3 wet cards).
  - `wet` is stored on both the capped timeline and the bounded collection (as an "ever wet" OR).
  - Mutation-checked: disabling sheltering → 1 clause red; removing the wet flag → 1 clause red.

- **Iteration 3 (2026-07-18)**: spec 206 → 220; weather closes the dead `rainProof` field.
  - `trip.rainProof` was written into every trip and never read — a dead field. Rather than delete it,
    weather made the 斗笠 meaningful: rain ×0.72 (×1.0 with the hat), wind ×1.08, plus a souvenir
    bonus for walking in the rain properly equipped. Weather is a pure function of `now`
    (6-hour buckets), so it consumes no rng and never desyncs a save.
  - Measured: clear 3.98h / wind 4.29h / rain 2.86h / rain+斗笠 3.98h; souvenirs 1.05 → 2.05 in rain.
  - Rendering: rain streaks through the window and across the yard, wind lines at a slant.

- **Baseline (2026-07-18)**: core engine (rng/state/economy/trip/visitors/titles/tick)
  + conformance harness. Score 115/150.
  - *Failed*: single event-priority loop in `tick` — 3-day catch-up spent the whole
    event budget on visitor churn and never finished the trip. Fixed by splitting the
    timeline: bounded trip cascade + visitor cycles that **collapse** long offline gaps
    (`visitor-collapse`). Lesson: never let a high-frequency event source share a
    budget with the events that carry game state.
  - *Failed*: conformance checks held module-level fixtures (`FULL_ALBUM`) by reference
    and mutated them across clauses. Harness now deep-copies fixtures.
  - *Failed*: `core.purity` tripped on the word "window" inside a comment. Sensor now
    strips comments before scanning (false positives poison feedback).
  - Score after fixes: 136/150. Remaining 14 pts = UI/hand-drawn/Capacitor targets.
