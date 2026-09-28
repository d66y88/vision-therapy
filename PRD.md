# 弱视与斜视辅助训练系统 (Amblyopia & Strabismus Vision Therapy Software)

> 本文档旨在为 AI 代码生成工具（Cursor / Codex）提供精准上下文与架构指令。请按照「实施路线图」顺序逐步执行。

## 1. 项目概览与开发目标

**产品名：** 视力小训练营  
**目标用户：** 7–8 岁儿童（远视弱视与轻微斜视恢复期，需高依从性与趣味性）。

**技术选型（已落地）：**
- 前端：React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- 图形渲染：HTML5 Canvas API（不引入 Three.js）
- 状态管理：Zustand
- 本地持久化：IndexedDB（训练会话，`idb`）+ localStorage（校准 / 打卡 / 设置等）
- 部署形态：**可安装 PWA**（`vite-plugin-pwa` / Workbox），兼容 iPad / Mac / PC；**iPad 无需 Capacitor 二次打包**，Safari「添加到主屏幕」即可全屏离线使用
- 可选云同步：Supabase（匿名登录 + Postgres + RLS）；未配置 `VITE_SUPABASE_*` 时为「仅本地」，不发起网络请求

**隐私原则：** 匿名、不收集儿童姓名等 PII；云端数据按「家庭」隔离。剂量相关文案为产品 / 循证设计参考，非医疗处方，遮盖与配镜等遵医嘱。

## 2. 核心模块详细设计规范

### 模块一：红蓝分视光谱校准 (Dichoptic Red-Blue Color Calibration)

**目的：** 解决不同屏幕发光光谱差异导致的「滤镜漏光」问题，确保戴上红蓝眼镜后，红镜（左眼）完全屏蔽蓝色，蓝镜（右眼）完全屏蔽红色。

**参数与控制逻辑：**
- 红色元素基色：`RGB(R_val, 0, 0)`，初始值：`#FF0000`
- 蓝色元素基色：`RGB(0, G_val, B_val)`，初始值：`#00FFFF`（Cyan）或 `#0000FF`

**UI 组件需求：**
- 左右对比色块展示区
- Slider：Red Alpha、Blue Green-Channel、Blue Blue-Channel
- 全屏测试视图：随机出现的红蓝交替闪烁图案，闭单眼确认「完全不可见」
- 配置导出：校准结果保存至 `localStorage` key `vision_color_config`

### 模块二：自适应 Gabor 斑视敏度刺激引擎 (Adaptive Gabor Patch Engine)

**目的：** 高频刺激黄斑中心凹与视觉皮层，提升空间分辨力。

**Gabor 公式：**
\( G(x,y;\lambda,\theta,\psi,\sigma,\gamma) = \exp\left(-\frac{x'^2+\gamma^2 y'^2}{2\sigma^2}\right) \cos\left(2\pi\frac{x'}{\lambda}+\psi\right) \)

**Canvas 绘制变量：**
- `spatialFrequency`：\(0.01 \sim 0.2\)
- `contrast`：\(0.05 \sim 1.0\)
- `orientation`：\(0 \sim 180^\circ\) 随机
- `sigma`：\(20 \sim 60\)

**自适应控制（Staircase 3-down / 1-up）：**
- 连续成功 3 次 → 降低对比度 10% 或提升空间频率 5%
- 点击错误/超时 1 次 → 提升对比度 15% 或降低空间频率 10%

**交互规则：** 随机在 \(N \times N\) 网格噪点背景中出现 1 个 Gabor 斑；限时点击（如 3 秒）；成功触发音效与粒子动画。

### 模块三：红蓝抗抑制与双眼融合游戏 (Dichoptic Anti-Suppression Game)

**目的：** 强迫双眼同时工作，打破弱视眼抑制，改善轻微斜视。

**视觉渲染架构：**
- 通道 A（仅红镜/左眼可见）：背景、赛道、收集物（模块一校准红色）
- 通道 B（仅蓝镜/右眼可见）：玩家角色、障碍物（模块一校准蓝色）
- 融合标志物（双眼均可见）：高对比度白/黑网格边框、中央对焦十字

**玩法：** 控制蓝色角色避开蓝色障碍、收集红色物品。抑制任一眼则无法继续，从而强迫双眼协作。

### 模块四：防疲劳与距离监测 (Distance & Fatigue Guard)

**防疲劳：** 墙钟上限默认 **30 分钟**（家长可调 30/45/60）；有效专注目标默认约 **18 分钟**。**有效时间按真实在任时长计**（`accrualMultiplier = min(1, focusScore)`，专注不缩短应练时长，分心打折）。训练中每约 **12 分钟**一次 20 秒远眺微休息；到达墙钟上限后自动锁定并进入 3 分钟休息，禁止继续交互。

**距离监测（选配）：** WebCam 简易人脸框估算距离；若距屏过近，全屏弹窗阻塞。MediaPipe 等进阶方案本阶段不引入。

### 模块五：可安装 PWA 与可选云同步（已落地）

**PWA：** manifest + 多尺寸图标（含 iOS `apple-touch-icon` / maskable）+ iOS 全屏 meta；`navigator.storage.persist()`；`InstallHint` 引导 iOS Safari「添加到主屏幕」。

**云同步（可选，local-first）：**
- 客户端：`src/lib/supabaseClient.ts`（env 守卫）、`src/lib/sync/engine.ts`、`src/store/syncStore.ts`
- 建表与 RPC：`supabase/schema.sql`（`families` / `family_members` / `sync_codes` / `sessions` / `kv` + RLS）
- 会话：客户端 `syncId`（UUID）为主键，append-only 去重合并；IndexedDB `DB_VERSION = 2` 回填旧行
- 配置 KV 白名单：`src/lib/sync/kvKeys.ts`（连胜、贴纸、能力、课表、校准、弱视眼、音效、剂量设置、PIN 等）；按 `updated_at` LWW
- 多设备：家长区生成 / 兑换 6 位同步码（24h）；触发点为启动、结束会话、切后台、恢复在线

## 3. 实施路线图

1. **阶段一（已落地）：** 项目基础 + ColorCalibration
2. **阶段二（已落地）：** GaborGame Canvas + 阶梯自适应
3. **阶段三（已落地）：** DichopticGame 红蓝分视游戏
4. **阶段四（已落地）：** TrainingTimer + ParentDashboard + IndexedDB
5. **阶段五（已落地）：** 游戏库扩至 11 关；新增扫视 `saccadeJump`、立体视 `stereoNear`、对比度平衡抗抑制 `contrastBalance`；核心关画面/玩法/交互抛光；课表仍 4–6 关且 ≥1 acuity + ≥1 anti-suppression。
6. **阶段六（已落地）：** 游戏库扩至 **12** 关；弱关（fixate / bubble / memory / starPop / dichoptic）开局吃 ability；首页课表与打卡双进度；全局弱视眼偏好；新增近远集合散 `vergenceJump`（`focus: vergence`）；演示路径为 Gabor → 红蓝天平 → 近远跳跳。
7. **阶段七（已落地）：** 不加新关，做深体验——ability 难度级别在孩子/家长端可见（入门/进阶/挑战 + 升级庆祝 + 家长各关最佳）；里程碑贴纸激励（连续 3/7/14/30 天，`rewardsStore`）；全局音效开关（`settingsStore`，`playTone` 读取）；首页短名 + focus 图标、自由加练排除课表关。
8. **阶段八（已落地）：** 剂量科学化——修正「有效分钟」语义（`accrualMultiplier` 封顶 1.0）；家长区周剂量视图（`doseSummary`）；墙钟上限可调 30/45/60；训练中 20-20-20 微休息。
9. **阶段九（已落地）：** 云同步与 iPad PWA——
   - **PWA 可安装 / 离线**：`vite-plugin-pwa`（Workbox `generateSW`，`autoUpdate`）+ manifest + 图标 + iOS meta；`storage.persist`；`InstallHint`。**iPad 无需二次打包**。
   - **可选云同步（Supabase + 匿名登录 + 同步码）**：本地优先；会话 `syncId` append-only；KV LWW；家庭 RLS；不收集儿童 PII。详见 `.env.example` 与 `supabase/schema.sql`。

## 4. 全局代码质量约定

- 视觉算法写成独立纯函数，附带 JSDoc / TypeScript 类型
- Canvas 使用 `requestAnimationFrame`
- 儿童端按钮最小点击区域 \(48 \times 48\text{px}\)，配备音效反馈
- 新游戏必须接入 `useTrainingSession`，勿另起计时；眼镜关设置 `needsGlasses: true`
- 云同步相关逻辑须 env 守卫；未配置时不得引入必需的网络失败路径
