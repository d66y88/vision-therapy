# 弱视与斜视辅助训练系统 (Amblyopia & Strabismus Vision Therapy Software)

> 本文档旨在为 AI 代码生成工具（Cursor / Codex）提供精准上下文与架构指令。请按照「实施路线图」顺序逐步执行。

## 1. 项目概览与开发目标

**目标用户：** 7–8 岁儿童（远视弱视与轻微斜视恢复期，需高依从性与趣味性）。

**技术选型：**
- 前端框架：React + Tailwind CSS
- 图形渲染：HTML5 Canvas API / Three.js (WebGL)
- 状态管理：Zustand
- 数据持久化：IndexedDB 或 LocalStorage
- 部署形式：Web SPA（兼容 iPad / Mac / PC，可基于 Capacitor 打包）

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

**防疲劳：** 单次训练硬性限制 15 分钟；到达后自动暂停，进入 3 分钟眼保健操/远眺提示，禁止继续交互。

**距离监测（选配）：** WebCam + face-landmarks / MediaPipe；瞳距像素估算距离；若距屏 \(< 40\text{cm}\)，全屏弹窗阻塞。

## 3. 实施路线图

1. **阶段一：** 项目基础 + ColorCalibration
2. **阶段二：** GaborGame Canvas + 阶梯自适应
3. **阶段三：** DichopticGame 红蓝分视游戏
4. **阶段四：** TrainingTimer + ParentDashboard + IndexedDB

## 4. 全局代码质量约定

- 视觉算法写成独立纯函数，附带 JSDoc / TypeScript 类型
- Canvas 使用 `requestAnimationFrame`
- 儿童端按钮最小点击区域 \(48 \times 48\text{px}\)，配备音效反馈
