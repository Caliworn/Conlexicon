(function initLiquidGlassSdfBaseline(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConlexiconLiquidGlassSdfBaseline = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createLiquidGlassSdfBaseline() {
  "use strict";

  // Research baseline adapted from the MIT-licensed displacement-map core in:
  // https://github.com/PallavAg/liquid-glass-web-react
  // Copyright (c) 2026 Pallav Agarwal. See THIRD_PARTY_NOTICES.md.
  //
  // The map math and filter composition remain independent from Conlexicon's
  // product geometry. rebuildFilter() is the Lab backdrop-filter adapter.
  // The optional superellipse outline is a Lab extension; the default round
  // branch remains the source-compatible baseline.

  const DEFAULTS = Object.freeze({
    width: 160,
    height: 120,
    radius: "auto",
    strength: 0.1,
    chromaticAberration: 0.2,
    blur: 0,
    depth: 10,
    curvature: 0.65,
    splay: 1,
    glow: 0.1,
    glowSpread: 1,
    glowExponent: 1.5,
    edgeHighlight: 0.25,
    edgeWidth: 3,
    edgeExponent: 1.5,
    specular: 1,
    specularAngle: 45,
    quality: 512,
    outerShape: "round",
    cornerExponent: 4,
  });

  const LAB_DEFAULTS = Object.freeze({
    ...DEFAULTS,
    width: 420,
    height: 200,
    radius: 60,
  });

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeOptions(raw = {}) {
    const width = clamp(finiteNumber(raw.width, DEFAULTS.width), 8, 2048);
    const height = clamp(finiteNumber(raw.height, DEFAULTS.height), 8, 2048);
    const maximumRadius = Math.min(width, height) / 2;
    const radius = raw.radius === "auto"
      ? maximumRadius
      : clamp(finiteNumber(raw.radius, maximumRadius), 0, maximumRadius);
    let quality = Math.round(clamp(finiteNumber(raw.quality, DEFAULTS.quality), 64, 1024));
    quality += quality % 2;
    const cornerExponent = clamp(finiteNumber(raw.cornerExponent, DEFAULTS.cornerExponent), 2, 8);
    return {
      width,
      height,
      radius,
      strength: clamp(finiteNumber(raw.strength, DEFAULTS.strength), 0, 0.25),
      chromaticAberration: clamp(
        finiteNumber(raw.chromaticAberration, DEFAULTS.chromaticAberration),
        0,
        1,
      ),
      blur: clamp(finiteNumber(raw.blur, DEFAULTS.blur), 0, 16),
      depth: clamp(finiteNumber(raw.depth, DEFAULTS.depth), 0.1, maximumRadius),
      curvature: clamp(finiteNumber(raw.curvature, DEFAULTS.curvature), 0, 1),
      splay: clamp(finiteNumber(raw.splay, DEFAULTS.splay), 0, 1),
      glow: clamp(finiteNumber(raw.glow, DEFAULTS.glow), 0, 1),
      glowSpread: clamp(finiteNumber(raw.glowSpread, DEFAULTS.glowSpread), 0, 1),
      glowExponent: clamp(finiteNumber(raw.glowExponent, DEFAULTS.glowExponent), 0.1, 8),
      edgeHighlight: clamp(finiteNumber(raw.edgeHighlight, DEFAULTS.edgeHighlight), 0, 1),
      edgeWidth: clamp(finiteNumber(raw.edgeWidth, DEFAULTS.edgeWidth), 0.1, maximumRadius),
      edgeExponent: clamp(finiteNumber(raw.edgeExponent, DEFAULTS.edgeExponent), 0.1, 8),
      specular: clamp(finiteNumber(raw.specular, DEFAULTS.specular), 0, 2),
      specularAngle: clamp(finiteNumber(raw.specularAngle, DEFAULTS.specularAngle), -180, 180),
      quality,
      outerShape: raw.outerShape === "global-superellipse"
        ? "global-superellipse"
        : raw.outerShape === "superellipse" && cornerExponent > 2
          ? "superellipse"
          : "round",
      cornerExponent,
    };
  }

  function superellipsePoint(t, radius, exponent) {
    const power = 2 / exponent;
    return {
      x: radius * Math.pow(Math.max(0, Math.cos(t)), power),
      y: radius * Math.pow(Math.max(0, Math.sin(t)), power),
    };
  }

  function superellipseCornerDistance(x, y, radius, exponent) {
    const normalized = Math.pow(x / radius, exponent) + Math.pow(y / radius, exponent);
    let lower = 0;
    let upper = Math.PI / 2;
    let parameter = Math.atan2(y, x);
    const derivativeStep = 1e-4;

    function distanceSquared(t) {
      const point = superellipsePoint(t, radius, exponent);
      return (point.x - x) ** 2 + (point.y - y) ** 2;
    }

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const before = Math.max(lower, parameter - derivativeStep);
      const after = Math.min(upper, parameter + derivativeStep);
      const currentDistance = distanceSquared(parameter);
      const beforeDistance = distanceSquared(before);
      const afterDistance = distanceSquared(after);
      const span = Math.max(1e-9, after - before);
      const firstDerivative = (afterDistance - beforeDistance) / span;
      const halfSpan = Math.max(1e-9, span / 2);
      const secondDerivative = (afterDistance - 2 * currentDistance + beforeDistance)
        / (halfSpan * halfSpan);
      if (firstDerivative > 0) {
        upper = parameter;
      } else {
        lower = parameter;
      }
      const candidate = Number.isFinite(secondDerivative) && Math.abs(secondDerivative) > 1e-9
        ? parameter - firstDerivative / secondDerivative
        : Number.NaN;
      parameter = Number.isFinite(candidate) && candidate > lower && candidate < upper
        ? candidate
        : (lower + upper) / 2;
    }

    const boundary = superellipsePoint(parameter, radius, exponent);
    const distance = Math.hypot(x - boundary.x, y - boundary.y);
    return normalized <= 1 ? -distance : distance;
  }

  function roundedSuperellipseDistance(x, y, halfWidth, halfHeight, radius, exponent) {
    const qx = x - halfWidth + radius;
    const qy = y - halfHeight + radius;
    if (radius > 0 && qx > 0 && qy > 0) {
      return superellipseCornerDistance(qx, qy, radius, exponent);
    }
    const outsideX = Math.max(qx, 0);
    const outsideY = Math.max(qy, 0);
    return Math.hypot(outsideX, outsideY) + Math.min(Math.max(qx, qy), 0) - radius;
  }

  function globalSuperellipseDistance(x, y, halfWidth, halfHeight, exponent) {
    if (halfWidth <= 1e-6 || halfHeight <= 1e-6) {
      return Math.hypot(x, y);
    }
    const normalizedX = Math.abs(x) / halfWidth;
    const normalizedY = Math.abs(y) / halfHeight;
    const implicit = Math.pow(normalizedX, exponent)
      + Math.pow(normalizedY, exponent) - 1;
    const gradientX = exponent * Math.pow(normalizedX, exponent - 1) / halfWidth;
    const gradientY = exponent * Math.pow(normalizedY, exponent - 1) / halfHeight;
    const gradientLength = Math.hypot(gradientX, gradientY);
    return gradientLength > 1e-9
      ? implicit / gradientLength
      : -Math.min(halfWidth, halfHeight);
  }

  function erf(value) {
    return Math.tanh(1.7724538509 * value);
  }

  function averageDomeGradient(radius, halfExtent) {
    let sum = 0;
    for (let index = 0; index <= 200; index += 1) {
      const sample = index / 200 * halfExtent;
      const gradient = sample / Math.sqrt(radius * radius - sample * sample);
      sum += index === 0 || index === 200 ? 0.5 * gradient : gradient;
    }
    return sum / 200;
  }

  function computeDomeConstants(depth, halfWidth, halfHeight) {
    const normalizedDepth = Math.max(0.01, Math.min(
      depth,
      Math.min(halfWidth, halfHeight) - 1,
    ));
    const radiusX = (halfWidth * halfWidth + normalizedDepth * normalizedDepth)
      / (2 * normalizedDepth);
    const radiusY = (halfHeight * halfHeight + normalizedDepth * normalizedDepth)
      / (2 * normalizedDepth);
    const gradientX = averageDomeGradient(radiusX, halfWidth);
    const gradientY = averageDomeGradient(radiusY, halfHeight);
    return {
      radiusX,
      radiusY,
      scaleX: gradientX > 0 ? 0.5 / gradientX : 1,
      scaleY: gradientY > 0 ? 0.5 / gradientY : 1,
    };
  }

  function domeGradient(offset, radius, scale) {
    const sample = Math.min(offset, 0.999 * radius);
    return sample / Math.sqrt(radius * radius - sample * sample) * scale;
  }

  function computeDisplacementMap(rawOptions = {}) {
    const options = normalizeOptions(rawOptions);
    const size = options.quality;
    const half = size >> 1;
    const pixels = new Uint8ClampedArray(size * size * 4);
    const halfWidth = options.width / 2;
    const halfHeight = options.height / 2;
    const cornerRadius = Math.min(options.radius, halfWidth, halfHeight);
    const innerWidth = Math.max(0, halfWidth - options.depth);
    const innerHeight = Math.max(0, halfHeight - options.depth);
    const innerRadius = Math.max(0, Math.min(cornerRadius, innerWidth, innerHeight));
    const falloffScale = options.depth > 0 ? 1 / (options.depth * Math.SQRT2) : 1e6;
    const hasSpecular = options.glow > 0 || options.edgeHighlight > 0;
    const theta = options.specularAngle * Math.PI / 180;
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    const glowMinimum = (1 - options.glowSpread) * Math.SQRT2;
    const glowRange = options.glowSpread * Math.SQRT2;
    const glowInverse = glowRange > 0.001 ? 1 / glowRange : 0;
    const edgeInverse = options.edgeWidth > 0 ? 1 / options.edgeWidth : 0;
    const stepX = 2 * halfWidth / size;
    const stepY = 2 * halfHeight / size;
    const inverseWidth = 1 / halfWidth;
    const inverseHeight = 1 / halfHeight;
    const domeDepth = options.curvature * Math.min(halfWidth, halfHeight);
    const dome = domeDepth > 0
      ? computeDomeConstants(domeDepth, halfWidth, halfHeight)
      : null;
    const domeColumns = dome ? new Float32Array(half) : null;

    if (dome && domeColumns) {
      const radiusSquared = dome.radiusX * dome.radiusX;
      const cap = 0.999 * dome.radiusX;
      for (let column = 0; column < half; column += 1) {
        const x = -((column + 0.5) * stepX - halfWidth);
        const sample = Math.min(x, cap);
        domeColumns[column] = sample / Math.sqrt(radiusSquared - sample * sample)
          * dome.scaleX;
      }
    }

    const applySplay = options.splay < 1;
    const splayMix = 1 - options.splay;
    const splayHalf = 0.5 * Math.min(halfWidth, halfHeight);
    const splayInverse = splayHalf > 0 ? 1 / splayHalf : 0;

    for (let row = 0; row < half; row += 1) {
      const mirrorRow = size - 1 - row;
      const y = -((row + 0.5) * stepY - halfHeight);
      const sdfY = y - halfHeight + cornerRadius;
      const fallY = y - innerHeight + innerRadius;
      const gradientY = dome
        ? domeGradient(y, dome.radiusY, dome.scaleY)
        : Math.min(1, y * inverseHeight);
      const clampedY = Math.min(1, y * inverseHeight);
      const splayY = applySplay ? Math.max(0, 1 - (halfHeight - y) * splayInverse) : 0;

      for (let column = 0; column < half; column += 1) {
        const mirrorColumn = size - 1 - column;
        const x = -((column + 0.5) * stepX - halfWidth);
        const sdfX = x - halfWidth + cornerRadius;
        const outsideX = Math.max(sdfX, 0);
        const outsideY = Math.max(sdfY, 0);
        const outsideSquared = outsideX * outsideX + outsideY * outsideY;
        const signedDistance = options.outerShape === "global-superellipse"
          ? globalSuperellipseDistance(
            x,
            y,
            halfWidth,
            halfHeight,
            options.cornerExponent,
          )
          : options.outerShape === "superellipse"
            ? roundedSuperellipseDistance(
            x,
            y,
            halfWidth,
            halfHeight,
            cornerRadius,
            options.cornerExponent,
          )
            : (outsideSquared > 0 ? Math.sqrt(outsideSquared) : 0)
              + (sdfX > sdfY
                ? (sdfX > 0 ? 0 : sdfX)
                : (sdfY > 0 ? 0 : sdfY))
              - cornerRadius;
        const topLeft = (row * size + column) * 4;
        const topRight = (row * size + mirrorColumn) * 4;
        const bottomLeft = (mirrorRow * size + column) * 4;
        const bottomRight = (mirrorRow * size + mirrorColumn) * 4;

        if (signedDistance >= 0) {
          [topLeft, topRight, bottomLeft, bottomRight].forEach((offset) => {
            pixels[offset] = 128;
            pixels[offset + 1] = 128;
            pixels[offset + 2] = 128;
            pixels[offset + 3] = 0;
          });
          continue;
        }

        let displacementX = dome && domeColumns
          ? domeColumns[column]
          : Math.min(1, x * inverseWidth);
        let displacementY = gradientY;
        if (applySplay) {
          const attenuationX = splayY * splayMix;
          const attenuationY = Math.max(0, 1 - (halfWidth - x) * splayInverse) * splayMix;
          if (attenuationX > 0.001 || attenuationY > 0.001) {
            const originalX = displacementX;
            const originalY = displacementY;
            displacementX *= 1 - attenuationX;
            displacementY *= 1 - attenuationY;
            const originalLength = Math.hypot(originalX, originalY);
            const nextLength = Math.hypot(displacementX, displacementY);
            if (nextLength > 0.001) {
              const scale = originalLength / nextLength;
              displacementX *= scale;
              displacementY *= scale;
            }
          }
        }

        const innerX = x - innerWidth + innerRadius;
        const rampX = Math.max(innerX, 0);
        const rampY = Math.max(fallY, 0);
        const innerDistance = options.outerShape === "global-superellipse"
          ? globalSuperellipseDistance(
            x,
            y,
            innerWidth,
            innerHeight,
            options.cornerExponent,
          )
          : options.outerShape === "superellipse"
            ? roundedSuperellipseDistance(
            x,
            y,
            innerWidth,
            innerHeight,
            innerRadius,
            options.cornerExponent,
          )
            : Math.sqrt(rampX * rampX + rampY * rampY)
              + (innerX > fallY
                ? (innerX > 0 ? 0 : innerX)
                : (fallY > 0 ? 0 : fallY))
              - innerRadius;
        const falloff = 0.5 * (1 + erf(innerDistance * falloffScale));
        const halfX = 0.5 * displacementX * falloff;
        const halfY = 0.5 * displacementY * falloff;
        const redPlus = Math.round((0.5 + halfX) * 255);
        const redMinus = Math.round((0.5 - halfX) * 255);
        const greenPlus = Math.round((0.5 + halfY) * 255);
        const greenMinus = Math.round((0.5 - halfY) * 255);
        let blueSum = 128;
        let blueDifference = 128;

        if (hasSpecular) {
          const projectedX = Math.min(1, x * inverseWidth) * cosine;
          const projectedY = clampedY * sine;
          const projectionSum = Math.abs(projectedX + projectedY);
          const projectionDifference = Math.abs(projectedX - projectedY);
          let band = 0;
          if (options.edgeHighlight > 0) {
            band = Math.max(0, 1 + signedDistance * edgeInverse);
          }
          let sum = 0;
          let difference = 0;
          if (options.glow > 0) {
            const sumProgress = clamp((projectionSum - glowMinimum) * glowInverse, 0, 1);
            const differenceProgress = clamp(
              (projectionDifference - glowMinimum) * glowInverse,
              0,
              1,
            );
            sum += options.glow * Math.pow(sumProgress, options.glowExponent) * falloff;
            difference += options.glow
              * Math.pow(differenceProgress, options.glowExponent)
              * falloff;
          }
          if (options.edgeHighlight > 0) {
            sum += options.edgeHighlight * band * Math.pow(projectionSum, options.edgeExponent);
            difference += options.edgeHighlight
              * band
              * Math.pow(projectionDifference, options.edgeExponent);
          }
          blueSum = Math.round(128 + 127 * Math.min(1, sum));
          blueDifference = Math.round(128 + 127 * Math.min(1, difference));
        }

        pixels[topLeft] = redPlus;
        pixels[topLeft + 1] = greenPlus;
        pixels[topLeft + 2] = blueSum;
        pixels[topLeft + 3] = 255;
        pixels[topRight] = redMinus;
        pixels[topRight + 1] = greenPlus;
        pixels[topRight + 2] = blueDifference;
        pixels[topRight + 3] = 255;
        pixels[bottomLeft] = redPlus;
        pixels[bottomLeft + 1] = greenMinus;
        pixels[bottomLeft + 2] = blueDifference;
        pixels[bottomLeft + 3] = 255;
        pixels[bottomRight] = redMinus;
        pixels[bottomRight + 1] = greenMinus;
        pixels[bottomRight + 2] = blueSum;
        pixels[bottomRight + 3] = 255;
      }
    }

    return { options, width: size, height: size, pixels };
  }

  function pixelsToDataUrl(pixels, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return "";
    }
    const image = context.createImageData(width, height);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL();
  }

  function extractSpecularPreview(map) {
    const pixels = new Uint8ClampedArray(map.pixels.length);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const intensity = Math.max(0, (map.pixels[offset + 2] - 128) * 2);
      pixels[offset] = intensity;
      pixels[offset + 1] = intensity;
      pixels[offset + 2] = intensity;
      pixels[offset + 3] = map.pixels[offset + 3];
    }
    return pixels;
  }

  function rebuildFilter(glass, svgDefs, rawOptions = {}) {
    const width = glass.offsetWidth;
    const height = glass.offsetHeight;
    if (width < 2 || height < 2) {
      return null;
    }
    const started = typeof performance === "object" ? performance.now() : Date.now();
    const options = normalizeOptions({ ...rawOptions, width, height });
    const map = computeDisplacementMap(options);
    const mapUrl = pixelsToDataUrl(map.pixels, map.width, map.height);
    const specularUrl = pixelsToDataUrl(
      extractSpecularPreview(map),
      map.width,
      map.height,
    );
    const scale = options.strength * Math.hypot(width, height) / Math.SQRT2;
    const chroma = options.chromaticAberration;
    const scales = [scale * (1 + 0.2 * chroma), scale * (1 + 0.1 * chroma), scale];
    const expansion = Math.ceil(Math.max(...scales) + options.blur * 3 + 2);
    const blurInput = options.blur > 0 ? "sdfBlurred" : "SourceGraphic";
    const channels = [
      "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
      "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
      "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0",
    ];

    svgDefs.innerHTML = `
      <filter id="liquid-glass-sdf-filter"
        x="${-expansion}" y="${-expansion}"
        width="${width + expansion * 2}" height="${height + expansion * 2}"
        filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB">
        <feFlood flood-color="rgb(128,128,128)" flood-opacity="1" result="sdfMapBackground" />
        <feImage href="${mapUrl}" x="0" y="0" width="${width}" height="${height}"
          preserveAspectRatio="none" result="sdfRawMap" />
        <feComposite in="sdfRawMap" in2="sdfMapBackground" operator="over" result="sdfMap" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="${options.blur}" result="sdfBlurred" />
        ${scales.map((channelScale, index) => `
          <feDisplacementMap in="${blurInput}" in2="sdfMap" scale="${channelScale}"
            xChannelSelector="R" yChannelSelector="G" result="sdfDisplaced${index}" />
          <feColorMatrix in="sdfDisplaced${index}" type="matrix" values="${channels[index]}"
            result="sdfChannel${index}" />
        `).join("")}
        <feComposite in="sdfChannel0" in2="sdfChannel1" operator="arithmetic"
          k1="0" k2="1" k3="1" k4="0" result="sdfRedGreen" />
        <feComposite in="sdfRedGreen" in2="sdfChannel2" operator="arithmetic"
          k1="0" k2="1" k3="1" k4="0" result="sdfLensResult" />
        <feColorMatrix in="sdfMap" type="matrix"
          values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 1 0 ${-128 / 255}"
          result="sdfSpecularMask" />
        <feComposite in="sdfSpecularMask" in2="sdfLensResult" operator="arithmetic"
          k1="0" k2="${options.specular}" k3="1" k4="0" result="sdfLensWithSpecular" />
        <feColorMatrix in="sdfRawMap" type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
          result="sdfLensShape" />
        <feComposite in="sdfLensWithSpecular" in2="sdfLensShape" operator="in" />
      </filter>
    `;

    const completed = typeof performance === "object" ? performance.now() : Date.now();
    return {
      options,
      width,
      height,
      mapWidth: map.width,
      mapHeight: map.height,
      mapUrl,
      specularUrl,
      scale,
      generationMs: Math.max(0, completed - started),
    };
  }

  return Object.freeze({
    DEFAULTS,
    LAB_DEFAULTS,
    normalizeOptions,
    computeDisplacementMap,
    rebuildFilter,
  });
});
