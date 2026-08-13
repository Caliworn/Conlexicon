(function initLiquidGlassEngine(root, factory) {
  const geometry = typeof module === "object" && module.exports
    ? require("./liquid-glass-geometry")
    : root.ConlexiconLiquidGlassGeometry;
  const api = factory(geometry);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConlexiconLiquidGlassEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createLiquidGlassEngineApi(geometry) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DIAGNOSTIC_QUERY = "liquid-glass-diagnostics";
  const DEFAULT_LIGHT_VECTOR = Object.freeze({ x: -0.55, y: -0.84, strength: 1 });
  const ROLE_DEFAULTS = Object.freeze({
    continuous: Object.freeze({
      bezel: 44,
      thickness: 17,
      ior: 1.43,
      maxDisplacement: 12,
      specularStrength: 0.48,
      maximumMapDimension: 420,
      opticalBlur: 3,
      saturation: 1.06,
    }),
    focus: Object.freeze({
      bezel: 46,
      thickness: 21,
      ior: 1.46,
      maxDisplacement: 17,
      specularStrength: 0.64,
      maximumMapDimension: 480,
      opticalBlur: 4,
      saturation: 1.09,
    }),
    floating: Object.freeze({
      bezel: 36,
      thickness: 23,
      ior: 1.48,
      maxDisplacement: 22,
      specularStrength: 0.78,
      maximumMapDimension: 448,
      opticalBlur: 5.5,
      saturation: 1.12,
    }),
    modal: Object.freeze({
      bezel: 52,
      thickness: 22,
      ior: 1.45,
      maxDisplacement: 16,
      specularStrength: 0.56,
      maximumMapDimension: 512,
      opticalBlur: 7,
      saturation: 1.08,
    }),
    micro: Object.freeze({
      bezel: 8,
      thickness: 7,
      ior: 1.42,
      maxDisplacement: 4,
      specularStrength: 0.48,
      maximumMapDimension: 192,
      opticalBlur: 0.1,
      saturation: 1.04,
    }),
  });
  const SURFACE_ROLE_DEFINITIONS = Object.freeze([
    Object.freeze({
      role: "continuous",
      selector: ".dictionary-panel",
      registration: "automatic",
      sampleBackdrop: true,
      overrides: Object.freeze({ edgeMode: "right" }),
    }),
    Object.freeze({
      role: "continuous",
      selector: ".mobile-app-bar",
      registration: "automatic",
      sampleBackdrop: true,
      overrides: Object.freeze({ edgeMode: "bottom" }),
    }),
    Object.freeze({
      role: "focus",
      selector: ".entry-display, #entryForm",
      registration: "automatic",
      sampleBackdrop: true,
    }),
    Object.freeze({
      role: "floating",
      selector: ".entry-search-config-menu, .entry-filter-menu, .source-suggestions, .skin-picker-menu",
      registration: "automatic",
      sampleBackdrop: true,
    }),
    Object.freeze({
      role: "floating",
      selector: ".entry-context-menu, .app-tooltip.chip-list-tooltip, .app-tooltip.tag-info-tooltip, .app-tooltip.rich-tooltip, .entry-quality-issue-tooltip, .toast",
      registration: "explicit",
      sampleBackdrop: true,
    }),
    Object.freeze({
      role: "modal",
      selector: ".modal-panel, .network-panel",
      registration: "automatic",
      sampleBackdrop: true,
    }),
    Object.freeze({
      role: "micro",
      selector: "button, input:not([type=\"checkbox\"]):not([type=\"radio\"]), textarea, select, .chip",
      registration: "css",
      sampleBackdrop: false,
    }),
  ]);

  function surfaceRoleDefinition(element, options = {}) {
    if (!element?.matches) {
      return null;
    }
    const includeCssOnly = Boolean(options.includeCssOnly);
    return SURFACE_ROLE_DEFINITIONS.find((definition) => (
      (definition.sampleBackdrop || includeCssOnly) && element.matches(definition.selector)
    )) || null;
  }

  function surfaceOverridesEqual(left = {}, right = {}) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    return keys.every((key) => left[key] === right[key]);
  }

  function normalizeLightVector(x, y, strength = 1) {
    let lightX = Number(x);
    let lightY = Number(y);
    if (!Number.isFinite(lightX) || !Number.isFinite(lightY) || Math.hypot(lightX, lightY) < 0.001) {
      lightX = DEFAULT_LIGHT_VECTOR.x;
      lightY = DEFAULT_LIGHT_VECTOR.y;
    }
    const length = Math.hypot(lightX, lightY) || 1;
    return {
      x: lightX / length,
      y: lightY / length,
      strength: Math.min(1.35, Math.max(0, Number(strength) || 0)),
    };
  }

  function lightFacingMatrixValues(light) {
    const x = Number(light.x.toFixed(4));
    const y = Number(light.y.toFixed(4));
    const bias = Number((-x - y).toFixed(4));
    const row = `${2 * x} ${2 * y} 0 0 ${bias}`;
    return `${row} ${row} ${row} 0 0 0 1 0`;
  }

  function nextTask(callback, runtimeWindow) {
    if (typeof runtimeWindow.requestIdleCallback === "function") {
      return runtimeWindow.requestIdleCallback(callback, { timeout: 32 });
    }
    return runtimeWindow.setTimeout(() => callback({ timeRemaining: () => 0 }), 0);
  }

  function cancelTask(taskId, runtimeWindow) {
    if (typeof runtimeWindow.cancelIdleCallback === "function") {
      runtimeWindow.cancelIdleCallback(taskId);
      return;
    }
    runtimeWindow.clearTimeout(taskId);
  }

  class ByteBudgetLru {
    constructor(options = {}) {
      this.maxBytes = Math.max(1, Number(options.maxBytes) || 32 * 1024 * 1024);
      this.onEvict = typeof options.onEvict === "function" ? options.onEvict : () => {};
      this.entries = new Map();
      this.totalBytes = 0;
    }

    get(key) {
      const entry = this.entries.get(key);
      if (!entry) {
        return undefined;
      }
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.value;
    }

    set(key, value, bytes = 0) {
      this.delete(key, true);
      this.entries.set(key, {
        value,
        bytes: Math.max(0, Number(bytes) || 0),
        refCount: 0,
      });
      this.totalBytes += Math.max(0, Number(bytes) || 0);
      return value;
    }

    has(key) {
      return this.entries.has(key);
    }

    retain(key) {
      const entry = this.entries.get(key);
      if (!entry) {
        return false;
      }
      entry.refCount += 1;
      this.get(key);
      return true;
    }

    release(key) {
      const entry = this.entries.get(key);
      if (!entry) {
        return false;
      }
      entry.refCount = Math.max(0, entry.refCount - 1);
      return true;
    }

    delete(key, force = false) {
      const entry = this.entries.get(key);
      if (!entry || (!force && entry.refCount > 0)) {
        return false;
      }
      this.entries.delete(key);
      this.totalBytes -= entry.bytes;
      this.onEvict(entry.value, key);
      return true;
    }

    evictOverflow() {
      let evicted = 0;
      while (this.totalBytes > this.maxBytes) {
        const candidate = [...this.entries.entries()]
          .find(([, entry]) => entry.refCount === 0);
        if (!candidate || !this.delete(candidate[0])) {
          break;
        }
        evicted += 1;
      }
      return evicted;
    }

    clear() {
      [...this.entries.keys()].forEach((key) => this.delete(key, true));
      this.totalBytes = 0;
    }

    stats() {
      return {
        entries: this.entries.size,
        bytes: this.totalBytes,
        retained: [...this.entries.values()].filter((entry) => entry.refCount > 0).length,
      };
    }
  }

  class WorkerMapRenderer {
    constructor(runtimeWindow, workerUrl) {
      this.worker = new runtimeWindow.Worker(workerUrl);
      this.pending = new Map();
      this.nextId = 1;
      this.disposed = false;
      this.worker.addEventListener("message", (event) => this.handleMessage(event));
      this.worker.addEventListener("error", (event) => this.handleFailure(
        new Error(event.message || "Liquid Glass map worker failed."),
      ));
    }

    handleMessage(event) {
      const pending = this.pending.get(event.data?.id);
      if (!pending) {
        return;
      }
      this.pending.delete(event.data.id);
      if (event.data.error) {
        pending.reject(new Error(event.data.error));
        return;
      }
      pending.resolve(event.data);
    }

    handleFailure(error) {
      [...this.pending.values()].forEach((pending) => pending.reject(error));
      this.pending.clear();
    }

    render(options) {
      if (this.disposed) {
        return Promise.reject(new Error("Liquid Glass map worker is disposed."));
      }
      const id = this.nextId;
      this.nextId += 1;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ id, options });
      });
    }

    dispose() {
      if (this.disposed) {
        return;
      }
      this.disposed = true;
      this.worker.terminate();
      this.handleFailure(new Error("Liquid Glass map worker was stopped."));
    }
  }

  class ChunkedMapRenderer {
    constructor(runtimeWindow) {
      this.window = runtimeWindow;
      this.tasks = new Set();
      this.disposed = false;
    }

    render(options) {
      if (this.disposed) {
        return Promise.reject(new Error("Liquid Glass fallback renderer is disposed."));
      }
      const generator = geometry.createSurfaceMapGenerator(options);
      return new Promise((resolve, reject) => {
        const task = { id: 0, reject };
        this.tasks.add(task);
        const run = (deadline) => {
          if (this.disposed || !this.tasks.has(task)) {
            reject(new Error("Liquid Glass fallback rendering was cancelled."));
            return;
          }
          const started = Date.now();
          let complete = false;
          do {
            complete = generator.step(4);
          } while (
            !complete
            && Date.now() - started < 7
            && (typeof deadline.timeRemaining !== "function" || deadline.timeRemaining() > 1)
          );
          if (complete) {
            this.tasks.delete(task);
            resolve(generator.result());
            return;
          }
          task.id = nextTask(run, this.window);
        };
        task.id = nextTask(run, this.window);
      });
    }

    dispose() {
      if (this.disposed) {
        return;
      }
      this.disposed = true;
      [...this.tasks].forEach((task) => {
        cancelTask(task.id, this.window);
        task.reject(new Error("Liquid Glass fallback renderer was stopped."));
      });
      this.tasks.clear();
    }
  }

  class ResilientMapRenderer {
    constructor(runtimeWindow, workerUrl) {
      this.workerRenderer = null;
      this.fallbackRenderer = new ChunkedMapRenderer(runtimeWindow);
      if (typeof runtimeWindow.Worker === "function") {
        try {
          this.workerRenderer = new WorkerMapRenderer(runtimeWindow, workerUrl);
        } catch (error) {
          this.workerRenderer = null;
        }
      }
    }

    async render(options) {
      if (this.workerRenderer) {
        try {
          return await this.workerRenderer.render(options);
        } catch (error) {
          this.workerRenderer.dispose();
          this.workerRenderer = null;
        }
      }
      return this.fallbackRenderer.render(options);
    }

    dispose() {
      this.workerRenderer?.dispose();
      this.fallbackRenderer.dispose();
    }
  }

  function hashKey(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function radiusPixels(value) {
    const parsed = Number.parseFloat(String(value || "0"));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function svgElement(documentRef, name, attributes = {}) {
    const element = documentRef.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  class LiquidGlassEngine {
    constructor(options = {}) {
      this.window = options.window || (typeof window !== "undefined" ? window : null);
      this.document = options.document || this.window?.document || null;
      this.workerUrl = String(options.workerUrl || "lib/liquid-glass-map-worker.js");
      this.maxBytes = Math.max(1024 * 1024, Number(options.maxBytes) || 32 * 1024 * 1024);
      this.active = false;
      this.quality = "off";
      this.sessionGeneration = 0;
      this.renderer = null;
      this.resizeObserver = null;
      this.resizeTimers = new Map();
      this.surfaces = new Map();
      this.inFlight = new Map();
      this.diagnosticRoot = null;
      this.lightVector = { ...DEFAULT_LIGHT_VECTOR };
      this.cache = new ByteBudgetLru({
        maxBytes: this.maxBytes,
        onEvict: (resource) => this.destroyResource(resource),
      });
    }

    detectQuality() {
      if (!this.window || !this.document) {
        return "off";
      }
      if (
        this.window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches
        || this.window.matchMedia?.("(forced-colors: active)").matches
      ) {
        return "q0";
      }
      const css = this.window.CSS;
      const supportsBlur = Boolean(css?.supports?.("backdrop-filter", "blur(1px)"))
        || Boolean(css?.supports?.("-webkit-backdrop-filter", "blur(1px)"));
      const supportsUrl = Boolean(css?.supports?.("backdrop-filter", 'url("#liquid-glass-optical-probe")'))
        || Boolean(css?.supports?.("-webkit-backdrop-filter", 'url("#liquid-glass-optical-probe")'));
      const canvas = this.document.createElement("canvas");
      const supportsCanvas = Boolean(canvas.getContext?.("2d"));
      return supportsBlur && supportsUrl && supportsCanvas ? "q3" : "q1";
    }

    setLightVector(x, y, strength = 1) {
      const next = normalizeLightVector(x, y, strength);
      if (
        Math.abs(next.x - this.lightVector.x) < 0.0005
        && Math.abs(next.y - this.lightVector.y) < 0.0005
        && Math.abs(next.strength - this.lightVector.strength) < 0.0005
      ) {
        return false;
      }
      this.lightVector = next;
      this.cache.entries.forEach((entry) => this.updateResourceLight(entry.value));
      return true;
    }

    resetLightVector() {
      return this.setLightVector(
        DEFAULT_LIGHT_VECTOR.x,
        DEFAULT_LIGHT_VECTOR.y,
        DEFAULT_LIGHT_VECTOR.strength,
      );
    }

    updateResourceLight(resource) {
      if (!resource?.lightingNodes) {
        return;
      }
      resource.lightingNodes.facingMatrix.setAttribute(
        "values",
        lightFacingMatrixValues(this.lightVector),
      );
      const slope = Math.max(
        0,
        Math.min(1.35, resource.specularStrength * this.lightVector.strength),
      );
      resource.lightingNodes.strengthFunctions.forEach((node) => {
        node.setAttribute("slope", String(Number(slope.toFixed(4))));
      });
    }

    setEnabled(enabled) {
      if (!enabled) {
        this.deactivate();
        return;
      }
      const nextQuality = this.detectQuality();
      if (this.active && this.quality === nextQuality) {
        this.syncMappedSurfaces();
        return;
      }
      if (this.active) {
        this.deactivate();
      }
      this.activate(nextQuality);
    }

    activate(quality = this.detectQuality()) {
      if (!this.document || !this.window || this.active) {
        return;
      }
      this.active = true;
      this.quality = quality;
      this.sessionGeneration += 1;
      this.document.body.dataset.liquidGlassOpticsQuality = quality;
      if (quality === "q3") {
        this.resizeObserver = typeof this.window.ResizeObserver === "function"
          ? new this.window.ResizeObserver((entries) => this.handleResize(entries))
          : null;
        this.surfaces.forEach((record) => {
          this.resizeObserver?.observe(record.element);
          this.refresh(record.element);
        });
      }
      this.syncMappedSurfaces();
      if (this.diagnosticsRequested()) {
        this.mountDiagnostics();
      }
    }

    deactivate() {
      if (!this.active && this.quality === "off") {
        return;
      }
      this.active = false;
      this.quality = "off";
      this.sessionGeneration += 1;
      this.destroyDiagnostics();
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.resizeTimers.forEach((timer) => this.window.clearTimeout(timer));
      this.resizeTimers.clear();
      this.renderer?.dispose();
      this.renderer = null;
      this.inFlight.clear();
      this.surfaces.forEach((record) => this.releaseSurfaceResource(record));
      this.cache.clear();
      this.lightVector = { ...DEFAULT_LIGHT_VECTOR };
      this.unregisterMappedSurfaces();
      if (this.document?.body) {
        delete this.document.body.dataset.liquidGlassOpticsQuality;
      }
    }

    destroy() {
      this.deactivate();
      [...this.surfaces.keys()].forEach((element) => this.unregister(element));
    }

    diagnosticsRequested() {
      try {
        return new URLSearchParams(this.window.location.search).get(DIAGNOSTIC_QUERY) === "1";
      } catch (error) {
        return false;
      }
    }

    register(element, role = "floating", overrides = {}, metadata = {}) {
      if (!(element instanceof this.window.Element)) {
        throw new TypeError("Liquid Glass surfaces must be DOM elements.");
      }
      if (!ROLE_DEFAULTS[role]) {
        throw new TypeError(`Unknown Liquid Glass surface role: ${role}`);
      }
      const existing = this.surfaces.get(element);
      if (existing) {
        const roleChanged = existing.role !== role;
        const overridesChanged = !surfaceOverridesEqual(existing.overrides, overrides);
        existing.role = role;
        existing.overrides = { ...overrides };
        existing.mapped = existing.mapped || Boolean(metadata.mapped);
        existing.registration = metadata.registration || existing.registration;
        element.dataset.liquidGlassRole = role;
        if (
          this.active
          && this.quality === "q3"
          && (roleChanged || overridesChanged || metadata.forceRefresh)
        ) {
          this.refresh(element);
        }
        return () => this.unregister(element);
      }
      const record = {
        element,
        role,
        overrides: { ...overrides },
        generation: 0,
        cacheKey: "",
        resource: null,
        mapped: Boolean(metadata.mapped),
        registration: metadata.registration || "manual",
      };
      this.surfaces.set(element, record);
      element.dataset.liquidGlassRole = role;
      if (this.active && this.quality === "q3") {
        this.resizeObserver?.observe(element);
        this.refresh(element);
      } else {
        element.dataset.liquidGlassOptics = "fallback";
      }
      return () => this.unregister(element);
    }

    registerMappedSurface(element) {
      if (!this.active) {
        return false;
      }
      const definition = surfaceRoleDefinition(element);
      if (!definition?.sampleBackdrop) {
        return false;
      }
      this.register(element, definition.role, definition.overrides || {}, {
        mapped: true,
        registration: definition.registration,
        forceRefresh: true,
      });
      return true;
    }

    unregisterMappedSurface(element) {
      const record = this.surfaces.get(element);
      return record?.mapped ? this.unregister(element) : false;
    }

    syncMappedSurfaces(root = this.document) {
      if (!this.active || !root?.querySelectorAll) {
        return 0;
      }
      const matched = new Set();
      SURFACE_ROLE_DEFINITIONS
        .filter((definition) => definition.sampleBackdrop && definition.registration === "automatic")
        .forEach((definition) => {
          const candidates = [];
          if (root instanceof this.window.Element && root.matches(definition.selector)) {
            candidates.push(root);
          }
          candidates.push(...root.querySelectorAll(definition.selector));
          candidates.forEach((element) => {
            matched.add(element);
            this.register(element, definition.role, definition.overrides || {}, {
              mapped: true,
              registration: definition.registration,
            });
          });
        });
      [...this.surfaces.entries()].forEach(([element, record]) => {
        if (
          record.mapped
          && (!element.isConnected || (record.registration === "automatic" && !matched.has(element)))
        ) {
          this.unregister(element);
        }
      });
      return matched.size;
    }

    unregisterMappedSurfaces() {
      [...this.surfaces.entries()].forEach(([element, record]) => {
        if (record.mapped) {
          this.unregister(element);
        }
      });
    }

    unregister(element) {
      const record = this.surfaces.get(element);
      if (!record) {
        return false;
      }
      this.resizeObserver?.unobserve(element);
      const timer = this.resizeTimers.get(element);
      if (timer) {
        this.window.clearTimeout(timer);
        this.resizeTimers.delete(element);
      }
      record.generation += 1;
      this.releaseSurfaceResource(record);
      element.style.removeProperty("--liquid-glass-optical-filter");
      element.removeAttribute("data-liquid-glass-optics");
      element.removeAttribute("data-liquid-glass-role");
      this.surfaces.delete(element);
      return true;
    }

    handleResize(entries) {
      entries.forEach((entry) => {
        if (!this.surfaces.has(entry.target)) {
          return;
        }
        const current = this.resizeTimers.get(entry.target);
        if (current) {
          this.window.clearTimeout(current);
        }
        const timer = this.window.setTimeout(() => {
          this.resizeTimers.delete(entry.target);
          this.refresh(entry.target);
        }, 80);
        this.resizeTimers.set(entry.target, timer);
      });
    }

    surfaceOptions(record) {
      const bounds = record.element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return null;
      }
      const computed = this.window.getComputedStyle(record.element);
      if (computed.display === "none" || computed.visibility === "hidden") {
        return null;
      }
      const defaults = ROLE_DEFAULTS[record.role];
      const maximumMapDimension = Number(
        record.overrides.maximumMapDimension || defaults.maximumMapDimension,
      );
      const dimensions = geometry.mapDimensions(
        bounds.width,
        bounds.height,
        this.window.devicePixelRatio || 1,
        maximumMapDimension,
      );
      const normalized = geometry.normalizeSurfaceOptions({
        ...defaults,
        ...record.overrides,
        width: bounds.width,
        height: bounds.height,
        radii: [
          radiusPixels(computed.borderTopLeftRadius),
          radiusPixels(computed.borderTopRightRadius),
          radiusPixels(computed.borderBottomRightRadius),
          radiusPixels(computed.borderBottomLeftRadius),
        ],
        mapWidth: dimensions.width,
        mapHeight: dimensions.height,
      });
      return {
        ...normalized,
        opticalBlur: Number(record.overrides.opticalBlur ?? defaults.opticalBlur),
        saturation: Number(record.overrides.saturation ?? defaults.saturation),
      };
    }

    async refresh(element) {
      const record = this.surfaces.get(element);
      if (!record || !this.active) {
        return;
      }
      if (this.quality !== "q3" || !this.renderer) {
        if (this.quality !== "q3") {
          element.dataset.liquidGlassOptics = "fallback";
          return;
        }
        this.renderer = new ResilientMapRenderer(this.window, this.workerUrl);
      }
      const options = this.surfaceOptions(record);
      if (!options) {
        this.releaseSurfaceResource(record);
        element.dataset.liquidGlassOptics = "pending";
        return;
      }
      if (!options.q3Eligible) {
        record.generation += 1;
        this.releaseSurfaceResource(record);
        element.dataset.liquidGlassOptics = "fallback";
        this.updateDiagnosticStatus(element, "Q1 fallback: optical rim too small");
        return;
      }
      const key = [
        record.role,
        options.opticalBlur,
        options.saturation,
        geometry.buildCacheKey(options),
      ].join(":");
      if (record.cacheKey === key && record.resource) {
        return;
      }
      const generation = record.generation + 1;
      record.generation = generation;
      element.dataset.liquidGlassOptics = record.resource ? "ready" : "pending";
      const session = this.sessionGeneration;
      try {
        const resource = await this.acquireResource(key, options, session);
        if (
          !this.active
          || session !== this.sessionGeneration
          || record.generation !== generation
          || !element.isConnected
        ) {
          this.cache.release(key);
          this.cache.evictOverflow();
          return;
        }
        this.releaseSurfaceResource(record);
        record.cacheKey = key;
        record.resource = resource;
        element.style.setProperty("--liquid-glass-optical-filter", `url("#${resource.filterId}")`);
        element.dataset.liquidGlassOptics = "ready";
        this.updateDiagnosticStatus(element, "geometry map ready");
      } catch (error) {
        if (record.generation !== generation || !this.active) {
          return;
        }
        element.dataset.liquidGlassOptics = record.resource ? "ready" : "fallback";
        this.updateDiagnosticStatus(element, "Q1 fallback");
        console.warn("Liquid Glass optical surface fell back to ordinary material blur.", error);
      }
    }

    refreshAll() {
      if (!this.active) {
        return;
      }
      this.surfaces.forEach((record) => this.refresh(record.element));
    }

    async acquireResource(key, options, session) {
      let resource = this.cache.get(key);
      if (resource) {
        this.cache.retain(key);
        return resource;
      }
      let pending = this.inFlight.get(key);
      if (!pending) {
        pending = this.createResource(key, options, session);
        this.inFlight.set(key, pending);
        pending.finally(() => {
          if (this.inFlight.get(key) === pending) {
            this.inFlight.delete(key);
          }
        }).catch(() => {});
      }
      resource = await pending;
      if (!this.cache.has(key)) {
        this.cache.set(key, resource, resource.byteLength);
      } else if (this.cache.get(key) !== resource) {
        this.destroyResource(resource);
      }
      this.cache.retain(key);
      this.cache.evictOverflow();
      return this.cache.get(key);
    }

    async createResource(key, options, session) {
      const payload = await this.renderer.render(options);
      if (!this.active || session !== this.sessionGeneration) {
        throw new Error("Liquid Glass map generation belongs to an inactive session.");
      }
      const urls = await this.materializePayload(payload);
      if (!this.active || session !== this.sessionGeneration) {
        urls.forEach((url) => this.window.URL.revokeObjectURL(url));
        throw new Error("Liquid Glass map materialization belongs to an inactive session.");
      }
      try {
        const filterId = `liquid-glass-optical-${hashKey(key)}`;
        const filterParts = this.createFilter(filterId, urls, options);
        const resource = {
          key,
          filterId,
          filterElement: filterParts.filterElement,
          lightingNodes: filterParts.lightingNodes,
          specularStrength: options.specularStrength,
          urls,
          byteLength: Math.max(0, Number(payload.byteLength) || 0) + 4096,
        };
        this.updateResourceLight(resource);
        return resource;
      } catch (error) {
        urls.forEach((url) => this.window.URL.revokeObjectURL(url));
        throw error;
      }
    }

    async materializePayload(payload) {
      if (payload.displacementBlob && payload.specularBlob) {
        return [
          this.window.URL.createObjectURL(payload.displacementBlob),
          this.window.URL.createObjectURL(payload.specularBlob),
        ];
      }
      const [displacementBlob, specularBlob] = await Promise.all([
        this.bufferToBlob(payload.displacementBuffer || payload.displacement?.buffer, payload.width, payload.height),
        this.bufferToBlob(payload.specularBuffer || payload.specular?.buffer, payload.width, payload.height),
      ]);
      return [
        this.window.URL.createObjectURL(displacementBlob),
        this.window.URL.createObjectURL(specularBlob),
      ];
    }

    bufferToBlob(buffer, width, height) {
      if (!buffer) {
        return Promise.reject(new Error("Liquid Glass renderer returned an empty map."));
      }
      const canvas = this.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) {
        return Promise.reject(new Error("Liquid Glass could not create a 2D canvas context."));
      }
      const bytes = new Uint8ClampedArray(buffer);
      const imageData = typeof this.window.ImageData === "function"
        ? new this.window.ImageData(bytes, width, height)
        : context.createImageData(width, height);
      if (imageData.data !== bytes) {
        imageData.data.set(bytes);
      }
      context.putImageData(imageData, 0, 0);
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Liquid Glass could not encode a generated map."));
          }
        }, "image/png");
      });
    }

    createFilter(filterId, urls, options) {
      const host = this.document.querySelector("#liquidGlassFilterDefs defs");
      if (!host) {
        throw new Error("Liquid Glass SVG filter host is missing.");
      }
      const blurExpansion = Math.ceil(options.opticalBlur * 3);
      const expansionX = Math.max(
        6,
        Math.ceil((options.maxDisplacement * 1.1 + blurExpansion + 4) / options.width * 100),
      );
      const expansionY = Math.max(
        6,
        Math.ceil((options.maxDisplacement * 1.1 + blurExpansion + 4) / options.height * 100),
      );
      const filter = svgElement(this.document, "filter", {
        id: filterId,
        x: `-${expansionX}%`,
        y: `-${expansionY}%`,
        width: `${100 + expansionX * 2}%`,
        height: `${100 + expansionY * 2}%`,
        "color-interpolation-filters": "sRGB",
        primitiveUnits: "userSpaceOnUse",
      });
      const redChannel = svgElement(this.document, "feColorMatrix", {
        in: "opticalRefractedRed",
        values: "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
        result: "opticalRedChannel",
      });
      const greenChannel = svgElement(this.document, "feColorMatrix", {
        in: "opticalRefractedGreen",
        values: "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
        result: "opticalGreenChannel",
      });
      const blueChannel = svgElement(this.document, "feColorMatrix", {
        in: "opticalRefractedBlue",
        values: "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0",
        result: "opticalBlueChannel",
      });
      const facingMatrix = svgElement(this.document, "feColorMatrix", {
        in: "opticalNormalRimMap",
        values: lightFacingMatrixValues(this.lightVector),
        result: "opticalFacingLight",
      });
      const facingCurve = svgElement(this.document, "feComponentTransfer", {
        in: "opticalFacingLight",
        result: "opticalFacingCurve",
      });
      ["R", "G", "B"].forEach((channel) => facingCurve.append(svgElement(
        this.document,
        `feFunc${channel}`,
        { type: "gamma", amplitude: 0.88, exponent: 2.2, offset: 0.12 },
      )));
      const strengthTransfer = svgElement(this.document, "feComponentTransfer", {
        in: "opticalRimFacing",
        result: "opticalSpecularStrength",
      });
      const strengthFunctions = ["R", "G", "B"].map((channel) => {
        const node = svgElement(this.document, `feFunc${channel}`, {
          type: "linear",
          slope: options.specularStrength,
          intercept: 0,
        });
        strengthTransfer.append(node);
        return node;
      });
      filter.append(
        svgElement(this.document, "feGaussianBlur", {
          in: "SourceGraphic",
          stdDeviation: options.opticalBlur,
          edgeMode: "duplicate",
          result: "opticalPreSoft",
        }),
        svgElement(this.document, "feImage", {
          href: urls[0],
          x: 0,
          y: 0,
          width: options.width,
          height: options.height,
          preserveAspectRatio: "none",
          result: "opticalDisplacement",
        }),
        svgElement(this.document, "feDisplacementMap", {
          in: "opticalPreSoft",
          in2: "opticalDisplacement",
          scale: options.maxDisplacement * 2.12,
          xChannelSelector: "R",
          yChannelSelector: "G",
          result: "opticalRefractedRed",
        }),
        svgElement(this.document, "feDisplacementMap", {
          in: "opticalPreSoft",
          in2: "opticalDisplacement",
          scale: options.maxDisplacement * 2,
          xChannelSelector: "R",
          yChannelSelector: "G",
          result: "opticalRefractedGreen",
        }),
        svgElement(this.document, "feDisplacementMap", {
          in: "opticalPreSoft",
          in2: "opticalDisplacement",
          scale: options.maxDisplacement * 1.88,
          xChannelSelector: "R",
          yChannelSelector: "G",
          result: "opticalRefractedBlue",
        }),
        redChannel,
        greenChannel,
        blueChannel,
        svgElement(this.document, "feBlend", {
          in: "opticalRedChannel",
          in2: "opticalGreenChannel",
          mode: "screen",
          result: "opticalRedGreen",
        }),
        svgElement(this.document, "feBlend", {
          in: "opticalRedGreen",
          in2: "opticalBlueChannel",
          mode: "screen",
          result: "opticalRgbRim",
        }),
        svgElement(this.document, "feColorMatrix", {
          in: "opticalRgbRim",
          type: "saturate",
          values: options.saturation || 1.1,
          result: "opticalColor",
        }),
        svgElement(this.document, "feImage", {
          href: urls[1],
          x: 0,
          y: 0,
          width: options.width,
          height: options.height,
          preserveAspectRatio: "none",
          result: "opticalNormalRimMap",
        }),
        facingMatrix,
        facingCurve,
        svgElement(this.document, "feColorMatrix", {
          in: "opticalNormalRimMap",
          values: "0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 1 0",
          result: "opticalRim",
        }),
        svgElement(this.document, "feComposite", {
          in: "opticalFacingCurve",
          in2: "opticalRim",
          operator: "arithmetic",
          k1: 1,
          k2: 0,
          k3: 0,
          k4: 0,
          result: "opticalRimFacing",
        }),
        strengthTransfer,
        svgElement(this.document, "feColorMatrix", {
          in: "opticalSpecularStrength",
          values: "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 1 0 0 0 0",
          result: "opticalSpecularMask",
        }),
        svgElement(this.document, "feFlood", {
          "flood-color": "rgb(240, 251, 255)",
          "flood-opacity": 1,
          result: "opticalSpecularTint",
        }),
        svgElement(this.document, "feComposite", {
          in: "opticalSpecularTint",
          in2: "opticalSpecularMask",
          operator: "in",
          result: "opticalSpecular",
        }),
        svgElement(this.document, "feBlend", {
          in: "opticalColor",
          in2: "opticalSpecular",
          mode: "screen",
        }),
      );
      host.append(filter);
      return {
        filterElement: filter,
        lightingNodes: {
          facingMatrix,
          strengthFunctions,
        },
      };
    }

    destroyResource(resource) {
      if (!resource) {
        return;
      }
      resource.filterElement?.remove();
      resource.urls?.forEach((url) => this.window?.URL?.revokeObjectURL(url));
    }

    releaseSurfaceResource(record) {
      if (record.resource && record.cacheKey) {
        this.cache.release(record.cacheKey);
      }
      record.element.style.removeProperty("--liquid-glass-optical-filter");
      record.element.removeAttribute("data-liquid-glass-optics");
      record.cacheKey = "";
      record.resource = null;
      this.cache.evictOverflow();
    }

    mountDiagnostics() {
      if (this.diagnosticRoot?.isConnected) {
        return;
      }
      const root = this.document.createElement("aside");
      root.id = "liquidGlassDiagnosticStage";
      root.className = "liquid-glass-diagnostic-stage";
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = `
        <div class="liquid-glass-diagnostic-grid"></div>
        <div class="liquid-glass-diagnostic-orb liquid-glass-diagnostic-orb-cool"></div>
        <div class="liquid-glass-diagnostic-orb liquid-glass-diagnostic-orb-warm"></div>
        <section class="liquid-glass-diagnostic-surface">
          <span class="liquid-glass-diagnostic-kicker">Q3 TRUE OPTICAL PATH</span>
          <strong>RGB refraction and static environment specular</strong>
          <span data-liquid-glass-diagnostic-status>${this.quality === "q3" ? "building geometry map" : `${this.quality.toUpperCase()} fallback`}</span>
        </section>
      `;
      this.document.body.append(root);
      this.diagnosticRoot = root;
      const surface = root.querySelector(".liquid-glass-diagnostic-surface");
      this.register(surface, "floating", {
        bezel: 28,
        thickness: 25,
        ior: 1.49,
        maxDisplacement: 25,
        specularStrength: 0.88,
        maximumMapDimension: 460,
        opticalBlur: 0.3,
      });
    }

    destroyDiagnostics() {
      if (!this.diagnosticRoot) {
        return;
      }
      const surface = this.diagnosticRoot.querySelector(".liquid-glass-diagnostic-surface");
      if (surface) {
        this.unregister(surface);
      }
      this.diagnosticRoot.remove();
      this.diagnosticRoot = null;
    }

    updateDiagnosticStatus(element, text) {
      const diagnostic = element.closest?.("#liquidGlassDiagnosticStage");
      const status = diagnostic?.querySelector("[data-liquid-glass-diagnostic-status]");
      if (status) {
        status.textContent = text;
      }
    }

    stats() {
      const roles = {};
      this.surfaces.forEach((record) => {
        roles[record.role] = (roles[record.role] || 0) + 1;
      });
      return {
        active: this.active,
        quality: this.quality,
        surfaces: this.surfaces.size,
        inFlight: this.inFlight.size,
        cache: this.cache.stats(),
        lightVector: { ...this.lightVector },
        roles,
      };
    }
  }

  function createEngine(options = {}) {
    return new LiquidGlassEngine(options);
  }

  return {
    ROLE_DEFAULTS,
    SURFACE_ROLE_DEFINITIONS,
    surfaceRoleDefinition,
    DEFAULT_LIGHT_VECTOR,
    normalizeLightVector,
    lightFacingMatrixValues,
    ByteBudgetLru,
    LiquidGlassEngine,
    createEngine,
  };
});
