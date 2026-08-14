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

- [`archisvaze/liquid-glass`](https://github.com/archisvaze/liquid-glass) 是现有 `Reference Baseline` 的算法来源，使用 convex-squircle/Snell profile、全尺寸位移图和独立 specular 图。研究时检查到仓库根目录没有 `LICENSE` 文件，因此它只能继续作为来源明确的隔离研究对照；在许可得到澄清前，不把其逐行实现并入 Product Engine，也不将其作为可安全再分发的第三方依赖结论。
- [Aave: Building Glass for the Web](https://aave.com/design/building-glass-for-the-web) 说明了 SDF、位移贴图和浏览器 SVG filter 的设计思路，是分析 SDF 家族的技术背景，不是本仓库复制的代码来源。
- [`PallavAg/liquid-glass-web-react`](https://github.com/PallavAg/liquid-glass-web-react) 提供 MIT 许可的 SDF 位移贴图实现。本轮 `lib/liquid-glass-sdf-baseline.js` 改编其贴图数学和 filter 合成，版权与完整 MIT 文本见根目录 `THIRD_PARTY_NOTICES.md`。
- [`samasante/liquid-glass`](https://github.com/samasante/liquid-glass) 和 [`rdev/liquid-glass-react`](https://github.com/rdev/liquid-glass-react) 用于交叉检查 SDF、色散、交互和浏览器兼容策略；本轮没有复制其代码。

## 3. 三条 Lab 管线

| 路径 | 形状/位移模型 | 合成 | 目的 |
| --- | --- | --- | --- |
| Reference Baseline | convex-squircle 截面、Snell profile、全尺寸圆角位移图 | 单路位移、独立 specular | 对照最初参考项目的可见边缘与折射宽度 |
| SDF Baseline | 圆角矩形 SDF 决定边界和内侧 falloff；线性/球顶梯度决定位移方向 | RGB 三路位移、B 通道镜面、Alpha 轮廓 | 检查解析边界、固定方形贴图和球顶梯度是否改善连续性 |
| Product Engine | 生产 rounded-rect 几何、有效边、角色化 bezel 与法线/rim 图 | 光学模糊、RGB 重组、统一环境 specular、Worker/LRU | 验证最终组件角色、降级、资源生命周期与性能架构 |

三条路径共享 Lab 的连续色场、高对比网格、色带、大号文字、卡片尺寸和拖动坐标。SDF 来源实现原本过滤包含镜头的内容层；Lab 唯一有意的结构适配是把同一 map/filter 作用到卡片的 `backdrop-filter` 伪元素，使它能与另外两条路径观察同一实时背景。SDF Baseline 默认不叠加自行设计的 tint、边界或外阴影，避免装饰层污染轮廓、位移和镜面的观察。该适配意味着 Lab 能比较视觉结果，但不能据此宣称浏览器覆盖或性能与上游组件完全相同。

## 4. 已纠正的实现认识

- SDF 不直接提供本实现的折射法线。它用于判断圆角矩形内外和计算 edge-band falloff；X/Y 位移方向来自线性坡度或归一化球顶梯度。
- 上游 Alpha 轮廓是像素中心的二值 `0/255`，不是 fractional coverage 或 MSAA。SDF Baseline 原样保留这一点；若 Lab 仍出现角部锯齿，应先把它认定为贴图分辨率、拉伸和二值遮罩共同产生的可测现象，而不是擅自增加抗锯齿后再称为“原实现”。
- 固定 `quality × quality` 方形贴图会被拉伸到非方形镜头。提高 quality 能减少量化但增加同步生成成本；它不自动解决低质量二值轮廓的所有闪烁。
- `depth` 是 SDF edge band 宽度；它与 CSS border radius 不需要数值相等，但必须受短边和半径视觉关系约束。极宽 depth、极小 radius 或低 quality 的组合最容易暴露角部轮廓与位移方向的脱节。
- Apple 的系统材质会基于背景和系统设置自适应。静态 tint、固定镜面或单一折射算法只能复现部分视觉线索，不能被描述为 Apple 内部模型的等价实现。

## 5. 本轮验收问题

以下项目只记录为人工对照问题，不预写视觉结论：

1. 在网格和文字场景中，SDF 的边缘有效宽度是否比 Product 更连续，四角是否仍出现阶梯或斜缝。
2. `quality` 从 `128` 到 `1024` 时，角部锯齿、拖动稳定性和生成耗时各自如何变化。
3. `depth`、`radius` 与 `curvature` 分别改变的是折射范围、轮廓还是位移方向，是否存在被错误耦合的参数。
4. 关闭 glow/edge highlight 后，剩余轮廓问题是否来自位移图或 Alpha mask，而不是镜面层。
5. 在减少透明度和强制颜色模式下，三条路径是否都停止生成光学贴图并使用可读实色降级。

Lab 的视觉结论由人工验收后再写入本文件；自动检查只覆盖模块可加载、贴图确定性、形状遮罩、对称性和参数确实改变输出。

## 6. 下一步决策门槛

- 如果 SDF Baseline 在相同质量下稳定优于 Product，再讨论把“解析 SDF + 抗锯齿覆盖/更合适的贴图纵横比”作为新的生产几何候选；不能直接把研究模块接入正式角色 registry。
- 如果只在 `1024` quality 下改善，先测生成成本、内存和缩放稳定性，再决定 Worker 化、非方形 map 或解析 SVG map，不能用更高分辨率掩盖模型问题。
- 如果 SDF 仍有明显二值轮廓，下一轮优先加入独立的 coverage/oversampling 实验分支；保留原始 SDF Baseline 作为不可变对照。
- 动态光源、形状融合、Q2 和 LQ-7 仍是独立议题，不与本轮静态几何结论捆绑。
