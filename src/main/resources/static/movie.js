(() => {
  'use strict';
  const API = '/apis/api.showcase.halo.run/v1alpha1';
  const STEAM_API = '/apis/api.steam.timxs.com/v1alpha1';
  const STEAM_CATEGORY = '__steam__';
  const DEFAULT_THEME_COLOR = '#E96F9D';
  const state = { items: [], categories: [], subcategories: [], templates: [], settings: {}, active: 'all', keyword: '', viewMode: 'card', steamGames: null, steamLoading: false, steamError: '' };
  const commentObservers = new WeakMap();
  const commentPopoverObservers = new WeakMap();
  const $ = (selector) => document.querySelector(selector);
  const grid = $('#showcase-grid');
  const tabs = $('#category-tabs');
  const empty = $('#empty-state');
  const dialog = $('#detail-dialog');
  const externalConfirm = $('#external-confirm-dialog');
  const detailDialogBackdrop = document.createElement('div');
  detailDialogBackdrop.className = 'detail-dialog-backdrop';
  detailDialogBackdrop.hidden = true;
  dialog?.before(detailDialogBackdrop);
  let pendingExternalUrl = '';
  let nativeCommentTopLayerObserver = null;
  const nativeCommentTopLayerObservers = new WeakMap();
  let pausedDetailVideos = [];

  function pauseShowcaseMedia() {
    pausedDetailVideos = [...document.querySelectorAll('.hero-background-media video, .content-background-media video')]
      .filter((video) => !video.paused);
    pausedDetailVideos.forEach((video) => video.pause());
  }

  function resumeShowcaseMedia() {
    const videos = pausedDetailVideos;
    pausedDetailVideos = [];
    videos.forEach((video) => video.isConnected && video.play().catch(() => {}));
  }

  function isNativeCommentPortal(node) {
    return node?.nodeType === 1
      && (node.matches('.form__emoji-panel') || node.matches('lit-toast-container'));
  }

  function syncNativeCommentTopLayer(node) {
    if (typeof node?.showPopover !== 'function') return;
    const shouldOpen = node.matches('.form__emoji-panel')
      ? node.classList.contains('visible')
      : node.childElementCount > 0;
    let isOpen = false;
    try { isOpen = node.matches(':popover-open'); } catch (_) {}
    try {
      if (shouldOpen && !isOpen) node.showPopover();
      else if (!shouldOpen && isOpen) node.hidePopover();
    } catch (_) {}
  }

  function prepareNativeCommentTopLayer(node) {
    if (!isNativeCommentPortal(node) || nativeCommentTopLayerObservers.has(node)) return;
    if (typeof node.showPopover !== 'function') return;
    node.setAttribute('popover', 'manual');
    node.dataset.showcaseTopLayer = 'true';
    const observer = new MutationObserver(() => syncNativeCommentTopLayer(node));
    observer.observe(node, node.matches('.form__emoji-panel')
      ? { attributes: true, attributeFilter: ['class'] }
      : { childList: true });
    nativeCommentTopLayerObservers.set(node, observer);
    syncNativeCommentTopLayer(node);
  }

  function setupNativeCommentTopLayers() {
    if (state.settings?.commentType !== 'halo') return;
    if (!document.body || typeof HTMLElement.prototype.showPopover !== 'function') return;
    document.body.querySelectorAll('.form__emoji-panel, lit-toast-container').forEach(prepareNativeCommentTopLayer);
    nativeCommentTopLayerObserver?.disconnect();
    nativeCommentTopLayerObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        prepareNativeCommentTopLayer(node);
        node.querySelectorAll?.('.form__emoji-panel, lit-toast-container').forEach(prepareNativeCommentTopLayer);
      }));
    });
    nativeCommentTopLayerObserver.observe(document.body, { childList: true, subtree: true });
  }

  function openDetailDialog() {
    // Avoid `dialog.showModal()` here: it pushes the dialog into the browser's
    // top layer, which renders above every element in the regular DOM tree,
    // including the cursor canvas that `halo-floating-particles` (and similar
    // plugins) attach to `document.documentElement` with a high `z-index`.
    // Calling `dialog.show()` keeps the dialog inside the DOM tree so those
    // cursor layers can sit on top of the dialog via their own `z-index`. The
    // custom `.detail-dialog-backdrop` sibling provides the dim/blur overlay
    // instead of relying on the `::backdrop` pseudo element (which is only
    // available in modal mode).
    const useNext = state.settings?.commentType === 'haloNext';
    document.documentElement.classList.toggle('showcase-next-detail-open', useNext);
    if (useNext) pauseShowcaseMedia();
    detailDialogBackdrop.hidden = false;
    if (!dialog.open) dialog.show();
    registerEscapeListener();
    document.body.style.overflow = 'hidden';
  }

  function closeDetailDialog() {
    if (dialog.open) dialog.close();
  }

  function setupCardSizeToggle() {
    const button = $('#card-size-toggle');
    const thumb = $('#card-size-thumb');
    if (!button || !thumb) return;
    const sizes = ['small', 'large', 'largest'];
    const labels = { small: '小（六列）', large: '大（四列）', largest: '大大（三列）' };
    const shapes = {
      small: [['M',-44.2932,-50],['C',-44.293,-73.8,-23.8,-93.093,0,-93.093],['C',23.8,-93.093,43.093,-73.8,43.0932,-50],['C',43.093,-26.2,23.2,-50,-.6,-50],['C',-24.4,-50,-44.293,-26.2,-44.2932,-50],['z']],
      large: [['M',-36.911,0],['C',-36.911,-19.833,-19.833,-35.911,0,-35.911],['C',19.833,-35.911,35.911,-19.833,35.911,0],['C',35.911,19.833,19.833,35.911,0,35.911],['C',-19.833,35.911,-36.911,19.833,-36.911,0],['z']],
      largest: [['M',-44.2932,50],['C',-44.2932,26.2,-24.4,50,-.6,50],['C',23.2,50,43.0932,26.2,43.093,50],['C',43.093,73.8,23.8,93.093,0,93.093],['C',-23.8,93.0932,-44.2932,73.8,-44.2932,50],['z']]
    };
    let size = 'large';
    let values = shapes.large.map((part) => part.slice());
    let animationFrame = 0;
    try { const saved = localStorage.getItem('showcase-card-size'); if (sizes.includes(saved)) size = saved; } catch (_) {}
    const drawShape = () => thumb.setAttribute('d', values.map((part) => part.map((value) => typeof value === 'number' ? value.toFixed(3) : value).join(' ')).join(' '));
    const morphTo = (nextSize, immediate = false) => {
      const target = shapes[nextSize];
      cancelAnimationFrame(animationFrame);
      if (immediate) { values = target.map((part) => part.slice()); drawShape(); return; }
      const frame = () => {
        let remaining = 0;
        values.forEach((part, partIndex) => part.forEach((value, valueIndex) => {
          if (typeof value !== 'number') return;
          const distance = target[partIndex][valueIndex] - value;
          remaining = Math.max(remaining, Math.abs(distance));
          values[partIndex][valueIndex] += distance / 10;
        }));
        drawShape();
        if (remaining > .1) animationFrame = requestAnimationFrame(frame);
        else { values = target.map((part) => part.slice()); drawShape(); }
      };
      animationFrame = requestAnimationFrame(frame);
    };
    const apply = () => {
      document.documentElement.dataset.cardSize = size;
      const label = `卡片大小：${labels[size]}`;
      button.setAttribute('aria-label', label);
      button.title = `调整${label}`;
      button.dataset.size = size;
    };
    const selectSize = (nextSize) => {
      if (!sizes.includes(nextSize) || nextSize === size) return;
      size = nextSize;
      try { localStorage.setItem('showcase-card-size', size); } catch (_) {}
      apply();
      morphTo(size);
    };
    button.addEventListener('click', (event) => {
      if (event.detail === 0) { selectSize(sizes[(sizes.indexOf(size) + 1) % sizes.length]); return; }
      const rect = button.getBoundingClientRect();
      const position = Math.max(0, Math.min(.999, (event.clientX - rect.left) / rect.width));
      selectSize(sizes[Math.floor(position * sizes.length)]);
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = sizes.indexOf(size);
      if (event.key === 'Home') selectSize(sizes[0]);
      else if (event.key === 'End') selectSize(sizes[2]);
      else selectSize(sizes[Math.max(0, Math.min(2, index + (event.key === 'ArrowLeft' ? -1 : 1)))]);
    });
    apply();
    morphTo(size, true);
  }

  function setupViewModeToggle() {
    const control = $('#view-mode-toggle');
    const sizeToggle = $('#card-size-toggle');
    if (!control) return;
    try { if (localStorage.getItem('showcase-view-mode') === 'list') state.viewMode = 'list'; } catch (_) {}
    const apply = () => {
      document.documentElement.dataset.showcaseView = state.viewMode;
      sizeToggle.hidden = state.viewMode !== 'card';
      control.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.viewMode)));
    };
    control.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-view]');
      if (!button || button.dataset.view === state.viewMode) return;
      state.viewMode = button.dataset.view;
      try { localStorage.setItem('showcase-view-mode', state.viewMode); } catch (_) {}
      apply();
    });
    apply();
  }

  function setupPageJumpControls() {
    const controls = $('#page-jump-controls');
    const topButton = $('#page-jump-top');
    const bottomButton = $('#page-jump-bottom');
    if (!controls || !topButton || !bottomButton) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      topButton.disabled = y < 12;
      bottomButton.disabled = maxScroll - y < 12;
      controls.classList.toggle('is-visible', maxScroll > 160);
    };
    const scrollTo = (top) => window.scrollTo({
      top,
      behavior: reducedMotion.matches ? 'auto' : 'smooth'
    });
    topButton.addEventListener('click', () => scrollTo(0));
    bottomButton.addEventListener('click', () => scrollTo(document.documentElement.scrollHeight));
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(document.body);
    update();
  }

  function normalizeHex(value) {
    let color = String(value || '').trim();
    if (!color.startsWith('#')) color = `#${color}`;
    if (/^#[\da-f]{3}$/i.test(color)) color = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    return /^#[\da-f]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_THEME_COLOR;
  }

  function hexToHsl(hex) {
    const color = normalizeHex(hex);
    const r = parseInt(color.slice(1, 3), 16) / 255; const g = parseInt(color.slice(3, 5), 16) / 255; const b = parseInt(color.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min; let h = 0;
    if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
    if (h < 0) h += 360;
    const l = (max + min) / 2; const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
    return { h: Math.round(h), s: s * 100, l: l * 100 };
  }

  function applyThemeColor(value, forcedDark) {
    const color = normalizeHex(value); const { h, s, l } = hexToHsl(color); const style = document.documentElement.style;
    const hsl = (saturation, lightness) => `hsl(${h} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
    const isDark = typeof forcedDark === 'boolean' ? forcedDark : l < 32; const toneSaturation = s < 8 ? 0 : Math.min(82, s);
    const accentLightness = l < 10 ? 34 : l > 88 ? 44 : l;
    const accentBackground = l < 10 || l > 88 ? hsl(Math.max(18, toneSaturation * .55), accentLightness) : color;
    style.setProperty('--theme-hue', h);
    style.setProperty('--pink', color);
    style.setProperty('--accent-bg', accentBackground);
    style.setProperty('--accent-text', accentLightness > 62 ? '#2D2227' : '#FFFFFF');
    if (isDark) {
      style.colorScheme = 'dark';
      style.setProperty('--pink-deep', hsl(toneSaturation * .5, 76));
      style.setProperty('--petal', hsl(toneSaturation * .42, 58));
      style.setProperty('--paper', hsl(toneSaturation * .16, 13));
      style.setProperty('--ink', hsl(toneSaturation * .08, 96));
      style.setProperty('--muted', hsl(toneSaturation * .12, 76));
      style.setProperty('--line', hsl(toneSaturation * .16, 29));
      style.setProperty('--soft', hsl(toneSaturation * .18, 16));
      style.setProperty('--hero-start', hsl(toneSaturation * .18, 15));
      style.setProperty('--hero-end', hsl(toneSaturation * .24, 22));
      style.setProperty('--cover-start', hsl(toneSaturation * .22, 21));
      style.setProperty('--dialog-cover', hsl(toneSaturation * .16, 16));
      style.setProperty('--accent-muted', hsl(toneSaturation * .28, 74));
      style.setProperty('--page-end', hsl(toneSaturation * .1, 11));
      style.setProperty('--surface', hsl(toneSaturation * .16, 15));
      style.setProperty('--surface-glass', `hsl(${h} ${Math.round(toneSaturation * .16)}% 15% / .92)`);
      style.setProperty('--button-bg', accentBackground);
      style.setProperty('--button-text', '#FFFFFF');
      style.setProperty('--orb', `hsl(${h} ${Math.round(toneSaturation * .12)}% 95% / .1)`);
      style.setProperty('--star-color', hsl(Math.max(16, toneSaturation * .25), 90));
      style.setProperty('--star-glow', `hsl(${h} ${Math.round(Math.max(16, toneSaturation * .3))}% 88% / .72)`);
      style.setProperty('--shadow', `0 18px 50px hsl(${h} 12% 5% / .42)`);
      document.documentElement.dataset.showcaseMode = 'dark';
      syncCommentTheme();
      window.dispatchEvent(new CustomEvent('showcase-theme-change'));
      return true;
    }
    style.colorScheme = 'light';
    style.setProperty('--pink-deep', hsl(Math.max(45, s * .76), Math.max(34, Math.min(55, l - 16))));
    style.setProperty('--petal', hsl(Math.max(68, s), 90));
    style.setProperty('--paper', hsl(Math.max(30, s * .55), 99));
    style.setProperty('--ink', hsl(Math.min(24, s * .3), 22));
    style.setProperty('--muted', hsl(Math.min(25, s * .36), 46));
    style.setProperty('--line', hsl(Math.min(52, s * .65), 90));
    style.setProperty('--soft', hsl(Math.max(55, s * .85), 97));
    style.setProperty('--hero-start', hsl(Math.max(62, s * .9), 95));
    style.setProperty('--hero-end', hsl(Math.max(58, s * .86), 91));
    style.setProperty('--cover-start', hsl(Math.max(52, s * .76), 86));
    style.setProperty('--dialog-cover', hsl(Math.max(42, s * .68), 91));
    style.setProperty('--accent-muted', hsl(Math.max(34, s * .55), 54));
    style.setProperty('--page-end', '#FFFFFF');
    style.setProperty('--surface', '#FFFFFF');
    style.setProperty('--surface-glass', 'rgba(255,255,255,.88)');
    style.setProperty('--button-bg', 'var(--ink)');
    style.setProperty('--button-text', '#FFFFFF');
    style.setProperty('--star-color', hsl(Math.max(42, s * .62), 55));
    style.setProperty('--star-glow', `hsl(${h} ${Math.round(Math.max(48, s * .68))}% 62% / .5)`);
    style.setProperty('--orb', 'rgba(255,255,255,.95)');
    style.setProperty('--shadow', `0 18px 50px hsl(${h} 42% 42% / .13)`);
    document.documentElement.dataset.showcaseMode = 'light';
    syncCommentTheme();
    window.dispatchEvent(new CustomEvent('showcase-theme-change'));
    return false;
  }

  function setupDayNightToggle(themeColor) {
    const button = $('#day-night-toggle');
    const defaultDark = hexToHsl(themeColor).l < 32;
    let savedMode = '';
    try { savedMode = localStorage.getItem('showcase-color-mode') || ''; } catch (_) {}
    let isDark = savedMode === 'dark' ? true : savedMode === 'light' ? false : defaultDark;
    const update = () => {
      applyThemeColor(themeColor, isDark);
      button.setAttribute('aria-pressed', String(isDark));
      const label = isDark ? '切换到日间模式' : '切换到夜间模式';
      button.setAttribute('aria-label', label);
      button.title = label;
    };
    button.addEventListener('click', () => {
      isDark = !isDark;
      try { localStorage.setItem('showcase-color-mode', isDark ? 'dark' : 'light'); } catch (_) {}
      update();
    });
    update();
  }

  function applyPageEffect(settings) {
    const layer = $('#page-effect-layer');
    const enabled = settings.effectEnabled !== false;
    const type = settings.effectType === 'stars' ? 'stars' : 'sakura';
    layer.replaceChildren();
    layer.hidden = !enabled;
    layer.dataset.effect = enabled ? type : 'off';
    if (!enabled) return;
    const count = type === 'stars' ? (innerWidth < 680 ? 42 : 76) : (innerWidth < 680 ? 22 : 36);
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('i');
      particle.className = type === 'stars' ? 'effect-star' : 'effect-petal';
      particle.style.setProperty('--left', `${(Math.random() * 100).toFixed(2)}vw`);
      particle.style.setProperty('--delay', `${(-Math.random() * (type === 'stars' ? 7 : 18)).toFixed(2)}s`);
      particle.style.setProperty('--duration', `${(type === 'stars' ? 2.4 + Math.random() * 5 : 10 + Math.random() * 12).toFixed(2)}s`);
      particle.style.setProperty('--size', `${(type === 'stars' ? 1.5 + Math.random() * 3.5 : 7 + Math.random() * 8).toFixed(1)}px`);
      particle.style.setProperty('--opacity', (type === 'stars' ? .35 + Math.random() * .55 : .2 + Math.random() * .3).toFixed(2));
      if (type === 'stars') particle.style.setProperty('--top', `${(Math.random() * 100).toFixed(2)}vh`);
      else {
        particle.style.setProperty('--drift', `${(-90 + Math.random() * 180).toFixed(0)}px`);
        particle.style.setProperty('--spin', `${(360 + Math.random() * 720).toFixed(0)}deg`);
      }
      fragment.append(particle);
    }
    layer.append(fragment);
  }

  function applyHeroGif(settings) {
    const frame = $('#hero-gif');
    const image = $('#hero-gif-image');
    const enabled = settings.heroGifEnabled !== false;
    const source = safeImage(settings.heroGifUrl || '/plugins/showcase/assets/static/gif.gif');
    if (!enabled || !source) {
      frame.hidden = true;
      image.removeAttribute('src');
      return;
    }
    image.src = source;
    image.addEventListener('error', () => { frame.hidden = true; }, { once: true });
    frame.hidden = false;
  }

  function applyBackgroundMedia(settings, prefix) {
    const wrapper = $(`#${prefix}-background-media`);
    const image = $(`#${prefix}-background-image`);
    const video = $(`#${prefix}-background-video`);
    if (!wrapper || !image || !video) return;
    const enabled = settings[`${prefix}BackgroundEnabled`] === true;
    const source = safeMedia(settings[`${prefix}BackgroundUrl`]);
    const type = settings[`${prefix}BackgroundType`] === 'video' ? 'video' : 'image';
    const opacity = Math.max(0, Math.min(100, Number(settings[`${prefix}BackgroundOpacity`] ?? 20))) / 100;
    const saturation = Math.max(0, Math.min(200, Number(settings[`${prefix}BackgroundSaturation`] ?? 100))) / 100;
    wrapper.style.setProperty('--media-opacity', opacity.toFixed(2));
    wrapper.style.setProperty('--media-saturation', saturation.toFixed(2));
    image.hidden = true;
    video.hidden = true;
    image.removeAttribute('src');
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (!enabled || !source) {
      wrapper.hidden = true;
      return;
    }
    if (type === 'video') {
      video.src = source;
      video.hidden = false;
      video.play().catch(() => {});
    } else {
      image.src = source;
      image.hidden = false;
    }
    wrapper.hidden = false;
  }

  function applyBackgrounds(settings) {
    applyBackgroundMedia(settings, 'hero');
    applyBackgroundMedia(settings, 'content');
  }

  function applySignature(settings) {
    const panel = $('#signature-panel');
    const textNode = $('#signature-text');
    const svgText = $('#signature-svg-text');
    if (!panel || !svgText || settings.signatureEnabled === false || !String(settings.signatureText || '').trim()) {
      if (panel) panel.hidden = true;
      document.querySelector('.hero')?.classList.remove('has-signature');
      return;
    }
    if (textNode) text(textNode, settings.signatureText);
    text(svgText, settings.signatureText);
    panel.hidden = false;
    document.querySelector('.hero')?.classList.add('has-signature');

    // Reset the text stroke before measuring so changing the signature restarts
    // the draw animation from the beginning instead of reusing the old offset.
    svgText.classList.remove('drawn');
    svgText.style.setProperty('--signature-delay', '0ms');
    svgText.style.strokeDasharray = 'none';
    svgText.style.strokeDashoffset = '0';

    // Text metrics are reliable only after the SVG is visible and laid out.
    requestAnimationFrame(() => {
      const measuredLength = typeof svgText.getComputedTextLength === 'function'
        ? svgText.getComputedTextLength()
        : svgText.getBBox().width;
      const length = Math.max(1, measuredLength || 1);
      svgText.style.strokeDasharray = `${length},${length}`;
      svgText.style.strokeDashoffset = `${length}`;
      // A second frame guarantees the initial dash offset is painted before the
      // class transition reveals the handwritten stroke from left to right.
      requestAnimationFrame(() => svgText.classList.add('drawn'));
    });
  }

  function syncCommentTheme() {
    const sections = [...document.querySelectorAll('.showcase-comments, .detail-comments')];
    // Include the native Halo web component as well as the showcase wrappers so
    // we always cover both the official widget and the Next variant.
    const mounts = [...document.querySelectorAll('.showcase-comment-widget, .detail-comment-widget, halo-comment, comment-widget, comment-next')];
    if (!sections.length && !mounts.length) return;
    const dark = document.documentElement.dataset.showcaseMode === 'dark';
    sections.forEach((section) => { section.dataset.colorScheme = dark ? 'dark' : 'light'; });
    const variables = {
      '--halo-cw-primary-1-color': 'var(--accent-bg)',
      '--halo-cw-primary-3-color': 'var(--soft)',
      '--halo-cw-text-1-color': 'var(--ink)',
      '--halo-cw-text-2-color': 'var(--muted)',
      '--halo-cw-text-3-color': 'var(--accent-muted)',
      '--halo-cw-muted-1-color': 'var(--line)',
      '--halo-cw-muted-2-color': 'var(--dialog-cover)',
      '--halo-cw-muted-3-color': 'var(--soft)',
      '--halo-cw-base-rounded': '14px',
      '--halo-cw-avatar-rounded': '50%',
      '--halo-cw-base-font-family': '"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
      '--halo-cw-base-font-size': '15px',
      '--comment-next-primary-color': 'var(--accent-bg)',
      '--comment-next-primary-hover-color': 'var(--pink-deep)',
      '--comment-next-primary-ring-color': 'var(--soft)',
      '--comment-next-primary-soft-bg-color': 'var(--soft)',
      '--comment-next-bg-color': 'transparent',
      '--comment-next-box-bg': 'transparent',
      '--comment-next-surface-bg-color': 'var(--surface)',
      '--comment-next-editor-surface-bg': 'var(--surface)',
      '--comment-next-editor-bg-color': 'var(--surface)',
      '--comment-next-input-bg-color': 'var(--surface)',
      '--comment-next-field-bg-color': 'var(--surface)',
      '--comment-next-field-focus-bg-color': 'var(--paper)',
      '--comment-next-toolbar-bg-color': 'var(--soft)',
      '--comment-next-footer-bg-color': 'var(--soft)',
      '--comment-next-footer-surface-bg': 'var(--soft)',
      '--comment-next-text-color': 'var(--ink)',
      '--comment-next-comment-content-color': 'var(--ink)',
      '--comment-next-muted-color': 'var(--muted)',
      '--comment-next-placeholder-color': 'var(--accent-muted)',
      '--comment-next-icon-color': 'var(--accent-muted)',
      '--comment-next-link-color': 'var(--pink-deep)',
      '--comment-next-link-hover-color': 'var(--accent-bg)',
      '--comment-next-border-color': 'var(--line)',
      '--comment-next-border-subtle-color': 'var(--line)',
      '--comment-next-divider-color': 'var(--line)',
      '--comment-next-field-divider-color': 'var(--line)',
      '--comment-next-focus-border-color': 'var(--accent-bg)',
      '--comment-next-focus-ring-color': 'var(--soft)',
      '--comment-next-focus-shadow-color': 'hsl(var(--theme-hue) 70% 60% / .18)',
      '--comment-next-avatar-border-color': 'var(--line)',
      '--comment-next-control-hover-bg-color': 'var(--soft)',
      '--comment-next-reaction-hover-bg-color': 'var(--soft)',
      '--comment-next-pill-active-bg-color': 'var(--soft)',
      '--comment-next-font-family': '"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
      '--comment-next-radius-lg': '14px'
    };
    const flattenShadow = (root) => {
      const out = [];
      const visit = (node) => {
        if (!node) return;
        if (node.shadowRoot) {
          out.push(node.shadowRoot.host || node);
          [...node.shadowRoot.children].forEach(visit);
          [...node.shadowRoot.querySelectorAll('*')].forEach(visit);
        }
      };
      visit(root);
      return out;
    };
    const collected = [];
    mounts.forEach((mount) => {
      collected.push(mount);
      // Traverse the light DOM and any attached shadow trees so the Next
      // component's themed box (whatever tag it uses) inherits the showcase
      // palette through CSS variables.
      collected.push(...mount.querySelectorAll('*'));
      collected.push(...flattenShadow(mount));
    });
    [...sections, ...collected].forEach((node) => {
      if (!node || node.nodeType !== 1) return;
      Object.entries(variables).forEach(([name, value]) => node.style?.setProperty(name, value));
      if (node.matches?.('comment-widget, comment-next')) {
        node.dataset.colorScheme = dark ? 'dark' : 'light';
        node.classList.toggle('dark', dark);
        node.style.setProperty('background', 'transparent', 'important');
        node.style.setProperty('border', '0', 'important');
        node.style.setProperty('box-shadow', 'none', 'important');
      }
    });
  }

  // Halo's editor is rendered asynchronously inside one or more shadow roots.
  // Keep the native editor, but adapt its placeholder text on this page only.
  function customizeNativeCommentForms(mount) {
    if (!mount) return false;
    let changed = false;
    const visit = (root) => {
      if (!root?.querySelectorAll) return;
      root.querySelectorAll('comment-form').forEach((node) => {
        const customize = (formRoot) => {
          if (!formRoot?.querySelectorAll) return;
          formRoot.querySelectorAll('textarea,input').forEach((field) => {
            if (field.getAttribute('placeholder') === '编写评论' || field.getAttribute('placeholder') === 'Write a comment') {
              field.setAttribute('placeholder', '留下想说的话...');
              changed = true;
            }
          });
          formRoot.querySelectorAll('[contenteditable="true"]').forEach((field) => {
            if (field.getAttribute('aria-label') === '编写评论' || field.getAttribute('data-placeholder') === '编写评论') {
              field.setAttribute('aria-label', '留下想说的话...');
              field.setAttribute('data-placeholder', '留下想说的话...');
              changed = true;
            }
          });
          const walker = document.createTreeWalker(formRoot, NodeFilter.SHOW_TEXT);
          const nodes = [];
          let current;
          while ((current = walker.nextNode())) nodes.push(current);
          nodes.forEach((textNode) => {
            if (textNode.nodeValue?.trim() === '编写评论') {
              textNode.nodeValue = textNode.nodeValue.replace('编写评论', '留下想说的话...');
              changed = true;
            }
          });
          formRoot.querySelectorAll('*').forEach((child) => {
            if (child.shadowRoot) customize(child.shadowRoot);
          });
        };
        customize(node.shadowRoot || node);
      });
      root.querySelectorAll('*').forEach((node) => {
        if (node.shadowRoot) visit(node.shadowRoot);
      });
    };
    visit(mount);
    return changed;
  }

  function withTimeout(promise, label, timeout = 12000) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} 加载超时`)), timeout);
      })
    ]).finally(() => window.clearTimeout(timer));
  }

  function loadClassicScript(url, marker) {
    const existing = document.querySelector(`script[data-showcase-comment-script="${marker}"]`);
    if (existing?.dataset.loaded === 'true') return Promise.resolve();
    return withTimeout(new Promise((resolve, reject) => {
      const script = existing || document.createElement('script');
      const onLoad = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      const onError = () => reject(new Error(`${url} 加载失败`));
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!existing) {
        script.src = url;
        script.dataset.showcaseCommentScript = marker;
        document.head.append(script);
      }
    }), marker);
  }

  function commentAssetVersion(url) {
    const stamp = Date.now().toString(36);
    return url.includes('?') ? `${url}&v=${stamp}` : `${url}?v=${stamp}`;
  }

  function unloadCommentStyles(keepId = '') {
    document.querySelectorAll('link[data-showcase-comment-style]').forEach((node) => {
      if (keepId && node.dataset.showcaseCommentStyle === keepId) return;
      node.remove();
    });
  }

  function resetBrokenHaloCommentLocaleCache() {
    if (state.settings?.commentType !== 'halo') return;
    const looksBroken = (value) => {
      const text = String(value || '');
      return text.includes('未定义') || /"[^"]+":"undefined"/.test(text);
    };
    try {
      Object.keys(localStorage).forEach((key) => {
        if (!/i18n|locale|language|halo-comment|comment-widget/i.test(key)) return;
        if (looksBroken(localStorage.getItem(key))) localStorage.removeItem(key);
      });
    } catch (_) {}
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (!/i18n|locale|language|halo-comment|comment-widget/i.test(key)) return;
        if (looksBroken(sessionStorage.getItem(key))) sessionStorage.removeItem(key);
      });
    } catch (_) {}
  }

  async function waitForCommentElement(name, timeout = 12000) {
    const existing = customElements.get(name);
    if (existing) return existing;
    return withTimeout(customElements.whenDefined(name), name, timeout);
  }

  function installCommentNextEmoteFallback() {
    if (window.__showcaseCommentNextFetchPatched) return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      let url = '';
      try {
        const input = args[0];
        url = typeof input === 'string' ? input : input?.url || String(input || '');
        url = new URL(url, location.href).pathname;
      } catch (_) {}
      if (url !== '/apis/api.commentnext.xhhao.com/v1alpha1/emotes' || !response.ok) return response;
      try {
        const payload = await response.clone().json();
        if (!Array.isArray(payload?.packs) || payload.packs.length > 0) return response;
        // Comment Next 1.0.x only enables its bundled default emotes when the
        // endpoint payload is absent. An explicit empty packs array otherwise
        // leaves only the image-upload tool visible.
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        headers.set('content-type', 'application/json; charset=utf-8');
        return new Response('null', {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (_) {
        return response;
      }
    };
    window.__showcaseCommentNextFetchPatched = true;
  }

  function installAnonymousCommentEmailAdapter(mount) {
    if (!mount || mount.dataset.showcaseAnonymousEmailAdapter === 'true') return;
    mount.dataset.showcaseAnonymousEmailAdapter = 'true';

    const clearStoredAnonymousIdentity = () => {
      if (state.settings?.commentAnonymousEmail === true) return;
      try {
        const generated = localStorage.getItem('showcase-anonymous-comment-email');
        if (!generated) return;
        ['halo-comment-custom-account', 'comment-next-anonymous-account'].forEach((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const account = JSON.parse(raw);
          if (account?.email !== generated) return;
          delete account.email;
          localStorage.setItem(key, JSON.stringify(account));
        });
        const email = findDeep(mount, 'input[name="email"]');
        if (email?.value.trim() === generated) setInputValue(email, '');
      } catch (_) {}
    };

    const anonymousEmail = () => {
      const key = 'showcase-anonymous-comment-email';
      try {
        const saved = localStorage.getItem(key);
        if (saved) return saved;
        const token = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 24)
          .toLowerCase();
        const generated = `visitor-${token}@anonymous.invalid`;
        localStorage.setItem(key, generated);
        return generated;
      } catch (_) {
        return `visitor-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}@anonymous.invalid`;
      }
    };

    const findDeep = (root, selector) => {
      const direct = root?.querySelector?.(selector);
      if (direct) return direct;
      for (const element of root?.querySelectorAll?.('*') || []) {
        if (!element.shadowRoot) continue;
        const nested = findDeep(element.shadowRoot, selector);
        if (nested) return nested;
      }
      return null;
    };

    const setInputValue = (input, value) => {
      if (!input || input.value === value) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };

    const fillAnonymousEmail = () => {
      if (state.settings?.commentAnonymousEmail !== true) return;
      const displayName = findDeep(mount, 'input[name="displayName"]');
      const email = findDeep(mount, 'input[name="email"]');
      if (!displayName?.value.trim() || !email || email.value.trim()) return;
      setInputValue(email, anonymousEmail());
    };

    // Both Halo comment widgets emit composed input/focus events from their
    // shadow roots. Filling on identity interaction unlocks Comment Next's
    // native disabled submit button without polling or replacing submission.
    mount.addEventListener('input', (event) => {
      const field = event.composedPath?.().find((node) => node?.name === 'displayName');
      if (field) fillAnonymousEmail();
    }, true);
    mount.addEventListener('focusin', fillAnonymousEmail, true);
    mount.addEventListener('pointerdown', fillAnonymousEmail, true);
    mount.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) fillAnonymousEmail();
    }, true);
    clearStoredAnonymousIdentity();
  }

  function observeCommentMount(mount) {
    const isNext = mount.dataset.showcaseCommentType === 'next';
    installAnonymousCommentEmailAdapter(mount);
    if (!isNext) customizeNativeCommentForms(mount);
    alignCommentPopovers(mount);
    if (!isNext) {
      let checks = 0;
      const timer = window.setInterval(() => {
        const found = customizeNativeCommentForms(mount);
        alignCommentPopovers(mount);
        checks += 1;
        if (found || checks >= 80) window.clearInterval(timer);
      }, 250);
    }
    const observer = new MutationObserver((mutations) => {
      if (!isNext) customizeNativeCommentForms(mount);
      if (isNext) {
        const isDetailMount = mount.classList?.contains('detail-comment-widget');
        mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => alignCommentPopovers(node, isDetailMount)));
      } else {
        alignCommentPopovers(mount);
      }
      if (!isNext) syncCommentTheme();
    });
    observer.observe(mount, { childList: true, subtree: true });
    commentObservers.set(mount, observer);
    syncCommentTheme();
    window.setTimeout(syncCommentTheme, 500);
  }

  function alignCommentPopovers(root, forceDetailMount = false) {
    if (!root) return;
    const isDetailMount = forceDetailMount || root.classList?.contains('detail-comment-widget');
    const detailMobileCss = isDetailMount ? `
      @media (max-width:680px) {
        :host { display:block!important; width:100%!important; max-width:100%!important; min-width:0!important; }
        .comment-next-reaction-bar { box-sizing:border-box!important; width:100%!important; max-width:100%!important; padding-inline:0!important; }
        .comment-next-reaction-items {
          box-sizing:border-box!important; width:100%!important; max-width:100%!important;
          justify-content:space-between!important; gap:.15rem!important; padding-inline:0!important; overflow-x:hidden!important;
        }
        .comment-next-reaction-items button {
          box-sizing:border-box!important; flex:1 1 0!important; min-width:0!important;
          padding-left:.1rem!important; padding-right:.1rem!important;
        }
        .comment-next-reaction-emoji { font-size:1.9rem!important; line-height:1!important; }
        .comment-next-reaction-emoji img { width:1.9rem!important; height:1.9rem!important; object-fit:contain!important; }
        .comment-next-reaction-label { max-width:100%!important; font-size:.68rem!important; white-space:nowrap!important; }
      }
    ` : '';
    const mobileEmoteCss = `
      @media (max-width:780px) {
        .comment-next-emote-panel {
          -webkit-backdrop-filter:none!important;
          backdrop-filter:none!important;
          animation:none!important;
        }
        .comment-next-emote-tabs {
          position:relative!important;
          z-index:1!important;
          touch-action:pan-x!important;
          overscroll-behavior-x:contain!important;
          scroll-behavior:auto!important;
          transform:translate3d(0,0,0)!important;
          backface-visibility:hidden!important;
        }
        .comment-next-emote-content {
          contain:layout paint!important;
          isolation:isolate!important;
        }
        .comment-next-emote-tabs button,
        .comment-next-emote-item { transition:none!important; }
      }
    `;
    const css = `
      .comment-next-target-reaction.comment-next-target-reaction-open > .comment-next-target-reaction-popover,
      .comment-next-target-reaction-popover {
        left:0!important;
        right:auto!important;
        transform:none!important;
      }
      ${mobileEmoteCss}
      ${detailMobileCss}
    `;
    const revealPopover = (popover) => {
      if (!isDetailMount || !dialog?.open) return;
      window.requestAnimationFrame(() => {
        if (!popover.isConnected) return;
        const style = getComputedStyle(popover);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const popoverRect = popover.getBoundingClientRect();
        const dialogRect = dialog.getBoundingClientRect();
        const overflow = popoverRect.bottom - dialogRect.bottom + 16;
        if (overflow > 0) dialog.scrollBy({ top: overflow, behavior: 'auto' });
      });
    };
    const ensureShadowStyles = (shadowRoot) => {
      let style = shadowRoot.querySelector('style[data-showcase-comment-popover]');
      if (!style) {
        style = document.createElement('style');
        style.dataset.showcaseCommentPopover = 'true';
        style.textContent = css;
      } else if (style.textContent !== css) {
        style.textContent = css;
      }
      if (!style.isConnected) shadowRoot.append(style);
      if (!commentPopoverObservers.has(shadowRoot)) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => visit(node)));
        });
        observer.observe(shadowRoot, { childList: true, subtree: true });
        commentPopoverObservers.set(shadowRoot, observer);
      }
    };
    const visit = (node) => {
      if (!node) return;
      if (node.classList?.contains('comment-next-target-reaction-popover')) {
        node.style.setProperty('left', '0px', 'important');
        node.style.setProperty('right', 'auto', 'important');
        node.style.setProperty('transform', 'none', 'important');
        revealPopover(node);
      }
      if (node.shadowRoot) {
        ensureShadowStyles(node.shadowRoot);
        [...node.shadowRoot.querySelectorAll('*')].forEach(visit);
      }
      if (node.querySelectorAll) [...node.querySelectorAll('*')].forEach(visit);
    };
    visit(root);
  }

  async function setupCommentMount(mount, target, unavailableMessage = true) {
    if (!mount) return;
    commentObservers.get(mount)?.disconnect();
    // The Halo comment widget plugin selection drives which bundle to load.
    // Twikoo is handled by `setupTwikooMount` upstream, so we only deal with
    // the two Halo variants here: `halo` (official `PluginCommentWidget`) and
    // `haloNext` (`PluginCommentNext`). Unknown values fall back to the
    // official widget to preserve existing behaviour.
    const commentType = (state.settings?.commentType || 'halo');
    let candidate;
    if (commentType === 'haloNext') {
      candidate = {
        id: 'next',
        label: '评论组件 Next',
        stylesheet: '/plugins/PluginCommentNext/assets/static/comment-next.css',
        script: '/plugins/PluginCommentNext/assets/static/comment-next.iife.js',
        // Match the element emitted by PluginCommentNext's Halo tag renderer.
        // This wrapper loads /config and /emotes; the lower-level
        // <comment-next> element only renders options passed directly to it.
        element: 'comment-widget'
      };
    } else if (commentType === 'halo') {
      candidate = {
        id: 'legacy',
        label: 'Halo 官方评论组件',
        stylesheet: '/plugins/PluginCommentWidget/assets/static/index.css',
        script: '/plugins/PluginCommentWidget/assets/static/comment-widget.js',
        element: 'comment-widget'
      };
    } else {
      // Twikoo reaches this branch when called directly; bail out cleanly.
      delete mount.dataset.showcaseCommentType;
      mount.replaceChildren();
      return;
    }

    mount.dataset.showcaseCommentType = candidate.id;

    if (!document.querySelector(`link[href="${candidate.stylesheet}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = candidate.stylesheet;
      link.dataset.showcaseCommentStyle = candidate.id;
      document.head.append(link);
    }
    try {
      unloadCommentStyles(candidate.id);
      resetBrokenHaloCommentLocaleCache();
      if (candidate.id === 'next') {
        installCommentNextEmoteFallback();
        await loadClassicScript(candidate.script, candidate.id);
        await waitForCommentElement(candidate.element);
        mount.replaceChildren();
        const widget = document.createElement(candidate.element);
        Object.entries(target || {}).forEach(([key, value]) => {
          if (value) widget.setAttribute(key, value);
        });
        widget.setAttribute('version', 'v1alpha1');
        widget.setAttribute('placeholder', '留下想说的话...');
        mount.append(widget);
      } else {
        const mod = await withTimeout(
          import(/* @vite-ignore */ candidate.script),
          candidate.label
        );
        const init = mod?.init;
        if (typeof init !== 'function') throw new Error('init 函数缺失');
        mount.replaceChildren();
        init(`#${mount.id}`, target);
      }
      observeCommentMount(mount);
      return;
    } catch (error) {
      console.warn('[Showcase] Halo 评论组件加载失败。', candidate.label, error);
    }

    // Keep the failure local to this comment area so the rest of the showcase
    // remains usable when the selected plugin is missing or disabled.
    const friendlyHint = `${candidate.label} 未检测到或未正常启用。请在 Halo 插件管理中确认 ${candidate.label} 已安装并启动。`;
    console.warn('[Showcase] ' + friendlyHint);
    mount.replaceChildren();
    if (unavailableMessage) {
      const message = document.createElement('p');
      message.className = 'comment-unavailable';
      message.innerHTML = `<span><strong>提示</strong>${friendlyHint}</span>`;
      mount.append(message);
    }
  }

  const SETTINGS_SYNC_KEY = 'showcase-settings-updated';
  const SETTINGS_SYNC_CHANNEL = 'showcase-sync';
  const COMMENT_TYPE_KEY = 'showcase-active-comment-type';

  function rememberCommentType(commentType) {
    try { sessionStorage.setItem(COMMENT_TYPE_KEY, commentType); } catch (_) {}
  }

  function parseSettingsSyncPayload(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function setupSettingsChangeWatcher(initialType) {
    let currentType = initialType || 'halo';
    let checking = false;
    let checkTimer = 0;
    let lastSignal = 0;
    const stopCheck = () => {
      if (checkTimer) {
        clearTimeout(checkTimer);
        checkTimer = 0;
      }
    };
    const applyLatestType = (nextType) => {
      if (!nextType || nextType === currentType) return false;
      stopCheck();
      rememberCommentType(nextType);
      location.reload();
      return true;
    };
    const checkLatestSettings = async () => {
      if (checking) return;
      checking = true;
      try {
        const fresh = await get('/public/v1/page');
        const nextType = fresh?.commentType || 'halo';
        if (applyLatestType(nextType)) return;
        currentType = nextType;
        rememberCommentType(currentType);
      } catch (_) {
      } finally {
        checking = false;
      }
    };
    const startOneShotCheck = (payload) => {
      const signalTime = Number(payload?.time || Date.now());
      if (signalTime && signalTime === lastSignal) return;
      lastSignal = signalTime;
      if (payload?.commentType && applyLatestType(payload.commentType)) return;
      stopCheck();
      checkLatestSettings();
      checkTimer = window.setTimeout(() => {
        checkTimer = 0;
        checkLatestSettings();
      }, 900);
    };
    window.addEventListener('storage', (event) => {
      if (event.key !== SETTINGS_SYNC_KEY || !event.newValue) return;
      startOneShotCheck(parseSettingsSyncPayload(event.newValue));
    });
    try {
      if (typeof BroadcastChannel === 'function') {
        const channel = new BroadcastChannel(SETTINGS_SYNC_CHANNEL);
        channel.addEventListener('message', (event) => {
          const payload = event?.data || {};
          if (payload.type && payload.type !== 'settings-saved') return;
          startOneShotCheck(payload);
        });
      }
    } catch (_) {}
  }

  async function setupComments(settings) {
    const section = $('#showcase-comments');
    const mount = $('#showcase-comment-widget');
    if (settings.commentEnabled === false) {
      section.hidden = true;
      commentObservers.get(mount)?.disconnect();
      mount.replaceChildren();
      return;
    }
    section.hidden = false;
    if (settings.commentType === 'twikoo' && settings.twikooEnvId) setupTwikooMount(mount, '/movie');
    else setupCommentMount(mount, { group: 'showcase.halo.run', kind: 'ShowcaseSettings', name: 'showcase-settings' });
  }

  let twikooPromise = null;
  function loadTwikooScript() {
    if (window.twikoo) return Promise.resolve(window.twikoo); if (twikooPromise) return twikooPromise;
    let primary = ''; try { const configured = new URL(String(state.settings.twikooJsUrl || '').trim()); if (['http:','https:'].includes(configured.protocol)) primary = configured.href; } catch (_) {}
    primary ||= 'https://cdn.staticfile.net/twikoo/1.6.40/twikoo.all.min.js'; const fallback = 'https://cdn.jsdelivr.net/npm/twikoo@1.6.40/dist/twikoo.all.min.js';
    const load = (url) => new Promise((resolve,reject) => { const script=document.createElement('script'); script.src=url; script.dataset.showcaseTwikoo='true'; script.onload=()=>window.twikoo?resolve(window.twikoo):reject(new Error('Twikoo 未定义')); script.onerror=()=>reject(new Error('Twikoo 脚本加载失败')); document.head.append(script); });
    twikooPromise = load(primary).catch(() => primary === fallback ? Promise.reject(new Error('Twikoo 加载失败')) : load(fallback)).catch((error) => { twikooPromise=null; throw error; }); return twikooPromise;
  }
  function setupTwikooMount(mount, path) { if (!mount || !state.settings.twikooEnvId) return; const parent=mount.parentElement; loadTwikooScript().then((twikoo) => { mount.replaceChildren(); return twikoo.init({ envId: state.settings.twikooEnvId, el: `#${mount.id}`, path: path || location.pathname }); }).then(() => { const rendered=parent?.querySelector('.twikoo'); if(rendered && rendered!==mount){ rendered.id=mount.id; } }).catch(() => { mount.innerHTML='<p class="comment-unavailable"><span><strong>评论区无法加载</strong>请检查 Twikoo 配置或脚本地址。</span></p>'; }); }

  function applySiteIdentity(settings) {
    const name = String(settings.siteName || '').trim() || '我的博客';
    const logo = safeImage(settings.siteLogo);
    const faviconUrl = safeImage(settings.siteFavicon);
    const image = $('#site-logo');
    const fallback = $('#site-logo-fallback');
    text($('#site-name'), name);
    document.querySelector('.site-brand').setAttribute('aria-label', `${name}博客信息`);
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.append(favicon);
    }
    favicon.href = faviconUrl || logo || '/plugins/showcase/assets/static/logo.png';
    if (!logo) {
      image.hidden = true;
      image.removeAttribute('src');
      fallback.hidden = false;
      return;
    }
    image.src = logo;
    image.hidden = false;
    fallback.hidden = true;
    image.addEventListener('error', () => {
      image.hidden = true;
      fallback.hidden = false;
    }, { once: true });
  }

  function externalDomain(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; }
  }

  function navigateExternal(url) {
    const domain = externalDomain(url);
    if (domain && sessionStorage.getItem(`showcase-skip-external:${domain}`) === '1') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    pendingExternalUrl = url;
    const urlNode = $('#external-confirm-url');
    if (urlNode) text(urlNode, url);
    const skip = $('#external-confirm-skip');
    if (skip) skip.checked = false;
    externalConfirm?.showModal();
  }

  async function get(path) {
    const response = await fetch(API + path, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`请求失败：${response.status}`);
    return response.json();
  }

  // Public catalog responses are deliberately flattened and omit Halo metadata.
  // Adapt them to the internal view model used by the renderer without exposing
  // resource versions or other Extension fields through the public API.
  function adaptPublicCatalog(catalog) {
    const categories = Array.isArray(catalog?.categories) ? catalog.categories.map((category) => ({
      metadata: { name: category.id },
      spec: { displayName: category.title, description: category.description, icon: category.icon, priority: category.priority, template: category.template, templateFields: category.templateFields }
    })) : [];
    const subcategories = Array.isArray(catalog?.subcategories) ? catalog.subcategories.map((subcategory) => ({
      metadata: { name: subcategory.id },
      spec: { category: subcategory.category, displayName: subcategory.title, description: subcategory.description, icon: subcategory.icon, priority: subcategory.priority }
    })) : [];
    const templates = Array.isArray(catalog?.templates) ? catalog.templates.map((template) => ({
      metadata: { name: template.id },
      spec: { displayName: template.displayName, description: template.description, icon: template.icon, fields: template.fields || [] }
    })) : [];
    const items = Array.isArray(catalog?.items) ? catalog.items.map((item) => ({
      metadata: { name: item.id },
      spec: {
        title: item.title, category: item.category, subcategory: item.subcategory,
        cover: item.cover, description: item.description, impression: item.impression,
        watchUrl: item.watchUrl, externalUrl: item.externalUrl, tags: item.tags,
        status: item.status, score: item.score, likes: item.likes, priority: item.priority,
        template: item.template || '',
        published: true, customFields: item.customFields || {}
      }
    })) : [];
    return { categories, subcategories, templates, items };
  }

  async function loadPublicCatalog() {
    const pageSize = 100;
    const maximumPages = 101;
    let offset = 0;
    let catalog = null;
    const items = [];
    for (let page = 0; page < maximumPages; page += 1) {
      const current = await get(`/public/v1/catalog?limit=${pageSize}&offset=${offset}`);
      if (!catalog) catalog = current;
      if (Array.isArray(current?.items)) items.push(...current.items);
      if (current?.hasMore !== true || !current.items?.length) break;
      offset += current.items.length;
    }
    return { ...(catalog || {}), items };
  }

  async function applyVisitorStats(settings) {
    const section = $('#visitor-stats');
    if (!section) return;
    if (settings.visitorStatsEnabled !== true) {
      section.hidden = true;
      return;
    }
    try {
      const stats = await fetch(`${API}/stats/visit`, { method: 'POST', headers: { Accept: 'application/json' } }).then((response) => {
        if (!response.ok) throw new Error(`stats ${response.status}`);
        return response.json();
      });
      [['stats-today-visitors', stats.todayVisitors], ['stats-today-visits', stats.todayVisits], ['stats-total-visitors', stats.totalVisitors], ['stats-total-visits', stats.totalVisits]].forEach(([id, value]) => text($(`#${id}`), Number(value) || 0));
      section.hidden = false;
    } catch (error) {
      section.hidden = true;
      console.warn('[Showcase] visitor stats unavailable', error);
    }
  }

  function safeImage(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.origin);
      return ['http:', 'https:', 'data:'].includes(url.protocol) ? value : '';
    } catch (_) { return ''; }
  }

  function safeMedia(value) {
    return safeImage(value);
  }

  function safeLink(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function categoryOf(name) {
    if (name === STEAM_CATEGORY) return steamCategory();
    return state.categories.find((item) => item.metadata.name === name);
  }

  function steamCategory() {
    return { metadata: { name: STEAM_CATEGORY }, spec: { displayName: '游戏', icon: '🎮', description: '来自 Steam 信息展示插件' } };
  }

  function text(node, value) { node.textContent = value || ''; }

  function renderTabs() {
    tabs.replaceChildren();
    const steamOptions = state.settings.steamEnabled === true ? [steamCategory()] : [];
    const options = [{ metadata: { name: 'all' }, spec: { displayName: '全部', icon: '✦' } }, ...state.categories, ...steamOptions];
    const compactTabs = options.every((category) => Array.from(category.spec.displayName || '').length <= 2);
    tabs.classList.toggle('compact-tabs', compactTabs);
    options.forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `category-tab${state.active === category.metadata.name ? ' active' : ''}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', state.active === category.metadata.name ? 'true' : 'false');
      const icon = document.createElement('b');
      text(icon, category.spec.icon || '🌸');
      button.append(icon, document.createTextNode(category.spec.displayName));
      button.addEventListener('click', () => {
        state.active = category.metadata.name;
        renderTabs();
        renderCards();
        if (state.active === STEAM_CATEGORY) loadSteamGames();
      });
      tabs.append(button);
    });
  }

  function visibleItems() {
    const keyword = state.keyword.trim().toLocaleLowerCase();
    return state.items.filter((item) => {
      const spec = item.spec || {};
      const matchesCategory = state.active === 'all' || spec.category === state.active;
      const haystack = `${spec.title || ''} ${spec.description || ''} ${spec.impression || ''}`.toLocaleLowerCase();
      return matchesCategory && (!keyword || haystack.includes(keyword));
    });
  }

  function createCard(item) {
    const spec = item.spec || {};
    const category = categoryOf(spec.category);
    const card = document.createElement('article');
    card.className = 'showcase-card';
    card.tabIndex = 0;
    card.setAttribute('aria-label', `查看《${spec.title || '未命名'}》详情`);
    const frame = document.createElement('div'); frame.className = 'cover-frame';
    const cover = safeImage(spec.cover);
    if (cover) {
      const image = document.createElement('img'); image.src = cover; image.alt = `${spec.title || ''}封面`; image.loading = 'lazy';
      image.addEventListener('error', () => image.replaceWith(placeholder()));
      frame.append(image);
    } else frame.append(placeholder());
    // Show the bound category's displayName (e.g. 动漫 / 美食) as the card
    // badge in the top-left corner so each card carries the same label as the
    // tab the visitor used to reach it. Items without a category still fall
    // back to "未分类" so the badge stays consistent with the catalogue tabs.
    const categoryDisplayName = String(category?.spec?.displayName || '').trim() || '未分类';
    const badge = document.createElement('span'); badge.className = 'card-badge';
    text(badge, categoryDisplayName);
    frame.append(badge);
    const tags = collectCardTags(spec, category);
    if (tags.length) {
      const tagList = document.createElement('span'); tagList.className = 'card-tags';
      tags.forEach((tag) => { const node = document.createElement('b'); text(node, tag); tagList.append(node); });
      frame.append(tagList);
    }
    if (Number(spec.score) > 0) {
      const score = document.createElement('span'); score.className = 'card-score';
      score.style.top = '12px'; score.style.bottom = 'auto';
      const scoreValue = Number(spec.score);
      score.setAttribute('aria-label', `评分 ${scoreValue} / 10`);
      const star = document.createElement('b'); star.className = 'score-star'; star.textContent = '★';
      const value = document.createElement('span'); text(value, Number.isInteger(scoreValue) ? `${scoreValue}` : scoreValue.toFixed(1));
      score.append(star, value); frame.append(score);
    }
    const likeButton = document.createElement('a');
    likeButton.href = ''; likeButton.className = 'paw-button';
    likeButton.setAttribute('role', 'button');
    likeButton.setAttribute('aria-label', `点赞 ${spec.title || '这份收藏'}`);
    const likeStorageKey = `showcase-liked:${item.metadata.name}`;
    const clonePresetSymbol = (id, className = '') => {
      const symbol = document.getElementById(id);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      if (className) svg.classList.add(className);
      svg.setAttribute('viewBox', symbol?.getAttribute('viewBox') || '0 0 30 37');
      svg.setAttribute('aria-hidden', 'true');
      if (symbol) Array.from(symbol.childNodes).forEach((node) => svg.append(node.cloneNode(true)));
      return svg;
    };
    const likeText = document.createElement('div'); likeText.className = 'text';
    likeText.append(clonePresetSymbol('heart'), Object.assign(document.createElement('span'), { textContent: 'Like' }));
    const paws = document.createElement('div'); paws.className = 'paws';
    paws.append(clonePresetSymbol('paw', 'paw'));
    const pawEffect = document.createElement('div'); pawEffect.className = 'paw-effect'; pawEffect.append(document.createElement('div')); paws.append(pawEffect);
    paws.append(clonePresetSymbol('paw-clap', 'paw-clap'));
    likeButton.append(likeText, document.createElement('span'), paws);
    const likeCount = likeButton.children[1];
    likeCount.textContent = `${Number(spec.likes) || 0}`;
    frame.append(likeButton);
    try { if (localStorage.getItem(likeStorageKey) === 'true') likeButton.classList.add('liked'); } catch (_) {}
    likeButton.addEventListener('click', async (event) => {
      event.preventDefault(); event.stopPropagation();
      if (likeButton.dataset.loading === 'true' || likeButton.classList.contains('liked')) return;
      likeButton.dataset.loading = 'true'; likeButton.classList.add('animation');
      const animationReady = new Promise((resolve) => window.setTimeout(resolve, 660));
      for (let index = 0; index < 60; index += 1) {
        const particle = document.createElement('i'); particle.className = 'paw-confetti';
        particle.style.setProperty('--x', `${Math.floor(Math.random() * 521) - 260}px`);
        particle.style.setProperty('--y', `${Math.floor(Math.random() * 321) - 160}px`);
        particle.style.setProperty('--r', `${Math.round(Math.random() * 360)}deg`);
        particle.style.setProperty('--s', `${(Math.random() * .4 + .6).toFixed(2)}`);
        particle.style.setProperty('--b', ['#7d32f5','#f6e434','#63fdf1','#e672da','#295dfe','#6e57ff'][Math.floor(Math.random() * 6)]);
        likeButton.append(particle);
      }
      window.setTimeout(() => likeButton.classList.add('confetti'), 260);
      try {
        const response = await fetch(`${API}/items/like?name=${encodeURIComponent(item.metadata.name)}`, { method: 'POST', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('点赞失败');
        const updated = await response.json(); const count = Number(updated.likes) || (Number(likeCount.textContent) || 0) + 1;
        await animationReady;
        likeCount.textContent = `${count}`; spec.likes = count;
        likeButton.classList.add('liked');
        try { localStorage.setItem(likeStorageKey, 'true'); } catch (_) {}
        window.setTimeout(() => {
          likeButton.classList.remove('animation', 'confetti');
          likeButton.querySelectorAll('.paw-confetti').forEach((particle) => particle.remove());
        }, 820);
      } catch (error) {
        likeButton.classList.remove('animation', 'confetti', 'liked');
        likeButton.querySelectorAll('.paw-confetti').forEach((particle) => particle.remove());
        console.warn('[Showcase] 点赞失败。', error);
      } finally { likeButton.dataset.loading = 'false'; }
    });
    likeButton.addEventListener('keydown', (event) => event.stopPropagation());
    const copy = document.createElement('div'); copy.className = 'card-copy';
    const title = document.createElement('h2'); text(title, spec.title || '未命名');
    const desc = document.createElement('p'); text(desc, spec.description || spec.impression || '点击看看这份收藏');
    const listMeta = document.createElement('div'); listMeta.className = 'list-card-meta';
    const listHeading = document.createElement('div'); listHeading.className = 'list-card-heading';
    const listCategory = document.createElement('span'); listCategory.className = 'list-card-category'; text(listCategory, `${category?.spec?.icon || '✦'} ${category?.spec?.displayName || '未分类'}`); listHeading.append(title, listCategory);
    tags.forEach((tag) => { const node = document.createElement('span'); text(node, tag); listMeta.append(node); });
    const listActions = document.createElement('div'); listActions.className = 'list-card-actions';
    const listTags = collectCardTags(spec, category);
    listMeta.replaceChildren();
    listTags.forEach((tag) => { const node = document.createElement('span'); text(node, tag); listMeta.append(node); });
    if (spec.status && isAnimeTemplate(item)) { const node = document.createElement('span'); node.className = 'list-card-status'; text(node, spec.status); listActions.append(node); }
    if (Number(spec.score) > 0) { const node = document.createElement('span'); node.className = 'list-card-score'; text(node, `★ ${Number.isInteger(Number(spec.score)) ? Number(spec.score) : Number(spec.score).toFixed(1)}`); listActions.append(node); }
    copy.append(listHeading, listMeta, desc); card.append(frame, copy, listActions);
    card.addEventListener('click', () => openDetail(item));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(item); } });
    return card;
  }

  function subcategoryOf(name) {
    return state.subcategories.find((item) => item.metadata.name === name);
  }

  function templateOf(name) {
    if (!name) return null;
    return state.templates.find((item) => item.metadata.name === name) || null;
  }

  /**
   * Collect the labels rendered on a card cover (or list-card meta).
   *
   * Standard items keep a fixed {@code spec.tags} array; items bound to a
   * custom template store their labels under {@code customFields[<key>]} where
   * the matching field is declared with {@code type === 'tags'}. We merge both
   * sources so a 美食探店 item with "麻辣, 甜口" stored in
   * {@code customFields.flavor_tags} shows up on the card exactly like the
   * 动漫影视 items do.
   */
  function collectCardTags(spec, category) {
    const result = [];
    const pushTags = (raw) => {
      if (raw == null || raw === '') return;
      const values = Array.isArray(raw) ? raw : String(raw).split(/[,，、\n]/);
      values.map((entry) => String(entry || '').trim()).filter(Boolean).forEach((tag) => {
        if (!result.includes(tag)) result.push(tag);
      });
    };
    pushTags(spec && spec.tags);
    const customFields = spec && spec.customFields && typeof spec.customFields === 'object' ? spec.customFields : {};
    const templateName = String((spec && spec.template) || (category && category.spec && category.spec.template) || '').trim();
    const template = templateOf(templateName);
    const fields = [];
    if (Array.isArray(category && category.spec && category.spec.templateFields)) fields.push(...category.spec.templateFields);
    if (Array.isArray(template && template.spec && template.spec.fields)) fields.push(...template.spec.fields);
    const seenKeys = new Set();
    fields.forEach((field) => {
      if (!field || !field.key || seenKeys.has(field.key)) return;
      seenKeys.add(field.key);
      const isTagField = field.type === 'tags' || field.key === 'tags' || field.label === '封面标签';
      if (!isTagField) return;
      pushTags(customFields[field.key]);
    });
    pushTags(customFields.tags);
    return result.slice(0, 6);
  }

  function resolveItemDescription(spec, category) {
    const parts = [];
    const direct = String(spec?.description || '').trim();
    if (direct) parts.push(direct);
    const customFields = spec?.customFields && typeof spec.customFields === 'object' ? spec.customFields : null;
    const templateFields = Array.isArray(category?.spec?.templateFields) ? category.spec.templateFields : [];
    templateFields
      .filter((field) => field && field.type === 'textarea' && field.key === 'description')
      .forEach(() => {
        if (!customFields) return;
        const value = String(customFields.description || '').trim();
        if (value && !parts.includes(value)) parts.push(value);
      });
    return parts.join('\n\n');
  }

  /**
   * Whether the item is bound to the 动漫影视 (formerly "standard") template.
   * The item's {@code spec.template} takes precedence over the category
   * default. Items without a template binding are also considered standard
   * for backward compatibility with data created before template support
   * shipped.
   */
  function isAnimeTemplate(item) {
    const spec = item && item.spec ? item.spec : {};
    const category = categoryOf(spec.category);
    const value = String(spec.template || (category?.spec?.template || '')).trim();
    return !value || value === 'standard' || value === 'preset-standard';
  }

  function itemSortKey(item) {
    const spec = item.spec || {};
    const category = categoryOf(spec.category);
    const subcategory = subcategoryOf(spec.subcategory);
    const categoryPriority = Number(category?.spec?.priority) || 0;
    const subcategoryPriority = spec.subcategory ? Number(subcategory?.spec?.priority) || 0 : -1;
    const itemPriority = Number(spec.priority) || 0;
    const created = Date.parse(item.metadata?.creationTimestamp || '') || Number.MAX_SAFE_INTEGER;
    return [categoryPriority, subcategoryPriority, itemPriority, created, item.metadata?.name || ''];
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      const left = itemSortKey(a); const right = itemSortKey(b);
      for (let index = 0; index < 4; index += 1) {
        if (left[index] !== right[index]) return left[index] - right[index];
      }
      return String(left[4]).localeCompare(String(right[4]));
    });
  }

  function renderGroupedItems(items) {
    const groups = [];
    const grouped = new Map();
    sortItems(items).forEach((item) => {
      const key = item.spec?.subcategory || '__default__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    grouped.forEach((groupItems, key) => {
      const section = document.createElement('section');
      section.className = 'subcategory-section';
      if (key !== '__default__') {
        const subcategory = subcategoryOf(key);
        const heading = document.createElement('div'); heading.className = 'subcategory-heading';
        const title = document.createElement('h2'); text(title, `${subcategory?.spec?.icon || '✦'} ${subcategory?.spec?.displayName || '子分类'}`);
        const description = document.createElement('p'); text(description, subcategory?.spec?.description || '');
        heading.append(title, description); section.append(heading);
      }
      const groupGrid = document.createElement('div'); groupGrid.className = 'showcase-grid';
      groupGrid.append(...groupItems.map(createCard)); section.append(groupGrid); groups.push(section);
    });
    grid.classList.add('grouped-grid');
    grid.replaceChildren(...groups);
  }

  function renderAllGroupedItems(items) {
    const grouped = new Map();
    sortItems(items).forEach((item) => {
      const key = item.spec?.category || '__uncategorized__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    const sections = [];
    grouped.forEach((groupItems, categoryName) => {
      if (!groupItems.length) return;
      const section = document.createElement('section');
      section.className = 'subcategory-section category-overview-section';
      const category = categoryOf(categoryName);
      const heading = document.createElement('div');
      heading.className = 'subcategory-heading';
      const title = document.createElement('h2');
      text(title, `${category?.spec?.icon || '✦'} ${category?.spec?.displayName || '未分类'}`);
      heading.append(title);
      const groupGrid = document.createElement('div');
      groupGrid.className = 'showcase-grid';
      groupGrid.append(...groupItems.map(createCard));
      section.append(heading, groupGrid);
      sections.push(section);
    });
    grid.classList.add('grouped-grid');
    grid.replaceChildren(...sections);
  }

  function steamNotice(title, message, kind = 'warning') {
    const notice = document.createElement('article'); notice.className = `steam-notice ${kind}`;
    const icon = document.createElement('span'); icon.textContent = kind === 'loading' ? '◌' : kind === 'error' ? '!' : '🎮';
    const copy = document.createElement('div'); const heading = document.createElement('h2'); const detail = document.createElement('p');
    text(heading, title); text(detail, message); copy.append(heading, detail); notice.append(icon, copy); return notice;
  }

  function createSteamIntro(gameCount) {
    const intro = document.createElement('article'); intro.className = 'steam-intro';
    const copy = document.createElement('div');
    const eyebrow = document.createElement('small'); eyebrow.textContent = 'STEAM LIBRARY';
    const title = document.createElement('h2'); title.textContent = '博主的游戏足迹';
    const description = document.createElement('p'); description.textContent = `已同步 ${gameCount} 款游戏，按累计游玩时长排列。`;
    copy.append(eyebrow, title, description);
    const link = document.createElement('a'); link.href = '/steam'; link.textContent = '查看完整 Steam 资料 ↗';
    intro.append(copy, link); return intro;
  }

  function createSteamCard(game) {
    const appId = Number(game?.appId) || 0;
    const card = document.createElement('a'); card.className = 'steam-card';
    card.href = appId ? `https://store.steampowered.com/app/${appId}` : '/steam';
    card.target = '_blank'; card.rel = 'noopener noreferrer';
    card.setAttribute('aria-label', `在 Steam 查看${game?.name || '这款游戏'}`);
    const frame = document.createElement('div'); frame.className = 'steam-cover';
    const imageUrl = safeImage(game?.realHeaderImage || game?.headerImageUrl);
    if (imageUrl) {
      const image = document.createElement('img'); image.src = imageUrl; image.alt = `${game?.name || ''}游戏封面`; image.loading = 'lazy';
      image.addEventListener('error', () => { frame.classList.add('no-cover'); image.remove(); }); frame.append(image);
    } else frame.classList.add('no-cover');
    const logo = document.createElement('b'); logo.textContent = 'STEAM'; frame.append(logo);
    const copy = document.createElement('div'); copy.className = 'steam-copy';
    const title = document.createElement('h2'); text(title, game?.name || `Steam 游戏 ${appId}`);
    const meta = document.createElement('div');
    const playtime = document.createElement('span'); const playtimeValue = document.createElement('b'); const playtimeLabel = document.createElement('small');
    text(playtimeValue, String(game?.playtimeFormatted || '0m')); playtimeLabel.textContent = '累计游玩'; playtime.append(playtimeValue, playtimeLabel);
    const lastPlayed = document.createElement('span'); const lastPlayedValue = document.createElement('b'); const lastPlayedLabel = document.createElement('small');
    text(lastPlayedValue, String(game?.lastPlayedFormatted || '尚未游玩')); lastPlayedLabel.textContent = '最后游玩'; lastPlayed.append(lastPlayedValue, lastPlayedLabel);
    meta.append(playtime, lastPlayed); copy.append(title, meta); card.append(frame, copy); return card;
  }

  function placeholder() {
    const box = document.createElement('div'); box.className = 'cover-placeholder';
    const flower = document.createElement('span'); flower.textContent = '🌸';
    const label = document.createElement('small'); label.textContent = 'NO COVER';
    box.append(flower, label); return box;
  }

  function renderSteamCards() {
    // Clear grouped layout from the previous category so Steam stays a grid.
    grid.classList.remove('grouped-grid');
    grid.classList.add('steam-grid'); empty.hidden = true;
    if (state.settings.steamEnabled !== true) {
      grid.replaceChildren(steamNotice('暂时无法读取 Steam 游戏', '请确认 Steam 信息展示功能已经启用并可用。'));
      return;
    }
    if (state.steamLoading) {
      grid.replaceChildren(steamNotice('正在连接 Steam 展示库', '游戏资料同步中，请稍候…', 'loading'));
      return;
    }
    if (state.steamError) {
      grid.replaceChildren(steamNotice('Steam 游戏加载失败', state.steamError, 'error'));
      return;
    }
    if (!Array.isArray(state.steamGames)) {
      grid.replaceChildren(steamNotice('准备读取 Steam 游戏', '首次打开游戏分类时会自动同步游戏资料。', 'loading'));
      return;
    }
    const keyword = state.keyword.trim().toLocaleLowerCase();
    const games = state.steamGames.filter((game) => !keyword || String(game?.name || '').toLocaleLowerCase().includes(keyword));
    if (!games.length) {
      grid.replaceChildren(steamNotice(keyword ? '没有找到这款游戏' : 'Steam 游戏库还是空的', keyword ? '换一个关键词再找找吧。' : '请先在 Steam 信息展示插件中完成账号配置和数据同步。'));
      return;
    }
    grid.replaceChildren(createSteamIntro(state.steamGames.length), ...games.map(createSteamCard));
  }

  async function loadSteamGames() {
    if (state.settings.steamEnabled !== true || state.steamLoading || Array.isArray(state.steamGames)) return;
    state.steamLoading = true; state.steamError = ''; renderSteamCards();
    try {
      const response = await fetch(`${STEAM_API}/games?page=1&size=100&sortBy=playtime_forever`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Steam 接口返回 ${response.status}`);
      const result = await response.json();
      if (!Array.isArray(result?.items)) throw new Error('Steam 插件没有返回可识别的游戏列表');
      state.steamGames = result.items;
    } catch (error) {
      console.warn('[Showcase] Steam 游戏加载失败。', error);
      state.steamError = `${error?.message || '请求失败'}。请确认“Steam 信息展示”插件已启用并完成 Steam 账号配置。`;
    } finally {
      state.steamLoading = false; renderSteamCards();
    }
  }

  function renderCards() {
    if (state.active === STEAM_CATEGORY) { renderSteamCards(); return; }
    grid.classList.remove('steam-grid');
    const items = sortItems(visibleItems());
    grid.classList.toggle('grouped-grid', state.active !== 'all');
    if (state.active !== 'all') renderGroupedItems(items); else renderAllGroupedItems(items);
    empty.hidden = items.length > 0;
  }

  function openDetail(item) {
    const spec = item.spec || {}; const category = categoryOf(spec.category);
    const image = dialog.querySelector('.dialog-cover img'); image.src = safeImage(spec.cover) || '/plugins/showcase/assets/static/cover-placeholder.svg'; image.alt = `${spec.title || ''}封面`;
    text(dialog.querySelector('.dialog-category'), `${category?.spec?.icon || '🌸'}  ${category?.spec?.displayName || '未分类'}`);
    text(dialog.querySelector('h2'), spec.title || '未命名');
    const meta = dialog.querySelector('.dialog-meta'); meta.replaceChildren();
    // Only render the 观看状态 badge for 动漫影视 items. Non-standard templates
    // hide the standard fields in the editor, so the badge should not show up
    // on the public detail either.
    if (spec.status && isAnimeTemplate(item)) { const span = document.createElement('span'); text(span, spec.status); meta.append(span); }
    if (Number(spec.score) > 0) {
      const span = document.createElement('span');
      const star = document.createElement('b'); star.className = 'score-star'; star.textContent = '★';
      span.append(star, document.createTextNode(` 评分 ${spec.score} / 10`)); meta.append(span);
    }
    const detailTags = collectCardTags(spec, category);
    if (detailTags.length) {
      const span = document.createElement('span'); text(span, detailTags.join(' · ')); meta.append(span);
    }
    // Description section: merge direct + customFields.description and hide the
    // entire section when nothing was filled in.
    const description = dialog.querySelector('.description-section');
    const descriptionText = resolveItemDescription(spec, category);
    if (description) {
      description.hidden = !descriptionText;
      // Use the matching template field label when available so 美食探店
      // items show "店铺简介" instead of the 动漫影视 default.
      const descriptionField = (category?.spec?.templateFields || []).find((field) => field && field.key === 'description');
      const descriptionHeading = descriptionField?.label || (isAnimeTemplate(item) ? '作品简介' : '内容简介');
      const headingNode = description.querySelector('h3');
      if (headingNode) headingNode.textContent = descriptionHeading;
      text(description.querySelector('p'), descriptionText);
    }
    // The impression textarea is a standard 动漫影视 field. Only show it when
    // the item is on the standard template (or no template override at all).
    const impression = dialog.querySelector('.impression-section');
    const impressionText = String(spec.impression || '').trim();
    if (impression) {
      impression.hidden = !impressionText;
      text(impression.querySelector('p'), impressionText);
    }
    const custom = dialog.querySelector('.custom-fields-section');
    if (custom) {
      const fields = category?.spec?.templateFields || []; custom.hidden = true; custom.querySelector('.custom-fields-body').replaceChildren();
      fields.forEach((field) => {
        // Skip the universal "description" field; it is rendered above.
        if (!field || field.key === 'description') return;
        const value = String(spec.customFields?.[field.key] || '').trim(); if (!value) return;
        const row = document.createElement('div'); row.className = 'custom-field-row'; const label = document.createElement('b'); text(label, field.label);
        const content = field.type === 'url' && safeLink(value) ? document.createElement('a') : document.createElement('span');
        text(content, value);
        if (content.tagName === 'A') { content.href = safeLink(value); content.target = '_blank'; content.rel = 'noopener noreferrer'; }
        row.append(label, content); custom.querySelector('.custom-fields-body').append(row); custom.hidden = false;
      });
    }
    const watch = dialog.querySelector('.watch-button'); const href = safeLink(spec.watchUrl); watch.hidden = !href; if (href) watch.href = href; else watch.removeAttribute('href');
    const external = dialog.querySelector('.external-link-card'); const externalHref = safeLink(spec.externalUrl); external.hidden = !externalHref; if (externalHref) external.href = externalHref; else external.removeAttribute('href');
    [watch, external].forEach((link) => {
      link.onclick = (event) => {
        const target = safeLink(link.href);
        if (!target) return;
        event.preventDefault();
        navigateExternal(target);
      };
    });
    const detailComments = dialog.querySelector('#detail-comments');
    const detailMount = dialog.querySelector('#detail-comment-widget');
    dialog.dataset.showcaseCommentType = state.settings.commentType || 'halo';
    // Stamp the mount with the currently displayed item name so the live
    // settings sync can re-mount the correct comment widget when the admin
    // changes the comment system while the dialog is open.
    if (detailMount && item?.metadata?.name) detailMount.dataset.showcaseItemName = item.metadata.name;
    const detailCommentsEnabled = state.settings.detailCommentEnabled !== false;
    detailComments.hidden = !detailCommentsEnabled;
    if (detailCommentsEnabled) {
      if (state.settings.commentType === 'twikoo' && state.settings.twikooEnvId) setupTwikooMount(detailMount, `/movie/${item.metadata.name}`);
      else setupCommentMount(detailMount, { group: 'showcase.halo.run', kind: 'ShowcaseItem', name: item.metadata.name });
    } else {
      commentObservers.get(detailMount)?.disconnect();
      detailMount.replaceChildren();
    }
    dialog.querySelector('.dialog-layout article').scrollTop = 0;
    openDetailDialog();
  }

  dialog.querySelector('.dialog-close').addEventListener('click', closeDetailDialog);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDetailDialog(); });
  detailDialogBackdrop.addEventListener('click', closeDetailDialog);
  // `dialog.show()` does not auto-close on Escape (only `showModal()` does),
  // so wire it up manually for the non-modal flow. The handler is registered
  // lazily inside `openDetailDialog` and torn down on close, so the global
  // document only carries the listener while the dialog is actually visible
  // and never piggy-backs on unrelated keypresses from mobile soft keyboards
  // or the search box.
  let escapeListener = null;
  const registerEscapeListener = () => {
    if (escapeListener) return;
    escapeListener = (event) => {
      if (event.key === 'Escape' && dialog.open) {
        event.preventDefault();
        closeDetailDialog();
      }
    };
    document.addEventListener('keydown', escapeListener);
  };
  const unregisterEscapeListener = () => {
    if (!escapeListener) return;
    document.removeEventListener('keydown', escapeListener);
    escapeListener = null;
  };
  dialog.addEventListener('close', () => {
    detailDialogBackdrop.hidden = true;
    unregisterEscapeListener();
    document.documentElement.classList.remove('showcase-next-detail-open');
    resumeShowcaseMedia();
    document.body.style.overflow = '';
  });
  externalConfirm?.addEventListener('click', (event) => { if (event.target === externalConfirm) externalConfirm.close('cancel'); });
  $('#external-confirm-continue')?.addEventListener('click', () => {
    if (!pendingExternalUrl) return;
    const domain = externalDomain(pendingExternalUrl);
    if ($('#external-confirm-skip')?.checked && domain) sessionStorage.setItem(`showcase-skip-external:${domain}`, '1');
    const url = pendingExternalUrl;
    pendingExternalUrl = '';
    externalConfirm.close('continue');
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  $('#search-input').addEventListener('input', (event) => { state.keyword = event.target.value; renderCards(); });
  setupCardSizeToggle();
  setupViewModeToggle();
  setupPageJumpControls();

  async function openStartupPermalink() {
    const path = location.pathname.replace(/\/$/, '') || '/movie'; const itemMatch = path.match(/^\/movie\/([^/]+)$/);
    if (itemMatch) { let name = itemMatch[1]; try { name = decodeURIComponent(name); } catch (_) {} const item = state.items.find((candidate) => candidate.metadata?.name === name); if (item) openDetail(item); return; }
    if (path !== '/movie' || !location.hash || state.settings.commentType !== 'twikoo' || !state.settings.twikooEnvId) return;
    const commentId = location.hash.slice(1); try { const response = await fetch(state.settings.twikooEnvId,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({event:'GET_RECENT_COMMENTS',includeReply:true,pageSize:100})}); if(!response.ok)return; const result=await response.json(); const comment=(Array.isArray(result?.data)?result.data:[]).find((candidate)=>String(candidate?.id||'')===commentId); const match=comment?.url && new URL(comment.url,location.origin).pathname.match(/^\/movie\/([^/]+)$/); if(match){ let name=decodeURIComponent(match[1]); const item=state.items.find((candidate)=>candidate.metadata?.name===name); if(item)openDetail(item); } } catch (_) {}
  }

  Promise.all([loadPublicCatalog(), get('/public/v1/page')]).then(([catalog, settings]) => {
    const publicData = adaptPublicCatalog(catalog);
    state.items = publicData.items; state.categories = publicData.categories; state.subcategories = publicData.subcategories; state.templates = publicData.templates || []; state.settings = settings || {};
    const currentType = settings?.commentType || 'halo';
    try {
      const previousType = sessionStorage.getItem(COMMENT_TYPE_KEY);
      if (previousType && previousType !== currentType) {
        rememberCommentType(currentType);
        location.reload();
        return;
      }
      rememberCommentType(currentType);
    } catch (_) {}
    setupSettingsChangeWatcher(currentType);
    if (currentType === 'halo') setupNativeCommentTopLayers();
    setupDayNightToggle(settings.themeColor);
    applySiteIdentity(settings);
    applyPageEffect(settings);
    applyHeroGif(settings);
    applyBackgrounds(settings);
    applySignature(settings);
    setupComments(settings);
    applyVisitorStats(settings);
    text($('#page-title'), settings.pageTitle); text($('#page-subtitle'), settings.subtitle); text($('#owner-text'), settings.ownerText);
    document.title = `${settings.pageTitle || '我的展示架'} - ${settings.siteName || '展示架'}`;
    text($('#item-count'), state.items.length); text($('#category-count'), state.categories.length + (settings.steamEnabled === true ? 1 : 0));
    $('#loading').remove(); renderTabs(); renderCards(); openStartupPermalink();
  }).catch((error) => {
    console.error('[Showcase]', error); $('#loading').remove(); empty.hidden = false;
    text(empty.querySelector('h2'), '展示架暂时没有打开'); text(empty.querySelector('p'), '请稍后刷新页面再试。');
  });
})();
