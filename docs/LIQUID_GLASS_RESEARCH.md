# Liquid Glass Web Research

本文记录 Conlexicon 液态玻璃实现的外部证据、可复现实验和待验证结论。它不是把任一开源项目直接定义为产品规范；产品边界仍以 [Liquid Glass Skin Specification](LIQUID_GLASS_SKIN_SPEC.md) 为准。

## 1. 研究目标

- 把“看起来像玻璃”拆成可比较的轮廓、位移场、边缘衰减、色散、模糊、镜面、合成和辅助降级问题。
- 在同一背景、尺寸、圆角和拖动场景下比较不同算法，避免把背景差异误判为光学差异。
- 先复现来源实现，再讨论生产适配；未经 Lab 对照确认的算法不进入 Product Engine。
- 区分已确认源码事实、Lab 观察和产品建议，不用 Apple 系统内部实现不可见的部分补全结论。

## 2. 来源与许可边界

### Apple 官方资料

- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) 将 Liquid Glass 定义为位于内容之上的功能层，强调 regular/clear 材质、可读性、适量使用以及减少透明度/提高对比度时的自适应。
- [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views) 公开的是系统 API、形状、tint、interactive、容器合并与 morphing 的使用方式，不公开 Apple 的底层光学渲染模型或 shader 源码。
- [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) 提供 lensing、环境适应、尺寸相关材质变化、同心圆角与动态形变等设计依据，但不能作为精确算法参数来源。

### Web 实现

- [`archisvaze/liquid-glass`](https://github.com/archisvaze/liquid-glass) 是本机可选 `Reference Baseline` 的算法来源，使用 convex-squircle/Snell profile、全尺寸位移图和独立 specular 图。研究时检查到仓库根目录没有 `LICENSE` 文件，因此逐行对照模块只作为被 Git 忽略的本机研究材料存在，不随 Conlexicon 仓库分发；在许可得到澄清前，不把它并入 Product Engine 或视为可安全再分发的第三方依赖。
- [Aave: Building Glass for the Web](https://aave.com/design/building-glass-for-the-web) 说明了 SDF、位移贴图和浏览器 SVG filter 的设计思路，是分析 SDF 家族的技术背景，不是本仓库复制的代码来源。
- [`PallavAg/liquid-glass-web-react`](https://github.com/PallavAg/liquid-glass-web-react) 提供 MIT 许可的 SDF 位移贴图实现。本轮 `lib/liquid-glass-sdf-baseline.js` 改编其贴图数学和 filter 合成，版权与完整 MIT 文本见根目录 `THIRD_PARTY_NOTICES.md`。
- [`samasante/liquid-glass`](https://github.com/samasante/liquid-glass) 和 [`rdev/liquid-glass-react`](https://github.com/rdev/liquid-glass-react) 用于交叉检查 SDF、色散、交互和浏览器兼容策略；本轮没有复制其代码。

## 3. 三条 Lab 管线

| 路径 | 形状/位移模型 | 合成 | 目的 |
| --- | --- | --- | --- |
| Reference Baseline（本机可选） | convex-squircle 截面、Snell profile、全尺寸圆角位移图 | 单路位移、独立 specular | 对照最初参考项目的可见边缘与折射宽度 |
| SDF Baseline | 来源圆角矩形 SDF，另有 Lab-only 超椭圆角与全局 Lamé 轮廓扩展；线性/球顶梯度决定位移方向 | RGB 三路位移、B 通道镜面、Alpha 轮廓 | 检查解析边界、固定方形贴图和球顶梯度是否改善连续性 |
| Product Engine | 精确 rounded-rect 外轮廓、Lab-only 超椭圆角/全局 Lamé 分支、独立 bezel 与连续全支撑光学方向场 | 光学模糊、RGB 重组、统一环境 specular、Worker/LRU | 验证最终组件角色、降级、资源生命周期与性能架构 |

三条路径在本机 Reference 文件存在时共享 Lab 的连续色场、高对比网格、色带、大号文字、拖动坐标，以及唯一一组宽度、高度、圆角、外轮廓模型和超椭圆指数。角部模型保留直边：指数范围 `2–8`、默认 `4`，`2` 复用传统圆角快速路径，更大的值启用 Product/SDF 超椭圆角；全局模型直接以 `|x/a|^n + |y/b|^n = 1` 定义整张表面，`n=2` 为椭圆且 Product/SDF 不消费 radius。Product 与 SDF 同步改变 CSS clip/corner shape 和贴图几何；Reference 为保护逐行来源基准始终使用传统圆角，并显式报告差异。圆角滑杆上限只由共享短边的一半决定；Product/SDF 全局模型会保留但禁用该值，Reference 仍可调整其来源圆角。切换渲染路径或恢复模型默认值不会改变共享选择。仓库分发五张仅供 Lab 光学对照的背景图：室内、Diamond Valley Lake 花丛、Whangarei Falls 栈桥和草地人物来自 Unsplash，浅水岩石来自 Pexels；逐张作者、原始页面和许可链接记录在 `assets/liquid-glass-lab/README.md`，这些图片不得视为 Conlexicon 产品美术资产。SDF 来源实现原本过滤包含镜头的内容层；Lab 唯一有意的结构适配是把同一 map/filter 作用到卡片的 `backdrop-filter` 伪元素，使它能与另外两条路径观察同一实时背景。SDF Baseline 默认不叠加自行设计的 tint、边界或外阴影，避免装饰层污染轮廓、位移和镜面的观察。该适配意味着 Lab 能比较视觉结果，但不能据此宣称浏览器覆盖或性能与上游组件完全相同。

## 4. 已纠正的实现认识

- SDF 不直接提供本实现的折射法线。它用于判断圆角矩形内外和计算 edge-band falloff；X/Y 位移方向来自线性坡度或归一化球顶梯度。
- 上游 Alpha 轮廓是像素中心的二值 `0/255`，不是 fractional coverage 或 MSAA。SDF Baseline 原样保留这一点；若 Lab 仍出现角部锯齿，应先把它认定为贴图分辨率、拉伸和二值遮罩共同产生的可测现象，而不是擅自增加抗锯齿后再称为“原实现”。
- 固定 `quality × quality` 方形贴图会被拉伸到非方形镜头。提高 quality 能减少量化但增加同步生成成本；它不自动解决低质量二值轮廓的所有闪烁。
- `depth` 是 SDF edge band 宽度；它与 CSS border radius 不需要数值相等，但必须受短边和半径视觉关系约束。极宽 depth、极小 radius 或低 quality 的组合最容易暴露角部轮廓与位移方向的脱节。
- Lab 明确区分“直边＋超椭圆角”和“全局超椭圆”：前者对应 CSS `border-radius + corner-shape` 的角部语义，后者以整张表面的 Lamé 方程定义且没有数学上的真正直边；两者都不是 Apple 未公开的 Continuous Corners 模型，也不改变 Reference 来源算法。
- Product 曾用最近边法线和两条硬截断的水平/垂直 influence 组成宽边带方向场；值虽经混合，激活边界的导数仍不连续，因此位移图会在特定 bezel 下出现轻微斜带，normal/rim 图则形成明显的梯形分区。当前实现保留精确外轮廓距离，在最外层以真实边界法线相切，再用 quintic smootherstep 过渡到四边始终参与的有理势场；两张贴图共享该连续法线，光学带外写入中性法线，不再保留无意义的中心分区。
- Apple 的系统材质会基于背景和系统设置自适应。静态 tint、固定镜面或单一折射算法只能复现部分视觉线索，不能被描述为 Apple 内部模型的等价实现。

### Product Engine 来源边界

- 多表面角色注册、Worker/分块后备、动态 SVG filter registry、按字节 LRU、ResizeObserver 生命周期、Q3/Q1/Q0 降级和对象 URL 回收是 Conlexicon 为自身 DOM 应用编写的产品架构，不来自 Reference、SDF 项目或 Apple 私有实现。
- convex-squircle 截面、Snell 折射和完整 bezel 内的衰减语义参考 `archisvaze/liquid-glass` 后独立实现；Product 不复制其全尺寸单路贴图、`bezel <= radius - 1` 约束或 primitive 顺序。
- rounded-rect 有符号距离、Lab-only 超椭圆角/全局 Lamé 轮廓、连续四边势场、双贴图通道、RGB 三路重组、normal/rim 环境镜面和本轮 256 点折射 LUT 属于 Product 自身实现。SDF Baseline 的 MIT 代码只存在于隔离 Lab，不参与正式 Product 贴图生成。
- Apple 资料只提供材质层级、轮廓、可读性和交互目标；Apple 没有公开可供本项目移植的底层 Liquid Glass shader 或光学模型。

## 5. 本轮验收问题

以下项目只记录为人工对照问题，不预写视觉结论。SDF 面板提供临时的 Controlled Comparisons 快捷按钮；单变量按钮都从来源默认值重新开始，纯折射系列统一关闭 glow、edge highlight 和 specular，防止残留手工参数破坏比较。“Ref 趋近 · 光学”和“Ref 趋近 · +外观”使用同一组候选 SDF 光学参数，后者只额外复用当前 Reference 的 tint、内阴影和外阴影，以直接隔离算法与外观包装的贡献。趋近预设关闭 RGB 色散只是为了匹配没有分路的 Reference，不能据此推断 Apple 系统材质没有色散；Apple 的公开设计与 API 未披露底层 RGB 光学实现：

1. 在网格和文字场景中，SDF 的边缘有效宽度是否比 Product 更连续，四角是否仍出现阶梯或斜缝。
2. `quality` 从 `128` 到 `1024` 时，角部锯齿、拖动稳定性和生成耗时各自如何变化。
3. `depth`、`radius` 与 `curvature` 分别改变的是折射范围、轮廓还是位移方向，是否存在被错误耦合的参数。
4. 关闭 glow/edge highlight 后，剩余轮廓问题是否来自位移图或 Alpha mask，而不是镜面层。
5. 在减少透明度和强制颜色模式下，三条路径是否都停止生成光学贴图并使用可读实色降级。

Lab 的视觉结论由人工验收后再写入本文件；自动检查只覆盖模块可加载、贴图确定性、形状遮罩、对称性和参数确实改变输出。

## 6. 下一步决策门槛

- Reference 与 SDF 已确认不适合作为主体正式光学后端；它们继续留在 Lab 作为隔离的视觉与性能基准，不再接入应用角色 registry。Product 是后续正式改进主线。
- 如果只在 `1024` quality 下改善，先测生成成本、内存和缩放稳定性，再决定 Worker 化、非方形 map 或解析 SVG map，不能用更高分辨率掩盖模型问题。
- 如果 SDF 仍有明显二值轮廓，下一轮优先加入独立的 coverage/oversampling 实验分支；保留原始 SDF Baseline 作为不可变对照。
- 动态光源、形状融合、Q2 和 LQ-7 仍是独立议题，不与本轮静态几何结论捆绑。
