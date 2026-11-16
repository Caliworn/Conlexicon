(() => {
  const NS = "http://www.w3.org/2000/svg";
  const winuiDefault = Object.freeze({
    light: Object.freeze({ color: "#fcfcfc", matte: "#f9f9f9", blur: 30, luma: 85, tint: 0 }),
    dark: Object.freeze({ color: "#2c2c2c", matte: "#2c2c2c", blur: 30, luma: 96, tint: 15 }),
  });

  function supportsWinuiBackdrop() {
    // Some engines accept the syntax without painting an SVG backdrop.
    return /\b(?:Headless)?Chrom(?:e|ium)\/\d/.test(navigator.userAgent)
      && CSS.supports("backdrop-filter", 'url("#layered-acrylic-light")');
  }

  function createSvgElement(name, attributes) {
    const element = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function createWinuiFilter(id) {
    const filter = createSvgElement("filter", {
      id, x: "-50%", y: "-75%", width: "200%", height: "250%", "color-interpolation-filters": "sRGB",
    });
    const matte = createSvgElement("feFlood", { result: "matte" });
    const opaque = createSvgElement("feComposite", { in: "SourceGraphic", in2: "matte", operator: "over", result: "opaque" });
    const blur = createSvgElement("feGaussianBlur", { in: "opaque", edgeMode: "duplicate", result: "blurred" });
    const luminosity = createSvgElement("feFlood", { result: "luminosity" });
    const balance = createSvgElement("feBlend", { in: "luminosity", in2: "blurred", mode: "luminosity", result: "balanced" });
    const tint = createSvgElement("feFlood", { result: "tint" });
    const color = createSvgElement("feBlend", { in: "tint", in2: "balanced", mode: "color" });
    filter.append(matte, opaque, blur, luminosity, balance);

    // WinUI quantizes each layer's opacity to an eight-bit alpha.
    const alpha = percent => Math.round(percent * 255 / 100) / 255;
    function setMaterial(material) {
      matte.setAttribute("flood-color", material.matte);
      blur.setAttribute("stdDeviation", material.blur);
      luminosity.setAttribute("flood-color", material.color);
      luminosity.setAttribute("flood-opacity", alpha(material.luma));
      if (material.tint > 0) {
        tint.setAttribute("flood-color", material.color);
        tint.setAttribute("flood-opacity", alpha(material.tint));
        if (!tint.parentNode) filter.append(tint, color);
      } else {
        tint.remove();
        color.remove();
      }
    }
    return { filter, setMaterial };
  }

  window.ConlexiconAcrylic = Object.freeze({ winuiDefault, supportsWinuiBackdrop, createWinuiFilter });
})();
