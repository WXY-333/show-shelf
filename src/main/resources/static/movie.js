(() => {
  'use strict';
  const API = '/apis/api.showcase.halo.run/v1alpha1';
  const STEAM_API = '/apis/api.steam.timxs.com/v1alpha1';
  const STEAM_CATEGORY = '__steam__';
  const DEFAULT_THEME_COLOR = '#E96F9D';
    const viewModeKey = 'showcase.frontend.viewMode.v1';
  const cardSizeKey = 'showcase.frontend.cardSize.v1';
  const readFrontendViewMode = () => {
    try { return localStorage.getItem(viewModeKey) || 'card'; } catch (_) { return 'card'; }
  };
  const persistFrontendViewMode = (mode) => {
    try { localStorage.setItem(viewModeKey, mode); } catch (_) {}
  };
  const readFrontendCardSize = () => {
    try { return localStorage.getItem(cardSizeKey) || 'md'; } catch (_) { return 'md'; }
  };
  const persistFrontendCardSize = (size) => {
    try { localStorage.setItem(cardSizeKey, size); } catch (_) {}
  };
  const state = { items: [], categories: [], subcategories: [], settings: {}, active: 'all', keyword: '', steamGames: null, steamLoading: false, steamError: '', viewMode: readFrontendViewMode(), cardSize: readFrontendCardSize() };
  const commentObservers = new WeakMap();
  const $ = (selector) => document.querySelector(selector);
  const grid = $('#showcase-grid');
  const tabs = $('#category-tabs');
  const empty = $('#empty-state');
  const dialog = $('#detail-dialog');
  const externalConfirm = $('#external-confirm-dialog');
  let pendingExternalUrl = '';

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
    const mounts = [...document.querySelectorAll('.showcase-comment-widget, .detail-comment-widget')];
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
      '--halo-cw-base-font-size': '15px'
    };
    [...sections, ...mounts, ...mounts.flatMap((mount) => [...mount.querySelectorAll('comment-widget')])].forEach((node) => {
      Object.entries(variables).forEach(([name, value]) => node.style.setProperty(name, value));
      if (node.matches?.('comment-widget')) {
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
    if (state.settings.commentAnonymousEmail) {
      setupAnonymousEmailHandler(mount);
    }
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

  async function setupCommentMount(mount, target, unavailableMessage = true) {
    if (!mount) return;
    commentObservers.get(mount)?.disconnect();
    const stylesheetUrl = '/plugins/PluginCommentWidget/assets/static/index.css';
    if (!document.querySelector(`link[href="${stylesheetUrl}"]`)) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = stylesheetUrl; link.dataset.showcaseCommentStyle = 'true'; document.head.append(link);
    }
    try {
      const { init } = await import('/plugins/PluginCommentWidget/assets/static/comment-widget.js');
      mount.replaceChildren();
      init(`#${mount.id}`, target);
      customizeNativeCommentForms(mount);
      let checks = 0;
      const timer = window.setInterval(() => {
        const found = customizeNativeCommentForms(mount); checks += 1;
        if (found || checks >= 80) window.clearInterval(timer);
      }, 250);
      const observer = new MutationObserver(() => { customizeNativeCommentForms(mount); syncCommentTheme(); });
      observer.observe(mount, { childList: true, subtree: true });
      commentObservers.set(mount, observer);
      syncCommentTheme(); window.setTimeout(syncCommentTheme, 500);
    } catch (error) {
      console.warn('[Showcase] Halo 评论组件加载失败。', error);
      if (unavailableMessage) {
        const message = document.createElement('p'); message.className = 'comment-unavailable';
        message.innerHTML = '<span><strong>评论区暂时无法加载</strong>请确认 Halo 官方“评论组件”插件已经安装并启用。</span>';
        mount.replaceChildren(message);
      }
    }
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
    if (settings.commentType === 'twikoo' && settings.twikooEnvId) {
      setupTwikooMount(mount, '/movie');
    } else {
      setupCommentMount(mount, { group: 'showcase.halo.run', kind: 'ShowcaseSettings', name: 'showcase-settings' });
    }
  }

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
      if (category.metadata.name === STEAM_CATEGORY && state.settings.steamActive !== true) {
        button.classList.add('dependency-missing');
        button.title = state.settings.steamMessage || 'Steam 信息展示插件不可用';
      }
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


  function createListItem(item) {
    const spec = item.spec || {};
    const category = categoryOf(spec.category);
    const row = document.createElement('article');
    row.className = 'showcase-list-item';
    row.tabIndex = 0;
    row.setAttribute('aria-label', `查看《${spec.title || '未命名'}》详情`);

    const thumb = document.createElement('div');
    thumb.className = 'list-item-thumb';
    const cover = safeImage(spec.cover);
    if (cover) {
      const img = document.createElement('img');
      img.src = cover;
      img.alt = `${spec.title || ''}封面`;
      img.loading = 'lazy';
      img.addEventListener('error', () => img.replaceWith(placeholder()));
      thumb.append(img);
    } else {
      thumb.append(placeholder());
    }

    const main = document.createElement('div');
    main.className = 'list-item-main';

    const titleLine = document.createElement('div');
    titleLine.className = 'list-item-title-line';
    const title = document.createElement('h3');
    title.title = spec.title || '';
    text(title, spec.title || '未命名');
    titleLine.append(title);
    if (category) {
      const catBadge = document.createElement('span');
      catBadge.className = 'list-item-category';
      text(catBadge, `${category?.spec?.icon || '🌸'} ${category?.spec?.displayName || ''}`);
      titleLine.append(catBadge);
    }

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'list-item-tags';
    const tags = Array.isArray(spec.tags) ? spec.tags.filter(Boolean).slice(0, 5) : [];
    tags.forEach((t) => {
      const tagSpan = document.createElement('span');
      text(tagSpan, t);
      tagsContainer.append(tagSpan);
    });

    main.append(titleLine, tagsContainer);

    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    if (spec.status) {
      const statusSpan = document.createElement('span');
      statusSpan.className = 'list-item-status';
      text(statusSpan, spec.status);
      meta.append(statusSpan);
    }
    if (Number(spec.score) > 0) {
      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'list-item-score';
      scoreSpan.innerHTML = `★ <b>${spec.score}</b>`;
      meta.append(scoreSpan);
    }

    row.append(thumb, main, meta);
    row.addEventListener('click', () => openDetail(item));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail(item);
      }
    });
    return row;
  }

  function applyGridClasses(targetGrid) {
    if (!targetGrid) return;
    targetGrid.classList.remove('grid-size-sm', 'grid-size-md', 'grid-size-lg', 'showcase-list-mode');
    targetGrid.dataset.viewMode = state.viewMode;
    if (state.viewMode === 'list') {
      targetGrid.classList.add('showcase-list-mode');
    } else {
      targetGrid.classList.add(`grid-size-${state.cardSize}`);
      targetGrid.dataset.cardSize = state.cardSize;
    }
  }

  let twikooPromise = null;
  async function loadTwikooScript() {
    if (window.twikoo) return window.twikoo;
    if (twikooPromise) return twikooPromise;
    let primaryUrl = '';
    try {
      const configured = new URL(String(state.settings?.twikooJsUrl || '').trim());
      if (configured.protocol === 'http:' || configured.protocol === 'https:') primaryUrl = configured.href;
    } catch (_) {}
    primaryUrl ||= 'https://cdn.staticfile.net/twikoo/1.6.40/twikoo.all.min.js';
    const fallbackUrl = 'https://cdn.jsdelivr.net/npm/twikoo@1.6.40/dist/twikoo.all.min.js';
    const load = (url) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.dataset.showcaseTwikoo = 'true';
      script.onload = () => window.twikoo ? resolve(window.twikoo) : reject(new Error('Twikoo 脚本未定义 window.twikoo'));
      script.onerror = () => reject(new Error(`无法加载 Twikoo 脚本：${url}`));
      document.head.append(script);
    });
    twikooPromise = load(primaryUrl).catch((error) => {
      if (primaryUrl === fallbackUrl) throw error;
      return load(fallbackUrl);
    }).catch((error) => {
      twikooPromise = null;
      throw error;
    });
    return twikooPromise;
  }

  function setupAnonymousEmailHandler(rootNode) {
    const handleForm = (form) => {
      if (form.dataset.anonBound) return;
      form.dataset.anonBound = 'true';
      form.addEventListener('submit', () => {
        const mailInput = form.querySelector('input[type="email"], input[name="mail"], .tk-meta-input[type="email"]');
        if (mailInput && !mailInput.value.trim()) {
          mailInput.value = `anon_${Math.random().toString(36).slice(2, 8)}@anonymous.local`;
        }
      }, true);
    };
    const observer = new MutationObserver(() => {
      rootNode.querySelectorAll('.tk-comment-form, form, comment-form').forEach(handleForm);
    });
    observer.observe(rootNode, { childList: true, subtree: true });
    rootNode.querySelectorAll('.tk-comment-form, form, comment-form').forEach(handleForm);
  }
  function scrollToTwikooHash(mount) {
    const hash = location.hash;
    if (!hash || !hash.startsWith('#c')) return;
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch (_) {}
    let attempts = 0;
    const seek = () => {
      const target = document.getElementById(id);
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (++attempts < 20) window.setTimeout(seek, 250);
    };
    seek();
  }


  async function setupTwikooMount(mount, path) {
    if (!mount || !state.settings.twikooEnvId) return;
    const mountParent = mount.parentElement;
    try {
      const twikoo = await loadTwikooScript();
      mount.replaceChildren();
      await twikoo.init({
        envId: state.settings.twikooEnvId,
        el: '#' + mount.id,
        path: path || location.pathname
      });
      const renderedMount = mountParent?.querySelector('.twikoo') || mount;
      renderedMount.id = mount.id;
      if (state.settings.commentAnonymousEmail) {
        setupAnonymousEmailHandler(renderedMount);
      }
      scrollToTwikooHash(renderedMount);
    } catch (e) {
      console.warn('[Showcase] Twikoo 加载失败', e);
      mount.innerHTML = '<p class="comment-unavailable"><span><strong>评论区无法加载</strong>请检查 Twikoo 配置或脚本地址。</span></p>';
    }
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
    const badge = document.createElement('span'); badge.className = 'card-badge'; text(badge, category?.spec?.displayName || '未分类'); frame.append(badge);
    const tags = Array.isArray(spec.tags) ? spec.tags.filter(Boolean).slice(0, 6) : [];
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
    copy.append(title, desc); card.append(frame, copy);
    card.addEventListener('click', () => openDetail(item));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(item); } });
    return card;
  }

  function subcategoryOf(name) {
    return state.subcategories.find((item) => item.metadata.name === name);
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
      applyGridClasses(groupGrid);
      const itemRenderer = state.viewMode === 'list' ? createListItem : createCard;
      groupGrid.append(...groupItems.map(itemRenderer)); section.append(groupGrid); groups.push(section);
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
      applyGridClasses(groupGrid);
      const itemRenderer = state.viewMode === 'list' ? createListItem : createCard;
      groupGrid.append(...groupItems.map(itemRenderer));
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
    if (!state.settings.steamActive) {
      grid.replaceChildren(steamNotice('暂时无法读取 Steam 游戏', state.settings.steamMessage || '请安装并启用“Steam 信息展示”插件后再试。'));
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
    if (state.settings.steamActive !== true || state.steamLoading || Array.isArray(state.steamGames)) return;
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
    applyGridClasses(grid);
    const items = sortItems(visibleItems());
    grid.classList.toggle('grouped-grid', state.active !== 'all');
    if (state.active !== 'all') renderGroupedItems(items); else renderAllGroupedItems(items);
    empty.hidden = items.length > 0;
  }
  async function openStartupPermalink() {
    const path = location.pathname.replace(/\/$/, '') || '/movie';
    const itemMatch = path.match(/^\/movie\/([^/]+)$/);
    if (itemMatch) {
      let name = itemMatch[1];
      try { name = decodeURIComponent(name); } catch (_) {}
      const item = state.items.find((candidate) => candidate.metadata?.name === name);
      if (item) openDetail(item);
      return;
    }
    if (path !== '/movie' || !location.hash || !state.settings.twikooEnvId) return;
    const commentId = location.hash.slice(1);
    if (!commentId) return;
    try {
      const response = await fetch(state.settings.twikooEnvId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ event: 'GET_RECENT_COMMENTS', includeReply: true, pageSize: 100 })
      });
      if (!response.ok) throw new Error(`Twikoo 请求失败：${response.status}`);
      const result = await response.json();
      const comments = Array.isArray(result?.data) ? result.data : [];
      const comment = comments.find((candidate) => String(candidate?.id || '') === commentId);
      if (!comment?.url) return;
      const commentPath = new URL(comment.url, location.origin).pathname.replace(/\/$/, '');
      const match = commentPath.match(/^\/movie\/([^/]+)$/);
      if (!match) return;
      let name = match[1];
      try { name = decodeURIComponent(name); } catch (_) {}
      const item = state.items.find((candidate) => candidate.metadata?.name === name);
      if (item) openDetail(item);
    } catch (error) {
      console.warn('[Showcase] 无法解析评论链接', error);
    }
  }


  function openDetail(item) {
    const spec = item.spec || {}; const category = categoryOf(spec.category);
    const image = dialog.querySelector('.dialog-cover img'); image.src = safeImage(spec.cover) || '/plugins/showcase/assets/static/cover-placeholder.svg'; image.alt = `${spec.title || ''}封面`;
    text(dialog.querySelector('.dialog-category'), `${category?.spec?.icon || '🌸'}  ${category?.spec?.displayName || '未分类'}`);
    text(dialog.querySelector('h2'), spec.title || '未命名');
    const meta = dialog.querySelector('.dialog-meta'); meta.replaceChildren();
    if (spec.status) { const span = document.createElement('span'); text(span, spec.status); meta.append(span); }
    if (Number(spec.score) > 0) {
      const span = document.createElement('span');
      const star = document.createElement('b'); star.className = 'score-star'; star.textContent = '★';
      span.append(star, document.createTextNode(` 评分 ${spec.score} / 10`)); meta.append(span);
    }
    if (Array.isArray(spec.tags) && spec.tags.length) {
      const span = document.createElement('span'); text(span, spec.tags.slice(0, 6).join(' · ')); meta.append(span);
    }
    const description = dialog.querySelector('.description-section'); text(description.querySelector('p'), spec.description || '暂时没有填写简介。');
    const impression = dialog.querySelector('.impression-section');
    const impressionText = String(spec.impression || '').trim();
    impression.hidden = !impressionText;
    text(impression.querySelector('p'), impressionText);
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
    const detailCommentsEnabled = state.settings.detailCommentEnabled !== false;
    detailComments.hidden = !detailCommentsEnabled;
    dialog.querySelector('.dialog-layout article').scrollTop = 0;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    if (detailCommentsEnabled) {
      if (state.settings.commentType === 'twikoo' && state.settings.twikooEnvId) {
        setupTwikooMount(detailMount, `/movie/${item.metadata.name}`);
      } else {
        setupCommentMount(detailMount, { group: 'showcase.halo.run', kind: 'ShowcaseItem', name: item.metadata.name });
      }
    } else {
      commentObservers.get(detailMount)?.disconnect();
      detailMount.replaceChildren();
    }
    try { history.replaceState(null, '', `/movie/${item.metadata.name}${location.hash}`); } catch (_) {}
  }

  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; try { history.replaceState(null, '', '/movie'); } catch (_) {} });
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
  function syncViewControls() {
    const isCard = state.viewMode === 'card';
    $('#front-view-card')?.classList.toggle('active', isCard);
    $('#front-view-card')?.setAttribute('aria-pressed', String(isCard));
    $('#front-view-list')?.classList.toggle('active', !isCard);
    $('#front-view-list')?.setAttribute('aria-pressed', String(!isCard));
    const sizeGroup = $('#front-card-size');
    if (sizeGroup) sizeGroup.hidden = !isCard;
    document.querySelectorAll('.front-size-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.size === state.cardSize);
    });
  }

  $('#front-view-card')?.addEventListener('click', () => {
    state.viewMode = 'card';
    persistFrontendViewMode('card');
    syncViewControls();
    renderCards();
  });
  $('#front-view-list')?.addEventListener('click', () => {
    state.viewMode = 'list';
    persistFrontendViewMode('list');
    syncViewControls();
    renderCards();
  });
  document.querySelectorAll('.front-size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cardSize = btn.dataset.size || 'md';
      persistFrontendCardSize(state.cardSize);
      syncViewControls();
      renderCards();
    });
  });


  Promise.all([get('/items'), get('/categories'), get('/subcategories'), get('/settings')]).then(([items, categories, subcategories, settings]) => {
    state.items = items || []; state.categories = categories || []; state.subcategories = subcategories || []; state.settings = settings || {};
    setupDayNightToggle(settings.themeColor); syncViewControls();
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
    $('#loading').remove(); renderTabs(); renderCards();
    openStartupPermalink();
  }).catch((error) => {
    console.error('[Showcase]', error); $('#loading').remove(); empty.hidden = false;
    text(empty.querySelector('h2'), '展示架暂时没有打开'); text(empty.querySelector('p'), '请稍后刷新页面再试。');
  });
})();
