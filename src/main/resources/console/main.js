(function injectShowcaseStylesheet() {
  try {
    var href = '/plugins/showcase/assets/console/style.css?v=1.7.0';
    var existing = document.querySelector('link[data-sc-stylesheet]');
    if (!existing) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = href;
      link.setAttribute('data-sc-stylesheet', 'true');
      var head = document.head || document.getElementsByTagName('head')[0];
      if (head) head.appendChild(link);
    }
    if (!document.querySelector('style[data-sc-fallback]')) {
      var fb = document.createElement('style');
      fb.setAttribute('data-sc-fallback', 'true');
      fb.textContent = [
        'html body .sc-root .sc-primary,html body button.sc-primary{position:relative!important;background:transparent!important;background-color:transparent!important;background-image:none!important;color:#fff!important;overflow:hidden!important;z-index:0!important}',
        'html body .sc-root .sc-primary::before,html body button.sc-primary::before{content:""!important;position:absolute!important;inset:0!important;z-index:-1!important;border-radius:inherit!important;background:#a83f68!important;background-color:#a83f68!important;pointer-events:none!important}',
        'html body .sc-root .sc-primary:hover::before,html body button.sc-primary:hover::before{background:#8f3256!important;background-color:#8f3256!important}',
        'html body .sc-root .sc-secondary,html body button.sc-secondary{position:relative!important;background:transparent!important;background-color:transparent!important;background-image:none!important;color:#382932!important;overflow:hidden!important;z-index:0!important}',
        'html body .sc-root .sc-secondary::before,html body button.sc-secondary::before{content:""!important;position:absolute!important;inset:0!important;z-index:-1!important;border-radius:inherit!important;background:#f4edf0!important;background-color:#f4edf0!important;pointer-events:none!important}',
        'html body .sc-root .sc-visit,html body a.sc-visit{position:relative!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:46px!important;padding:14px 22px!important;font-size:16px!important;font-weight:600!important;line-height:1!important;background:transparent!important;background-color:transparent!important;background-image:none!important;color:#fff!important;opacity:1!important;visibility:visible!important;overflow:hidden!important;z-index:0!important}',
        'html body .sc-root .sc-visit::before,html body a.sc-visit::before{content:""!important;position:absolute!important;inset:0!important;z-index:-1!important;border-radius:inherit!important;background:#382932!important;background-color:#382932!important;pointer-events:none!important}',
        'html body .sc-root .sc-visit:hover::before,html body a.sc-visit:hover::before{background:#241a20!important;background-color:#241a20!important}',
        'html body .sc-root .sc-tabs button.active::after{content:""!important;position:absolute!important;left:12px!important;right:12px!important;bottom:-1px!important;height:2px!important;background:#df6995!important;background-color:#df6995!important;opacity:1!important;visibility:visible!important}',
        'html body .sc-root .sc-tabs i{background:#f6e7ed!important;background-color:#f6e7ed!important}'
      ].join('');
      var head2 = document.head || document.getElementsByTagName('head')[0];
      if (head2) head2.appendChild(fb);
    }
  } catch (e) { /* best-effort */ }
})();

(() => {
  'use strict';
  const { definePlugin, utils } = window.HaloUiShared;
  const { h, onMounted, onBeforeUnmount, markRaw, ref, resolveComponent, nextTick, Fragment } = window.Vue;
  const API = '/apis/api.showcase.halo.run/v1alpha1';
  const DEFAULT_THEME_COLOR = '#E96F9D';

  /**
   * The three template fields that hook into the public card renderer. They
   * are pre-seeded on every new template so editing a freshly created
   * template always exposes the same controls (likes, description, cover
   * tags) as the built-in presets. They are not flagged as {@code builtin}
   * because the user is free to delete or hide them after creation; the
   * {@code core} marker is purely a visual hint in the editor.
   */
  const CORE_TEMPLATE_FIELDS = [
    {
      key: 'description', label: '内容简介', type: 'textarea',
      placeholder: '一段话介绍这份收藏', helpText: '通用简介；不填写则前台不显示该段',
      required: false, showInCard: false, builtin: false, core: true
    },
    {
      key: 'likes', label: '点赞数量', type: 'number',
      placeholder: '', helpText: '可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加',
      unit: '', required: false, showInCard: false, builtin: false, core: true
    },
    {
      key: 'tags', label: '封面标签', type: 'tags',
      placeholder: '例如：麻辣、甜口、清淡', helpText: '多个标签用逗号分隔，最多 6 个；卡片左下角展示',
      required: false, showInCard: true, builtin: false, core: true
    }
  ];
  const defaultTemplateFields = () => CORE_TEMPLATE_FIELDS.map((field) => ({ ...field }));

  const ShelfIcon = markRaw({
    name: 'ShowcaseShelfIcon',
    render() {
      return h('svg', { viewBox: '0 0 24 24', width: '1.2em', height: '1.2em', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8' }, [
        h('path', { d: 'M4 4h16M5 4v16m14-16v16M4 20h16M8 8v8m4-8v8m4-8v8' })
      ]);
    }
  });

  const ShowcaseConsole = {
    name: 'ShowcaseConsole',
    setup() {
      let root;
      let alive = true;
      const AttachmentSelectorModal = resolveComponent('AttachmentSelectorModal');
      const attachmentSelectorOpen = ref(false);
      const attachmentSelectorTarget = ref('');
      const canManage = utils.permission.has(['plugin:showcase:manage']);
      const expandedGroupStorageKey = 'showcase.console.expandedGroups.v1';
      const readExpandedGroups = () => {
        try {
          const stored = window.localStorage.getItem(expandedGroupStorageKey);
          const values = stored ? JSON.parse(stored) : [];
          return Array.isArray(values) ? new Set(values.filter((value) => typeof value === 'string')) : new Set();
        } catch (_) { return new Set(); }
      };
      const persistExpandedGroups = (groups) => {
        try { window.localStorage.setItem(expandedGroupStorageKey, JSON.stringify(Array.from(groups))); } catch (_) { /* local storage may be unavailable */ }
      };
      const viewModeStorageKey = 'showcase.console.itemViewMode.v1';
      const readViewMode = () => {
        try {
          return window.localStorage.getItem(viewModeStorageKey) || 'grid';
        } catch (_) { return 'grid'; }
      };
      const persistViewMode = (mode) => {
        try { window.localStorage.setItem(viewModeStorageKey, mode); } catch (_) { /* local storage may be unavailable */ }
      };
      const state = {
        tab: 'items', loading: true, categoryFilter: 'all', itemKeyword: '', itemViewMode: readViewMode(), pendingOrder: null, savingOrder: false, items: [], categories: [], subcategories: [],
        settings: { pageTitle: '', subtitle: '', ownerText: '', themeColor: DEFAULT_THEME_COLOR, effectEnabled: true, effectType: 'sakura', commentEnabled: true, detailCommentEnabled: true, commentWidgetInstalled: false, commentWidgetActive: false, commentWidgetMessage: '', steamEnabled: false, steamInstalled: false, steamActive: false, steamMessage: '', heroGifEnabled: true, heroGifUrl: '/plugins/showcase/assets/static/gif.gif', visitorStatsEnabled: false, heroBackgroundEnabled: false, heroBackgroundType: 'image', heroBackgroundUrl: '', heroBackgroundOpacity: 28, heroBackgroundSaturation: 100, contentBackgroundEnabled: false, contentBackgroundType: 'image', contentBackgroundUrl: '', contentBackgroundOpacity: 18, contentBackgroundSaturation: 100, signatureEnabled: true, signatureText: 'Keep discovering beautiful stories', defaultItemPosition: 'end', commentType: 'halo', commentWidgetNextInstalled: false, commentWidgetNextActive: false, commentWidgetNextMessage: '', twikooEnvId: '', twikooJsUrl: 'https://cdn.staticfile.net/twikoo/1.6.40/twikoo.all.min.js', commentAnonymousEmail: false, tmdbApiKey: '' },
        itemDraft: null, categoryDraft: null, subcategoryDraft: null, templateDraft: null, templates: [], saving: false, confirmation: null, expandedGroups: readExpandedGroups(), pendingTemplateFieldScroll: false
      };

      const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
      const normalizeHex = (value) => {
        let color = String(value || '').trim();
        if (!color.startsWith('#')) color = `#${color}`;
        if (/^#[\da-f]{3}$/i.test(color)) color = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
        return /^#[\da-f]{6}$/i.test(color) ? color.toUpperCase() : null;
      };
      const hexToHsl = (hex) => {
        const color = normalizeHex(hex) || DEFAULT_THEME_COLOR;
        const r = parseInt(color.slice(1, 3), 16) / 255; const g = parseInt(color.slice(3, 5), 16) / 255; const b = parseInt(color.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min; let h = 0;
        if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
        if (h < 0) h += 360;
        const l = (max + min) / 2; const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
        return { h, s: s * 100, l: l * 100 };
      };
      const hslToHex = (hue, saturation, lightness) => {
        const h = ((Number(hue) % 360) + 360) % 360; const s = Math.max(0, Math.min(100, saturation)) / 100; const l = Math.max(0, Math.min(100, lightness)) / 100;
        const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs((h / 60) % 2 - 1)); const m = l - c / 2; let rgb;
        if (h < 60) rgb = [c, x, 0]; else if (h < 120) rgb = [x, c, 0]; else if (h < 180) rgb = [0, c, x]; else if (h < 240) rgb = [0, x, c]; else if (h < 300) rgb = [x, 0, c]; else rgb = [c, 0, x];
        return `#${rgb.map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
      };
      const notify = (type, message) => {
        const toast = window.HaloComponents?.Toast;
        if (toast?.[type]) toast[type](message); else console[type === 'error' ? 'error' : 'log'](message);
      };
      const errorMessage = (error) => error?.response?.data?.message || error?.message || '操作失败';
      const request = async (method, path, data) => (await window.axios({ method, url: API + path, data, timeout: 15000, headers: { Accept: 'application/json' } })).data;
      const reconcileExpandedGroups = () => {
        const groupCounts = new Map();
        state.items.forEach((item) => {
          const key = itemGroupKey(item);
          groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
        });
        let changed = false;
        state.expandedGroups.forEach((key) => {
          if ((groupCounts.get(key) || 0) <= 4) {
            state.expandedGroups.delete(key);
            changed = true;
          }
        });
        if (changed) persistExpandedGroups(state.expandedGroups);
      };

      async function load() {
        state.loading = true; state.saving = false; render();
        try {
          const [items, categories, subcategories, templates, settings] = await Promise.all([
            request('get', '/admin/items'), request('get', '/admin/categories'), request('get', '/admin/subcategories'), request('get', '/admin/templates'), request('get', '/settings')
          ]);
          state.items = items || []; state.categories = categories || []; state.subcategories = subcategories || []; state.templates = templates || []; state.settings = { ...state.settings, ...(settings || {}) };
          reconcileExpandedGroups();
        } catch (error) { notify('error', errorMessage(error)); }
        state.loading = false; render();
      }

      function layout() {
        return `<div class="sc-shell">
          <header class="sc-header"><div><p>SHOWCASE PLUGIN</p><h1>展示架</h1><span>管理动漫收藏、展示分类与 /movie 页面标题</span></div>
          <a class="sc-visit" href="/movie" target="_blank" rel="noopener">查看前台 <b>↗</b></a></header>
          <nav class="sc-tabs">
            <button data-tab="items" class="${state.tab === 'items' ? 'active' : ''}">展示内容 <i>${state.items.length}</i></button>
            <button data-tab="categories" class="${state.tab === 'categories' ? 'active' : ''}">分类管理 <i>${state.categories.length}</i></button>
            <button data-tab="templates" class="${state.tab === 'templates' ? 'active' : ''}">模板内容 <i>${state.templates.length}</i></button>
            <button data-tab="settings" class="${state.tab === 'settings' ? 'active' : ''}">页面设置</button>
            <button data-tab="admin-settings" class="${state.tab === 'admin-settings' ? 'active' : ''}">后台设置</button>
          </nav>
          <main>${state.loading ? loadingHtml() : contentHtml()}</main>
          ${itemModalHtml()}${categoryModalHtml()}${subcategoryModalHtml()}${templateModalHtml()}${templatePickerHtml()}${confirmationHtml()}${orderFloatingBarHtml()}
        </div>`;
      }

      function loadingHtml() { return '<div class="sc-loading"><i></i><i></i><i></i><span>正在整理展示架…</span></div>'; }
      function creationOrder(value) {
        const timestamp = value?.metadata?.creationTimestamp;
        const parsed = timestamp ? Date.parse(timestamp) : Number.MAX_SAFE_INTEGER;
        return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
      }
      function itemOrder(a, b) {
        const priority = Number(a?.spec?.priority || 0) - Number(b?.spec?.priority || 0);
        return priority || creationOrder(a) - creationOrder(b)
          || String(a?.metadata?.name || '').localeCompare(String(b?.metadata?.name || ''));
      }
      function itemGroupKey(item) {
        const spec = item?.spec || {};
        return String(spec.category || '__uncategorized__') + '::' + String(spec.subcategory || '__default__');
      }
      function orderedItemGroups() {
        const categoryOrder = new Map(state.categories.map((category, index) => [category.metadata.name, index]));
        const subcategoryOrder = new Map(state.subcategories.map((subcategory, index) => [subcategory.metadata.name, index]));
        const groups = new Map();
        state.items.forEach((item) => {
          const key = itemGroupKey(item);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        });
        return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
          const [categoryA, subcategoryA] = keyA.split('::');
          const [categoryB, subcategoryB] = keyB.split('::');
          return (categoryOrder.get(categoryA) ?? 9999) - (categoryOrder.get(categoryB) ?? 9999)
            || (subcategoryA === '__default__' ? -1 : subcategoryB === '__default__' ? 1 : 0)
            || (subcategoryOrder.get(subcategoryA) ?? 9999) - (subcategoryOrder.get(subcategoryB) ?? 9999);
        }).map(([key, items]) => ({ key, items: items.sort(itemOrder) }));
      }
      function nextItemPriority(category, subcategory) {
        const values = state.items.filter((item) => item.spec?.category === category
          && (item.spec?.subcategory || '') === (subcategory || ''))
          .map((item) => Number(item.spec?.priority) || 0);
        if (state.settings.defaultItemPosition === 'start') {
          return values.length ? Math.min(0, Math.min(...values)) - 1 : 0;
        }
        return values.length ? Math.max(...values) + 1 : 0;
      }
      function contentHtml() {
        if (state.tab === 'categories') return categoriesHtml();
        if (state.tab === 'templates') return templatesHtml();
        if (state.tab === 'settings') return settingsHtml() + mediaSettingsPanelHtml();
        if (state.tab === 'admin-settings') return adminSettingsHtml();
        return itemsHtml();
      }

      function itemsHtml() {
        const controls = canManage ? '<button class="sc-primary" data-action="new-item">＋ 添加展示内容</button>' : '';
        if (!state.items.length) return `<section class="sc-section"><div class="sc-section-head"><div><h2>展示内容</h2><p>优先从第一部喜欢的动漫开始吧。</p></div>${controls}</div><div class="sc-empty"><b>🌸</b><h3>展示架还是空的</h3><p>添加封面、简介和观看感受后，内容会立即出现在 /movie。</p></div></section>`;

        const categoryFilterHtml = () => {
          if (!state.categories.length) return '';
          const allBtn = `<button type="button" class="sc-filter-btn ${state.categoryFilter === 'all' ? 'active' : ''}" data-category-filter="all">全部 <i>${state.items.length}</i></button>`;
          const catBtns = state.categories.map((c) => {
            const count = state.items.filter((item) => item.spec?.category === c.metadata.name).length;
            return `<button type="button" class="sc-filter-btn ${state.categoryFilter === c.metadata.name ? 'active' : ''}" data-category-filter="${esc(c.metadata.name)}">${esc(c.spec?.icon || '🌸')} ${esc(c.spec?.displayName || '未命名')} <i>${count}</i></button>`;
          }).join('');
          return `<div class="sc-filter-bar">${allBtn}${catBtns}</div>`;
        };

        const viewSwitcherHtml = `<div class="sc-view-switcher">
          <button type="button" class="sc-view-btn ${state.itemViewMode === 'grid' ? 'active' : ''}" data-view-mode="grid" title="网格卡片视图">⊞ 卡片</button>
          <button type="button" class="sc-view-btn ${state.itemViewMode === 'list' ? 'active' : ''}" data-view-mode="list" title="紧凑列表视图（图片---标题）">☰ 列表</button>
        </div>`;

        const searchHtml = `<div class="sc-item-search"><input type="search" id="sc-item-search" class="sc-search-input" placeholder="🔍 搜索标题 / 简介 / 标签 / 状态" value="${esc(state.itemKeyword)}" autocomplete="off"></div>`;
        const toolbarHtml = `<div class="sc-toolbar">${categoryFilterHtml()}${searchHtml}${viewSwitcherHtml}</div>`;

        const cardHtml = (item) => {
          const s = item.spec || {}; const category = state.categories.find((c) => c.metadata.name === s.category);
          return `<article class="sc-card sc-draggable-card" draggable="false" data-item-name="${esc(item.metadata.name)}" data-group-key="${esc(itemGroupKey(item))}"><div class="sc-cover">${s.cover ? `<img draggable="false" src="${esc(s.cover)}" alt="">` : '<span>🌸</span>'}<em class="${s.published ? 'online' : ''}">${s.published ? '已发布' : '草稿'}</em></div>
            <div class="sc-card-body"><small>${esc(category?.spec?.icon || '🌸')} ${esc(category?.spec?.displayName || '未分类')}</small><h3 title="${esc(s.title)}">${esc(s.title || '未命名')}</h3><p>${esc(s.description || s.impression || '暂无简介')}</p>
            <footer><span>${Number(s.score) > 0 ? `评分 ${esc(s.score)}/10` : esc(s.status || '未标记')}</span>${canManage ? `<div><button data-action="edit-item" data-name="${esc(item.metadata.name)}">编辑</button><button class="danger" data-action="delete-item" data-name="${esc(item.metadata.name)}">删除</button></div>` : ''}</footer></div></article>`;
        };

        const compactRowHtml = (item) => {
          const s = item.spec || {}; const category = state.categories.find((c) => c.metadata.name === s.category);
          return `<article class="sc-compact-row sc-draggable-card" draggable="false" data-item-name="${esc(item.metadata.name)}" data-group-key="${esc(itemGroupKey(item))}"><div class="sc-compact-thumb">${s.cover ? `<img draggable="false" src="${esc(s.cover)}" alt="">` : '<span>🌸</span>'}</div>
            <div class="sc-compact-main"><div class="sc-compact-title-line"><h4 title="${esc(s.title)}">${esc(s.title || '未命名')}</h4><small class="sc-compact-category">${esc(category?.spec?.icon || '🌸')} ${esc(category?.spec?.displayName || '未分类')}</small></div><div class="sc-compact-tags">${(s.tags || []).slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>
            <div class="sc-compact-meta"><span class="sc-compact-status">${esc(s.status || '未标记')}</span>${Number(s.score) > 0 ? `<span class="sc-compact-score">★ ${esc(s.score)}/10</span>` : ''}<em class="${s.published ? 'online' : ''}">${s.published ? '已发布' : '草稿'}</em></div>
            ${canManage ? `<div class="sc-compact-actions"><button data-action="edit-item" data-name="${esc(item.metadata.name)}">编辑</button><button class="danger" data-action="delete-item" data-name="${esc(item.metadata.name)}">删除</button></div>` : ''}</article>`;
        };

        const isList = state.itemViewMode === 'list';
        const itemsContainerClass = isList ? 'sc-compact-list' : 'sc-card-grid';
        const itemRenderer = isList ? compactRowHtml : cardHtml;

        const renderedCategories = new Set();
        let allGroups = orderedItemGroups();
        if (state.categoryFilter !== 'all') {
          allGroups = allGroups.filter(({ key }) => {
            const [categoryName] = key.split('::');
            return categoryName === state.categoryFilter;
          });
        }
        if (state.itemKeyword) {
          const kw = state.itemKeyword;
          const matches = (item) => {
            const s = item.spec || {};
            const hay = [s.title, s.description, s.impression, s.status, ...(Array.isArray(s.tags) ? s.tags : [])]
              .filter(Boolean).join(' ').toLowerCase();
            return hay.includes(kw);
          };
          allGroups = allGroups
            .map(({ key, items }) => ({ key, items: items.filter(matches) }))
            .filter(({ items }) => items.length);
        }

        const sections = allGroups.length ? allGroups.map(({ key, items }) => {
          const [categoryName, subcategoryName] = key.split('::');
          const category = state.categories.find((item) => item.metadata.name === categoryName);
          const subcategory = state.subcategories.find((item) => item.metadata.name === subcategoryName);
          const isDefaultGroup = subcategoryName === '__default__';
          const categoryHeading = renderedCategories.has(categoryName) ? '' : `<div class="sc-category-group-heading"><h2><b>${esc(category?.spec?.icon || '🌸')}</b>${esc(category?.spec?.displayName || '未分类')}</h2></div>`;
          renderedCategories.add(categoryName);
          const headingIcon = isDefaultGroup ? '✦' : (subcategory?.spec?.icon || '✦');
          const headingName = isDefaultGroup ? '默认区域' : (subcategory?.spec?.displayName || '未命名');
          const expandable = items.length > 4;
          const expanded = state.expandedGroups.has(key);
          const isPending = state.pendingOrder && state.pendingOrder.groupKey === key;
          const orderTools = isPending
            ? `<div class="sc-pending-order-tools"><span class="sc-pending-badge">⚠️ 排序未保存</span><button type="button" class="sc-primary sc-btn-sm" data-action="save-order" ${state.savingOrder ? 'disabled' : ''}>${state.savingOrder ? '保存中…' : '💾 保存排序'}</button><button type="button" class="sc-secondary sc-btn-sm" data-action="cancel-order" ${state.savingOrder ? 'disabled' : ''}>取消</button></div>`
            : `<span>${items.length} 项${canManage ? ' · 长按左键拖动排序' : ''}</span>`;
          const toggle = expandable ? `<label class="sc-heart-toggle" title="${expanded ? '收起多余展示内容' : '展开全部展示内容'}"><input type="checkbox" data-group-key="${esc(key)}" ${expanded ? 'checked' : ''}><svg viewBox="0 0 33 23" fill="pink" aria-hidden="true"><path d="M23.5,0.5 C28.4705627,0.5 32.5,4.52943725 32.5,9.5 C32.5,16.9484448 21.46672,22.5 16.5,22.5 C11.53328,22.5 0.5,16.9484448 0.5,9.5 C0.5,4.52952206 4.52943725,0.5 9.5,0.5 C12.3277083,0.5 14.8508336,1.80407476 16.5007741,3.84362242 C18.1491664,1.80407476 20.6722917,0.5 23.5,0.5 Z"></path></svg></label>` : '';
          const visibleItems = expanded || !expandable ? items : items.slice(0, 4);
          return `<section class="sc-item-group ${isPending ? 'sc-has-pending-order' : ''}" data-group-key="${esc(key)}">${categoryHeading}<div class="sc-item-group-head subcategory-group"><h3><b>${esc(headingIcon)}</b>${esc(headingName)}</h3><div class="sc-item-group-tools">${orderTools}${toggle}</div></div><div class="${itemsContainerClass}">${visibleItems.map(itemRenderer).join('')}</div></section>`;
        }).join('') : `<div class="sc-empty"><b>🌸</b><h3>该分类下暂无展示内容</h3><p>点击上方“＋ 添加展示内容”开始添加吧。</p></div>`;
        return `<section class="sc-section"><div class="sc-section-head"><div><h2>展示内容</h2><p>按大分类和二级标题分组；同组卡片可拖动自定义排序。</p></div>${controls}</div>${toolbarHtml}${sections}</section>`;
      }

      function categoriesHtml() {
        const controls = canManage ? '<button class="sc-primary" data-action="new-category">＋ 新建分类</button>' : '';
          const rows = state.categories.map((category) => {
           const s = category.spec || {}; const count = state.items.filter((item) => item.spec?.category === category.metadata.name).length;
          const children = state.subcategories.filter((x) => x.spec?.category === category.metadata.name);
          const childHtml = children.length ? `<div class="sc-subcategory-list">${children.map((child) => `<span><b>${esc(child.spec.icon || '✦')}</b>${esc(child.spec.displayName)}${canManage ? `<button data-action="edit-subcategory" data-name="${esc(child.metadata.name)}">修改</button><button class="danger" data-action="delete-subcategory" data-name="${esc(child.metadata.name)}">删除</button>` : ''}</span>`).join('')}</div>` : '';
          return `<article class="sc-category"><b>${esc(s.icon || '🌸')}</b><div><h3>${esc(s.displayName || '未命名')}</h3><p>${esc(s.description || '暂无分类说明')}</p>${childHtml}</div><span>${count} 项 · ${s.visible ? '前台可见' : '已隐藏'}</span>${canManage ? `<div class="sc-row-actions"><button data-action="new-subcategory" data-name="${esc(category.metadata.name)}">＋二级标题</button><button data-action="edit-category" data-name="${esc(category.metadata.name)}">修改</button><button class="danger" data-action="delete-category" data-name="${esc(category.metadata.name)}">删除</button></div>` : ''}</article>`;
        }).join('');
        return `<section class="sc-section"><div class="sc-section-head"><div><h2>分类管理</h2><p>可以建立“动漫 / 影视 / 书籍”等分类，也可以完全自定义。</p></div>${controls}</div><div class="sc-category-list">${rows}</div></section>`;
      }

      function mediaSettingsHtml(prefix, title, description) {
        const s = state.settings || {};
        const enabled = s[`${prefix}BackgroundEnabled`] === true;
        const type = s[`${prefix}BackgroundType`] === 'video' ? 'video' : 'image';
        const url = s[`${prefix}BackgroundUrl`] || '';
        const opacity = Number(s[`${prefix}BackgroundOpacity`] ?? (prefix === 'hero' ? 28 : 18));
        const saturation = Number(s[`${prefix}BackgroundSaturation`] ?? 100);
        const preview = url
          ? (type === 'video' ? `<video src="${esc(url)}" muted loop playsinline></video>` : `<img src="${esc(url)}" alt="背景预览">`)
          : '<span>暂无背景</span>';
        return `<div class="sc-media-settings"><div class="sc-media-head"><div><strong>${title}</strong><small>${description}</small></div><label class="sc-effect-switch"><input name="${prefix}BackgroundEnabled" type="checkbox" ${enabled ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${enabled ? '已开启' : '已关闭'}</span></label></div><div class="sc-media-grid"><div class="sc-media-preview">${preview}</div><div class="sc-media-fields"><div class="sc-two"><label><span>背景类型</span><select name="${prefix}BackgroundType" ${canManage ? '' : 'disabled'}><option value="image" ${type === 'image' ? 'selected' : ''}>图片</option><option value="video" ${type === 'video' ? 'selected' : ''}>MP4 视频</option></select></label><label><span>背景地址</span><input name="${prefix}BackgroundUrl" value="${esc(url)}" maxlength="2000" placeholder="附件地址或 URL" ${canManage ? '' : 'disabled'}></label></div><div class="sc-media-actions"><button type="button" class="sc-upload" data-action="select-${prefix}-background" ${canManage ? '' : 'disabled'}>从 Halo 附件库选择</button></div><div class="sc-media-range"><label><span>透明度 <output>${opacity}%</output></span><input name="${prefix}BackgroundOpacity" type="range" min="0" max="100" value="${opacity}" ${canManage ? '' : 'disabled'}></label><label><span>饱和度 <output>${saturation}%</output></span><input name="${prefix}BackgroundSaturation" type="range" min="0" max="100" value="${saturation}" ${canManage ? '' : 'disabled'}></label></div></div></div></div>`;
      }

      function mediaSettingsPanelHtml() {
        return `<section class="sc-section sc-settings sc-media-panel"><div class="sc-section-head"><div><h2>背景媒体设置</h2><p>分别控制顶部展示架和展示内容区域的图片或 MP4 视频背景。</p></div></div><form id="sc-media-settings-form">${mediaSettingsHtml('hero', '顶部展示架背景', '为顶部展示架区域选择图片或 MP4 视频背景，可调节透明度和饱和度。')}${mediaSettingsHtml('content', '展示内容区域背景', '为分类、卡片和评论所在区域选择图片或 MP4 视频背景。')}${canManage ? '<button class="sc-primary" type="submit">保存背景设置</button>' : ''}</form></section>`;
      }

      function settingsHtml() {
        const s = state.settings || {};
        const themeColor = normalizeHex(s.themeColor) || DEFAULT_THEME_COLOR; const hue = Math.round(hexToHsl(themeColor).h);
        const effectEnabled = s.effectEnabled !== false; const effectType = s.effectType === 'stars' ? 'stars' : 'sakura';
        const commentType = ['halo', 'twikoo', 'haloNext'].includes(s.commentType) ? s.commentType : 'halo';
        const usingNext = commentType === 'haloNext';
        const nextInstalled = s.commentWidgetNextInstalled === true;
        const nextActive = s.commentWidgetNextActive === true;
        const nextMessage = s.commentWidgetNextMessage || '';
        const legacyInstalled = s.commentWidgetInstalled === true;
        const legacyActive = s.commentWidgetActive === true;
        const legacyMessage = s.commentWidgetMessage || '';
        // Pick the matching component's status so the badge always reflects the
        // plugin the admin actually selected. Twikoo skips this branch entirely
        // because its own plugin status is unrelated to these flags.
        const statusPair = usingNext
          ? { active: nextActive, installed: nextInstalled, message: nextMessage, label: '评论组件 Next' }
          : { active: legacyActive, installed: legacyInstalled, message: legacyMessage, label: 'Halo 官方评论组件' };
        const commentStatusClass = commentType === 'twikoo' ? '' : (statusPair.active ? 'connected' : statusPair.installed ? 'inactive' : 'missing');
        const commentStatusText = commentType === 'twikoo' ? 'Twikoo' : (statusPair.active ? '已连接' : statusPair.installed ? '未启用' : '未安装');
        const steamStatusClass = s.steamActive ? 'connected' : s.steamInstalled ? 'inactive' : 'missing';
        const steamStatusText = s.steamActive ? '已连接' : s.steamInstalled ? '未启用' : '未安装';
        const heroGifEnabled = s.heroGifEnabled !== false;
        const heroGifUrl = s.heroGifUrl || '/plugins/showcase/assets/static/gif.gif';
        return `<section class="sc-section sc-settings"><div class="sc-section-head"><div><h2>页面设置</h2><p>这些文字和主题颜色会应用到公开的 /movie 页面。</p></div></div>
          <form id="sc-settings-form"><label><span>页面主标题</span><input name="pageTitle" maxlength="80" value="${esc(s.pageTitle)}" ${canManage ? '' : 'disabled'} required></label>
          <label><span>页面副标题</span><textarea name="subtitle" maxlength="180" rows="3" ${canManage ? '' : 'disabled'}>${esc(s.subtitle)}</textarea></label>
           <label><span>统计区小句子</span><input name="ownerText" maxlength="180" value="${esc(s.ownerText)}" ${canManage ? '' : 'disabled'}></label>
           <div class="sc-signature-settings"><div><strong>英文个性签名</strong><small>显示在展示页面右下方，并使用 SVG 路径绘制动画。</small></div><label class="sc-effect-switch"><input name="signatureEnabled" type="checkbox" ${s.signatureEnabled !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${s.signatureEnabled !== false ? '已开启' : '已关闭'}</span></label><label><span>签名文字</span><input name="signatureText" maxlength="240" value="${esc(s.signatureText || 'Keep discovering beautiful stories')}" ${canManage ? '' : 'disabled'}></label></div>
          <div class="sc-theme-color" style="--sc-selected-color:${themeColor}"><div class="sc-color-preview"><span>前台整体主题色</span><strong>${themeColor}</strong><small>标题点缀、按钮、背景和卡片会自动生成协调配色</small></div><div class="sc-color-fields">
          <label class="sc-color-picker"><span>颜色选择器</span><input id="sc-theme-picker" type="color" value="${themeColor}" ${canManage ? '' : 'disabled'}></label>
          <label class="sc-hue-range"><span>色相滑块 <output id="sc-theme-hue-output">${hue}°</output></span><input id="sc-theme-hue" type="range" min="0" max="359" step="1" value="${hue}" ${canManage ? '' : 'disabled'}></label>
          <label><span>十六进制颜色码</span><input id="sc-theme-hex" name="themeColor" value="${themeColor}" maxlength="7" pattern="#[0-9A-Fa-f]{6}" placeholder="#E96F9D" ${canManage ? '' : 'disabled'} required></label>
          ${canManage ? '<button id="sc-reset-theme-color" class="sc-color-reset" type="button">恢复默认樱花粉</button>' : ''}</div></div>
          <div class="sc-effect-settings"><div class="sc-effect-head"><div><strong>页面背景动效</strong><small>选择一种全页面装饰动效，也可以完全关闭。</small></div><label class="sc-effect-switch"><input name="effectEnabled" type="checkbox" ${effectEnabled ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${effectEnabled ? '已开启' : '已关闭'}</span></label></div>
          <div class="sc-effect-options"><label class="${effectType === 'sakura' ? 'selected' : ''}"><input name="effectType" type="radio" value="sakura" ${effectType === 'sakura' ? 'checked' : ''} ${canManage ? '' : 'disabled'}><b>🌸 樱花飘落</b><small>柔和花瓣从页面上方缓慢飘落</small></label><label class="${effectType === 'stars' ? 'selected' : ''}"><input name="effectType" type="radio" value="stars" ${effectType === 'stars' ? 'checked' : ''} ${canManage ? '' : 'disabled'}><b>✦ 繁星点点</b><small>大小星光在页面背景中交替闪烁</small></label></div></div>
          <div class="sc-hero-gif-settings"><div class="sc-hero-gif-preview">${heroGifEnabled && heroGifUrl ? `<img src="${esc(heroGifUrl)}" alt="头图区动图预览">` : '<span>GIF</span>'}</div><div class="sc-hero-gif-copy"><div><strong>头图区 GIF 动图</strong><small>显示在 /movie 顶部标题左侧红框位置，可单独开启或关闭。</small></div><div class="sc-hero-gif-actions"><button type="button" class="sc-upload" data-action="select-hero-gif" ${canManage ? '' : 'disabled'}>从 Halo 附件库选择 GIF</button><label class="sc-inline-url"><span>或填写 GIF URL</span><input id="sc-hero-gif-url" name="heroGifUrl" value="${esc(heroGifUrl)}" maxlength="2000" placeholder="https://…" ${canManage ? '' : 'disabled'}></label></div></div><label class="sc-effect-switch"><input name="heroGifEnabled" type="checkbox" ${heroGifEnabled ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${heroGifEnabled ? '已开启' : '已关闭'}</span></label></div>
          <div class="sc-comment-settings ${commentStatusClass}">
            <div class="sc-comment-icon" aria-hidden="true"><img src="/plugins/showcase/assets/static/评论组件图标.png?v=1.2.3" alt=""></div>
            <div class="sc-comment-copy">
              <div><strong>页面评论区</strong><em>${commentStatusText}</em></div>
              <small>可选用 Halo 官方“评论组件”（含 Next 版本）或外部部署的 Twikoo 评论系统。</small>
              <div class="sc-comment-data-hint"><strong>数据说明</strong> Halo 官方评论组件与评论组件 Next 共用 Halo 原生评论数据。切换两种组件只会改变前端展示样式和编辑功能，不会拆分评论、重复存储或丢失已有评论。</div>
              <div class="sc-comment-type-box">
                <label><span>评论系统类型</span>
                  <select name="commentType" id="sc-comment-type" ${canManage ? '' : 'disabled'}>
                    <option value="halo" ${commentType === 'halo' ? 'selected' : ''}>Halo 评论组件 (PluginCommentWidget)</option>
                    <option value="haloNext" ${commentType === 'haloNext' ? 'selected' : ''}>评论组件 Next (PluginCommentNext)</option>
                    <option value="twikoo" ${commentType === 'twikoo' ? 'selected' : ''}>Twikoo 评论系统 (支持 Vercel / 云开发自建)</option>
                  </select>
                </label>
              </div>
              <div class="sc-twikoo-fields" id="sc-twikoo-fields" ${commentType === 'twikoo' ? '' : 'hidden'}>
                <label><span>Twikoo 环境 ID (envId) *</span>
                  <input name="twikooEnvId" value="${esc(s.twikooEnvId || '')}" placeholder="例如：https://twikoo.example.com 或腾讯云环境 ID" maxlength="500" ${canManage ? '' : 'disabled'}>
                  <small class="sc-field-help">填写 Twikoo 服务的 Vercel 地址、自建服务 URL 或腾讯云环境 ID。</small>
                </label>
                <label><span>Twikoo 客户端 JS 地址（选填）</span>
                  <input name="twikooJsUrl" value="${esc(s.twikooJsUrl || '')}" placeholder="留空使用默认地址，例如：https://cdn.jsdelivr.net/npm/twikoo@1.6.44/dist/twikoo.all.min.js" maxlength="2000" ${canManage ? '' : 'disabled'}>
                  <small class="sc-field-help">当 Twikoo 云函数升级到新版本时，可在此填入匹配的 JS 脚本地址；留空则使用默认版本。</small>
                </label>
              </div>
              <div class="sc-comment-anon-box">
                <label class="sc-effect-switch">
                  <input name="commentAnonymousEmail" type="checkbox" ${s.commentAnonymousEmail === true ? 'checked' : ''} ${canManage ? '' : 'disabled'}>
                  <span>允许匿名邮箱评论 · ${s.commentAnonymousEmail === true ? '已开启' : '已关闭'}</span>
                </label>
                <small>开启后，访客发表评论时无需必须输入真实邮箱，若留空将自动生成匿名邮箱。</small>
              </div>
              <p ${commentType === 'twikoo' ? 'hidden' : ''}>${esc(statusPair.message || `正在检查 ${statusPair.label} 状态…`)}</p>
              <div class="sc-comment-switches">
                <label class="sc-effect-switch"><input name="commentEnabled" type="checkbox" ${s.commentEnabled !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>页面底部评论 · ${s.commentEnabled !== false ? '已开启' : '已关闭'}</span></label>
                <small>控制 /movie 页面最下方的公共评论区。</small>
                <label class="sc-effect-switch"><input name="detailCommentEnabled" type="checkbox" ${s.detailCommentEnabled !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>作品详情评论 · ${s.detailCommentEnabled !== false ? '已开启' : '已关闭'}</span></label>
                <small>控制点击作品卡片后，详情右侧底部的独立评论区；每个作品分别保存评论。</small>
              </div>
            </div>
          </div>
          <div class="sc-visitor-stats-settings"><div><strong>访客统计</strong><small>在页脚上方显示今日访客、今日访问、总访客和总访问数量。统计数据由展示架独立保存。</small></div><label class="sc-effect-switch"><input name="visitorStatsEnabled" type="checkbox" ${s.visitorStatsEnabled === true ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${s.visitorStatsEnabled === true ? '已开启' : '已关闭'}</span></label></div>
          ${commentType !== 'twikoo' && !statusPair.active ? `<div class="sc-comment-notice">请先在 Halo 插件管理中安装并启用 <b>${statusPair.label}</b> 插件。展示架评论开关不会修改 Halo 全站评论配置。</div>` : ''}
          <div class="sc-steam-settings ${steamStatusClass}"><div class="sc-steam-icon" aria-hidden="true"><img src="/plugins/showcase/assets/static/logo.png" alt=""></div><div class="sc-steam-copy"><div><strong>Steam 游戏联动</strong><em>${steamStatusText}</em></div><small>开启后，/movie 会自动增加“游戏”分类，并读取“Steam 信息展示”插件中的游戏资料。</small><p>${esc(s.steamMessage || '正在检查 Steam 信息展示插件状态…')}</p></div><label class="sc-effect-switch"><input name="steamEnabled" type="checkbox" ${s.steamEnabled === true ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${s.steamEnabled === true ? '已开启' : '已关闭'}</span></label></div>
          ${!s.steamActive ? '<div class="sc-steam-notice">请先在 Halo 插件管理中安装并启用 <b>Steam 信息展示</b> 插件。即使提前打开联动，前台也只会显示缺少插件的提示，不会影响其他分类。</div>' : ''}
          ${canManage ? '<button class="sc-primary" type="submit">保存页面设置</button>' : ''}</form></section>`;
      }

      function adminSettingsHtml() {
        const s = state.settings;
        const position = s.defaultItemPosition === 'start' ? 'start' : 'end';
        return `<section class="sc-section sc-settings"><div class="sc-section-head"><div><h2>后台设置</h2><p>控制展示架后台管理与内容添加时的默认行为。</p></div></div>
          <form id="sc-admin-settings-form">
            <div class="sc-effect-settings">
              <div class="sc-effect-head">
                <div>
                  <strong>新增展示内容默认位置</strong>
                  <small>在后台新建展示内容时，默认存放到展示列表的开头或是末尾。</small>
                </div>
              </div>
              <div class="sc-effect-options sc-position-options">
                <label class="${position === 'start' ? 'selected' : ''}">
                  <input name="defaultItemPosition" type="radio" value="start" ${position === 'start' ? 'checked' : ''} ${canManage ? '' : 'disabled'}>
                  <b>⬆ 存放到开头</b>
                  <small>新添加的内容排在第一位（排序值置顶），便于查看和更新观看状态</small>
                </label>
                <label class="${position === 'end' ? 'selected' : ''}">
                  <input name="defaultItemPosition" type="radio" value="end" ${position === 'end' ? 'checked' : ''} ${canManage ? '' : 'disabled'}>
                  <b>⬇ 存放到末尾</b>
                  <small>新添加的内容按顺序追加到最末端（默认行为）</small>
                </label>
              </div>
            </div>
            <div class="sc-effect-settings">
              <div class="sc-effect-head">
                <div>
                  <strong>TMDB API Key</strong>
                  <small>用于内容编辑弹窗中的 TMDB 链接解析。到 themoviedb.org 账号设置的 API 页面申请（v3 auth 的 API Key）。</small>
                </div>
              </div>
              <label class="sc-tmdb-key-field"><span>API Key</span><input name="tmdbApiKey" type="text" maxlength="200" value="${esc(s.tmdbApiKey || '')}" placeholder="TMDB API Key（v3）" autocomplete="off" ${canManage ? '' : 'disabled'}></label>
            </div>
            ${canManage ? '<button class="sc-primary" type="submit">保存后台设置</button>' : ''}
          </form>
        </section>`;
      }

      function itemModalHtml() {
        if (!state.itemDraft) return '';
        const d = state.itemDraft; const categoryOptions = state.categories.map((category) => `<option value="${esc(category.metadata.name)}" ${d.category === category.metadata.name ? 'selected' : ''}>${esc(category.spec.icon || '')} ${esc(category.spec.displayName)}</option>`).join(''); const subcategoryOptions = state.subcategories.filter((x) => x.spec?.category === d.category).map((x) => `<option value="${esc(x.metadata.name)}" ${d.subcategory === x.metadata.name ? 'selected' : ''}>${esc(x.spec.icon || '✦')} ${esc(x.spec.displayName)}</option>`).join('');
        // Decide whether the current item belongs to the standard (动漫影视) template.
        // The Bangumi "one-click fill" importer is only relevant for 动漫影视 items, so we
        // suppress it for other templates to avoid confusion.
        const currentCategory = state.categories.find((item) => item.metadata.name === d.category);
        const effectiveTemplateName = d.template || (currentCategory && currentCategory.spec && currentCategory.spec.template) || '';
        const isStandardTemplate = !effectiveTemplateName || effectiveTemplateName === 'standard' || effectiveTemplateName === 'preset-standard';
        const bgmImporterHtml = isStandardTemplate ? `<div class="sc-bgm-importer"><label><span>解析 Bangumi (bgm.tv)</span><div class="sc-bgm-row"><input id="sc-bgm-url" type="text" placeholder="链接或 ID，如 https://bgm.tv/subject/…" autocomplete="off"><button type="button" class="sc-bgm-btn" data-action="parse-bgm">一键填入</button></div></label><small class="sc-field-help">粘贴条目链接或数字 ID，一键自动填入封面、标题、评分、简介及标签。</small></div>` : '';
        const tmdbImporterHtml = isStandardTemplate ? `<div class="sc-bgm-importer sc-tmdb-importer"><label><span>解析 TMDB (themoviedb.org)</span><div class="sc-bgm-row"><input id="sc-tmdb-url" type="text" placeholder="链接，如 https://www.themoviedb.org/movie/12345" autocomplete="off"><button type="button" class="sc-bgm-btn" data-action="parse-tmdb">一键填入</button></div></label><small class="sc-field-help">粘贴电影 (movie) 或剧集 (tv) 链接，一键填入封面、标题、评分、简介及标签。需先在“后台设置”填写 TMDB API Key。</small></div>` : '';
        return `<div class="sc-modal${attachmentSelectorOpen.value ? ' sc-modal-behind' : ''}" role="dialog" aria-modal="true" aria-label="${d._name ? '编辑展示内容' : '添加展示内容'}"><div class="sc-modal-card wide"><header><div><small>CONTENT EDITOR</small><h2>${d._name ? '编辑展示内容' : '添加展示内容'}</h2></div><button type="button" data-action="close-modal">×</button></header>
          <form id="sc-item-form"><input type="hidden" name="priority" value="${esc(d.priority ?? 0)}"><div class="sc-form-grid"><div class="sc-cover-editor"><div class="sc-preview">${d.cover ? `<img src="${esc(d.cover)}" alt="封面预览">` : '<span>🌸<small>封面预览</small></span>'}</div><div class="sc-cover-actions"><button type="button" class="sc-upload" data-action="select-cover">从 Halo 附件库选择</button>${d.cover ? '<button type="button" class="sc-clear-cover" data-action="clear-cover">清除封面</button>' : ''}</div><label><span>或粘贴封面 URL</span><input id="sc-cover-url" name="cover" value="${esc(d.cover)}" placeholder="https://…"></label>${bgmImporterHtml}${tmdbImporterHtml}</div>
          <div class="sc-fields"><label><span>标题 *</span><input name="title" maxlength="120" value="${esc(d.title)}" required autofocus></label><div class="sc-two"><label><span>分类 *</span><select name="category" required>${categoryOptions}</select></label><label><span>二级标题</span><select name="subcategory"><option value="">默认区域</option>${subcategoryOptions}</select></label></div><div class="sc-template-fields-host" data-template-host></div><label class="sc-likes-field"><span>点赞数量</span><input name="likes" type="number" min="0" max="2147483647" step="1" inputmode="numeric" value="${esc(d.likes || 0)}"><small class="sc-field-help">可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加。</small></label><div class="sc-standard-fields" data-standard-fields><div class="sc-two"><label><span>观看状态</span><input name="status" maxlength="30" value="${esc(d.status || '已看完')}"></label><label class="sc-score-field"><span>个人评分（0-10）</span><input class="sc-score-input" name="score" type="number" min="0" max="10" step="0.1" inputmode="decimal" value="${esc(d.score ?? 0)}" placeholder="例如：9.6"><small class="sc-field-help">支持输入一位小数，例如 9.6。</small></label></div>
          <label><span>作品简介</span><textarea name="description" rows="4" maxlength="3000">${esc(d.description)}</textarea></label><label><span>观看后感受</span><textarea name="impression" rows="5" maxlength="5000" placeholder="记录触动你的台词、人物或片段…">${esc(d.impression)}</textarea></label>
          <label><span>观看链接（选填）</span><input name="watchUrl" type="url" maxlength="2000" value="${esc(d.watchUrl)}" placeholder="https://…"><small class="sc-field-help">填写后，详情中会显示“去观看”按钮；留空则不显示该按钮。</small></label><label><span>其他链接（选填）</span><input name="externalUrl" type="url" maxlength="2000" value="${esc(d.externalUrl || '')}" placeholder="https://…"><small class="sc-field-help">填写后，详情中显示一个受主题色控制的“打开其他链接”卡片。</small></label><label><span>封面标签（可选）</span><input name="tags" maxlength="180" value="${esc((d.tags || []).slice(0, 6).join(', '))}" placeholder="例如：治愈、校园、恋爱"><small class="sc-field-help">多个标签用逗号分隔，最多填写 6 个。默认和大尺寸每行显示 3 个；电脑端六列只显示最前面 2 个且每行 1 个，手机端六列不显示封面标签。</small></label></div><label class="sc-check"><input name="published" type="checkbox" ${d.published !== false ? 'checked' : ''}><span>发布到前台 /movie</span></label></div></div>
          <footer><button type="button" class="sc-secondary" data-action="close-modal">取消</button><button type="submit" class="sc-primary" ${state.saving ? 'disabled' : ''}>${state.saving ? '保存中…' : '保存内容'}</button></footer></form></div></div>`;
      }

      function categoryModalHtml() {
        if (!state.categoryDraft) return '';
        const d = state.categoryDraft;
        return `<div class="sc-modal" role="dialog" aria-modal="true" aria-label="编辑分类"><div class="sc-modal-card"><header><div><small>CATEGORY</small><h2>${d._name ? '修改分类' : '新建分类'}</h2></div><button type="button" data-action="close-modal">×</button></header>
          <form id="sc-category-form"><label><span>分类标题 *</span><input name="displayName" maxlength="50" value="${esc(d.displayName)}" required autofocus></label><label><span>图标（Emoji）</span><input name="icon" maxlength="12" value="${esc(d.icon || '🌸')}"></label><label><span>分类说明</span><textarea name="description" rows="3" maxlength="200">${esc(d.description)}</textarea></label><label><span>排序值</span><input name="priority" type="number" value="${esc(d.priority || 0)}"></label><label class="sc-check"><input name="visible" type="checkbox" ${d.visible !== false ? 'checked' : ''}><span>在前台显示此分类</span></label>
          <footer><button type="button" class="sc-secondary" data-action="close-modal">取消</button><button type="submit" class="sc-primary" ${state.saving ? 'disabled' : ''}>保存分类</button></footer></form></div></div>`;
      }

      function subcategoryModalHtml() {
        if (!state.subcategoryDraft) return '';
        const d = state.subcategoryDraft;
        const options = state.categories.map((category) => `<option value="${esc(category.metadata.name)}" ${d.category === category.metadata.name ? 'selected' : ''}>${esc(category.spec.icon || '')} ${esc(category.spec.displayName)}</option>`).join('');
        return `<div class="sc-modal" role="dialog" aria-modal="true"><div class="sc-modal-card"><header><div><small>SUBCATEGORY</small><h2>${d._name ? '修改二级标题' : '新建二级标题'}</h2></div><button type="button" data-action="close-modal">×</button></header><form id="sc-subcategory-form"><label><span>所属分类 *</span><select name="category" required>${options}</select></label><label><span>二级标题 *</span><input name="displayName" maxlength="80" value="${esc(d.displayName || '')}" required autofocus></label><label><span>图标</span><input name="icon" maxlength="12" value="${esc(d.icon || '✦')}"></label><label><span>说明</span><textarea name="description" rows="3" maxlength="300">${esc(d.description || '')}</textarea></label><label><span>排序值</span><input name="priority" type="number" value="${esc(d.priority || 0)}"></label><label class="sc-check"><input name="visible" type="checkbox" ${d.visible !== false ? 'checked' : ''}><span>在前台显示</span></label><footer><button type="button" class="sc-secondary" data-action="close-modal">取消</button><button type="submit" class="sc-primary">保存二级标题</button></footer></form></div></div>`;
      }

      function templatesHtml() {
        const sortedTemplates = state.templates.slice().sort((left, right) => {
          const leftPreset = left.metadata.name.startsWith('preset-');
          const rightPreset = right.metadata.name.startsWith('preset-');
          if (leftPreset !== rightPreset) return leftPreset ? -1 : 1;
          if (left.metadata.name === 'preset-standard') return -1;
          if (right.metadata.name === 'preset-standard') return 1;
          return String(left.spec?.displayName || '').localeCompare(String(right.spec?.displayName || ''), 'zh-CN');
        });
        const cards = sortedTemplates.map((template) => { const s = template.spec || {}; const isPreset = template.metadata.name.startsWith('preset-'); const fieldCount = (s.fields || []).length; const tag = isPreset ? '内置' : '自定义'; return `<article class="sc-template-card${isPreset ? ' is-preset' : ' is-custom'}"><div class="sc-template-icon">${esc(s.icon || '✨')}</div><div><h3>${esc(s.displayName || '未命名模板')}</h3><p>${esc(s.description || '暂无说明')}</p><small><span class="sc-template-tag is-${isPreset ? 'preset' : 'custom'}">${tag}</span> · ${fieldCount} 个字段</small></div>${canManage ? `<div class="sc-row-actions"><button data-action="edit-template" data-name="${esc(template.metadata.name)}">编辑</button><button class="danger" data-action="delete-template" data-name="${esc(template.metadata.name)}">删除</button></div>` : ''}</article>`; }).join('');
        const presetCount = sortedTemplates.filter((t) => t.metadata.name.startsWith('preset-')).length;
        return `<section class="sc-section"><div class="sc-section-head"><div><h2>模板内容</h2><p>共 ${state.templates.length} 个模板，其中 ${presetCount} 个内置预设（含动漫影视）。新建自定义模板后，再到分类管理中绑定。</p></div>${canManage ? '<div class="sc-template-head-actions"><button class="sc-secondary" data-action="reset-default-templates">重新加载默认模板</button><button class="sc-primary" data-action="new-template">＋ 新建模板</button></div>' : ''}</div><div class="sc-template-list">${cards || '<div class="sc-empty"><b>✨</b><h3>还没有模板</h3><p>点击“新建模板”或“重新加载默认模板”开始。</p></div>'}</div></section>`;
      }

      function templatePickerHtml() {
        if (!state.templateDraft || !state.templateDraft._picker) return '';
        const targetCategoryName = state.templateDraft._targetCategory;
        const targetCategory = state.categories.find((c) => c.metadata.name === targetCategoryName);
        const pickCard = (name, spec, options = {}) => {
          const isPreset = options.isPreset || String(name || '').startsWith('preset-') || name === 'standard';
          const fields = Array.isArray(spec && spec.fields) ? spec.fields : [];
          const preview = (options.preview || fields.map((field) => field && field.label).filter(Boolean)).slice(0, 4);
          const fieldCount = options.fieldCount != null ? options.fieldCount : fields.length;
          const extra = Math.max(0, fieldCount - preview.length);
          const description = String((spec && spec.description) || options.description || '暂无说明');
          const chips = preview.length
            ? preview.map((label) => `<span class="sc-template-pick-chip">${esc(label)}</span>`).join('') + (extra ? `<span class="sc-template-pick-chip is-more">+${extra}</span>` : '')
            : '<span class="sc-template-pick-chip is-empty">暂无字段</span>';
          const badge = isPreset ? '<span class="sc-template-pick-badge is-builtin">内置</span>' : '<span class="sc-template-pick-badge is-custom">自定义</span>';
          const kindClass = name === 'standard' || name === 'preset-standard' ? ' is-standard' : (isPreset ? ' is-preset' : ' is-custom');
          return `<button type="button" class="sc-template-pick-card${kindClass}" data-action="pick-template" data-name="${esc(name)}"><div class="sc-template-pick-top"><div class="sc-template-pick-icon">${esc((spec && spec.icon) || options.icon || '✨')}</div><div class="sc-template-pick-heading"><h3>${esc((spec && spec.displayName) || options.displayName || '未命名模板')}</h3>${badge}</div></div><p class="sc-template-pick-desc">${esc(description)}</p><div class="sc-template-pick-fields">${chips}</div><div class="sc-template-pick-meta">${fieldCount} 个字段</div></button>`;
        };
        const standardTemplate = state.templates.find((t) => t.metadata.name === 'preset-standard');
        const standardSpec = standardTemplate ? standardTemplate.spec : {
          displayName: '动漫影视',
          icon: '🎬',
          description: '完整的动漫影视字段：观看状态、评分、观看链接等',
          fields: [{ label: '观看状态' }, { label: '个人评分' }, { label: '观看链接' }, { label: '封面标签' }]
        };
        const standardCard = pickCard('standard', standardSpec, { isPreset: true, fieldCount: (standardSpec.fields || []).length || 12, icon: '🎬', displayName: '动漫影视' });
        const sortedTemplates = state.templates
          .filter((template) => template.metadata.name !== 'preset-standard')
          .slice()
          .sort((left, right) => {
            const leftPreset = left.metadata.name.startsWith('preset-');
            const rightPreset = right.metadata.name.startsWith('preset-');
            if (leftPreset !== rightPreset) return leftPreset ? -1 : 1;
            return String(left.spec?.displayName || '').localeCompare(String(right.spec?.displayName || ''), 'zh-CN');
          });
        const userCards = sortedTemplates.map((template) => pickCard(template.metadata.name, template.spec || {}, {
          isPreset: template.metadata.name.startsWith('preset-')
        })).join('');
        const targetLabel = targetCategory ? `${targetCategory.spec.icon || '📁'} ${esc(targetCategory.spec.displayName)}` : '未选择';
        const presetCount = sortedTemplates.filter((t) => t.metadata.name.startsWith('preset-')).length + 1;
        return `<div class="sc-modal sc-template-picker" role="dialog" aria-modal="true" aria-label="选择内容模板"><div class="sc-modal-card wide sc-picker-card"><header><div><small>CHOOSE TEMPLATE</small><h2>选择内容模板</h2></div><button type="button" data-action="close-modal">×</button></header><p class="sc-picker-hint">这个分类还没有绑定专用模板。选一个后，本次新建会按对应字段填写；之后也可以在分类设置里改。当前分类：<b>${targetLabel}</b></p><div class="sc-template-picker-grid">${standardCard}${userCards}</div><footer><div class="sc-template-picker-foot"><small>共 ${state.templates.length} 个模板，其中 ${presetCount} 个内置预设</small><button type="button" class="sc-secondary" data-action="close-modal">取消</button></div></footer></div></div>`;
      }

      function templateModalHtml() {
        if (!state.templateDraft) return ''; const d = state.templateDraft;
        const rows = (d.fields || []).map((field, index) => { const isBuiltin = !!field.builtin; const isCore = !!field.core; const removeAttr = isBuiltin ? 'disabled title="内置字段不可删除"' : `data-template-remove="${index}"`; const badge = isBuiltin ? '<span class="sc-template-builtin-badge">内置</span>' : (isCore ? '<span class="sc-template-core-badge">前端核心</span>' : ''); const wrapperClass = isBuiltin ? ' is-builtin' : (isCore ? ' is-core' : ''); return `<div class="sc-template-field${wrapperClass}"><input type="hidden" name="fieldKey" value="${esc(field.key)}"><input name="fieldLabel" maxlength="80" value="${esc(field.label)}" placeholder="字段名称" required>${badge}<select name="fieldType"><option value="text" ${field.type === 'text' ? 'selected' : ''}>单行文本</option><option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>多行文本</option><option value="number" ${field.type === 'number' ? 'selected' : ''}>数字</option><option value="url" ${field.type === 'url' ? 'selected' : ''}>网址</option><option value="date" ${field.type === 'date' ? 'selected' : ''}>日期</option><option value="image" ${field.type === 'image' ? 'selected' : ''}>图片</option><option value="tags" ${field.type === 'tags' ? 'selected' : ''}>标签</option></select><label><input type="checkbox" name="fieldRequired_${index}" ${field.required ? 'checked' : ''}>必填</label><label><input type="checkbox" name="fieldShowInCard_${index}" ${field.showInCard ? 'checked' : ''}>显示在卡片</label><button type="button" ${removeAttr}>删除</button><input class="sc-field-wide" name="fieldUnit" maxlength="20" value="${esc(field.unit || '')}" placeholder="单位（选填，如：元 / km）"><input class="sc-field-wide" name="fieldPlaceholder" maxlength="120" value="${esc(field.placeholder || '')}" placeholder="输入提示"><input class="sc-field-wide" name="fieldHelp" maxlength="200" value="${esc(field.helpText || '')}" placeholder="补充说明（选填）"></div>`; }).join('');
        return `<div class="sc-modal" role="dialog" aria-modal="true"><div class="sc-modal-card wide sc-template-modal"><header><div><small>CONTENT TEMPLATE</small><h2>${d._name ? '编辑模板' : '新建模板'}</h2></div><button type="button" data-action="close-modal">×</button></header><form id="sc-template-form"><div class="sc-two"><label><span>模板名称 *</span><input name="displayName" maxlength="50" value="${esc(d.displayName || '')}" required></label><label><span>模板图标</span><input name="icon" maxlength="12" value="${esc(d.icon || '✨')}"></label></div><label><span>模板说明</span><textarea name="description" rows="2" maxlength="200">${esc(d.description || '')}</textarea></label><label><span>快速预设</span><select name="templatePreset"><option value="">从空白开始</option><option value="food">美食探店</option><option value="travel">旅行景点</option><option value="general">通用展示</option></select></label><div class="sc-template-editor"><div class="sc-template-editor-head"><strong>填写字段</strong><button type="button" class="sc-secondary" data-template-add>＋ 添加字段</button></div><div class="sc-template-fields">${rows || '<p>点击“添加字段”开始配置。</p>'}</div></div><footer><button type="button" class="sc-secondary" data-action="close-modal">取消</button><button type="submit" class="sc-primary">保存模板</button></footer></form></div></div>`;
      }

      function orderFloatingBarHtml() {
        if (!state.pendingOrder) return '';
        return `<div class="sc-order-floating-bar"><div class="sc-order-floating-content"><span>⚠️ <b>已调整展示排序</b>，点击保存后生效</span><div class="sc-order-floating-actions"><button type="button" class="sc-secondary" data-action="cancel-order" ${state.savingOrder ? 'disabled' : ''}>放弃修改</button><button type="button" class="sc-primary" data-action="save-order" ${state.savingOrder ? 'disabled' : ''}>${state.savingOrder ? '保存中…' : '💾 保存排序'}</button></div></div></div>`;
      }

      function confirmationHtml() {
        const dialog = state.confirmation;
        if (!dialog) return '';
        return `<div class="sc-modal sc-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="sc-confirm-title"><div class="sc-modal-card sc-confirm-card"><div class="sc-confirm-icon">!</div><h2 id="sc-confirm-title">${esc(dialog.title)}</h2><p>${esc(dialog.message)}</p><footer><button type="button" class="sc-secondary" data-action="cancel-confirmation">取消</button><button type="button" class="sc-danger-button" data-action="confirm-delete">确认删除</button></footer></div></div>`;
      }

      function bind() {
        root.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { state.tab = button.dataset.tab; state.itemDraft = null; state.categoryDraft = null; render(); }));
        root.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => action(button.dataset.action, button.dataset.name)));
        root.querySelector('#sc-item-form')?.addEventListener('submit', saveItem);
        root.querySelector('#sc-category-form')?.addEventListener('submit', saveCategory);
        root.querySelector('#sc-subcategory-form')?.addEventListener('submit', saveSubcategory);
        const categoryForm = root.querySelector('#sc-category-form');
        if (categoryForm && state.categoryDraft) { const sortedTemplateOptions = state.templates.slice().sort((left, right) => { const leftPreset = left.metadata.name.startsWith('preset-'); const rightPreset = right.metadata.name.startsWith('preset-'); if (leftPreset !== rightPreset) return leftPreset ? -1 : 1; if (left.metadata.name === 'preset-standard') return -1; if (right.metadata.name === 'preset-standard') return 1; return String(left.spec?.displayName || '').localeCompare(String(right.spec?.displayName || ''), 'zh-CN'); }); const templateOptions = sortedTemplateOptions.map((template) => { const isPreset = template.metadata.name.startsWith('preset-'); const badge = isPreset ? ' · 内置' : ''; return `<option value="${esc(template.metadata.name)}">${esc(template.spec.icon || '✨')} ${esc(template.spec.displayName)}${badge}</option>`; }).join(''); categoryForm.insertAdjacentHTML('afterbegin', `<label><span>内容模板</span><select name="template">${templateOptions}</select><small class="sc-field-help">模板请在“模板内容”页面创建。分类切换模板后，列表里的内容字段会重新绑定。</small></label>`); categoryForm.querySelector('[name="template"]').value = state.categoryDraft.template || 'preset-standard'; }
        const templateForm = root.querySelector('#sc-template-form');
        const syncTemplate = () => { const data = new FormData(templateForm); const previousFields = (state.templateDraft && Array.isArray(state.templateDraft.fields)) ? state.templateDraft.fields : []; state.templateDraft = { ...state.templateDraft, displayName: data.get('displayName'), icon: data.get('icon'), description: data.get('description'), fields: data.getAll('fieldLabel').map((label,index) => { const key = data.getAll('fieldKey')[index] || `field_${Date.now()}_${index}`; const previous = previousFields.find((p) => p && p.key === key); return { key, label:String(label), type:data.getAll('fieldType')[index] || 'text', unit:String(data.getAll('fieldUnit')[index] || '').trim(), placeholder:String(data.getAll('fieldPlaceholder')[index] || ''), helpText:String(data.getAll('fieldHelp')[index] || ''), required:data.get(`fieldRequired_${index}`)==='on', showInCard:data.get(`fieldShowInCard_${index}`)==='on', builtin: !!(previous && previous.builtin), core: !!(previous && previous.core) }; }) }; };
        templateForm?.addEventListener('submit', saveTemplate);
        templateForm?.querySelector('[data-template-add]')?.addEventListener('click', () => { syncTemplate(); state.templateDraft.fields.push({key:`field_${Date.now()}`,label:'',type:'text'}); state.pendingTemplateFieldScroll = true; render(); });
        templateForm?.querySelectorAll('[data-template-remove]').forEach((button) => button.addEventListener('click', () => { syncTemplate(); state.templateDraft.fields.splice(Number(button.dataset.templateRemove),1); render(); }));
        templateForm?.querySelector('[name="templatePreset"]')?.addEventListener('change', (event) => { const presets={food:['人均价格','地址','推荐菜','营业时间','口味'],travel:['地点','门票','开放时间','推荐季节','交通方式'],general:['品牌','规格','价格','来源','相关信息']}; if(!presets[event.target.value])return; syncTemplate(); const presetFields = presets[event.target.value].map((label,index)=>({key:`${event.target.value}_${index+1}`,label,type:'text'})); const existingCore = (state.templateDraft.fields || []).filter((field) => field && field.core); const merged = existingCore.length ? existingCore.concat(presetFields) : presetFields; state.templateDraft.fields = merged; render(); });
        if (state.itemDraft) { const category=state.categories.find((item)=>item.metadata.name===state.itemDraft.category); const effectiveTemplateName = state.itemDraft.template || category?.spec?.template; const template=state.templates.find((item)=>item.metadata.name===effectiveTemplateName); const isStandardTemplate = !template || template.metadata.name === 'standard' || template.metadata.name === 'preset-standard'; const host =root.querySelector('[data-template-host]'); const standardGroup =root.querySelector('[data-standard-fields]'); if (isStandardTemplate) { if (host) host.replaceChildren(); if (standardGroup) standardGroup.hidden = false; } else { if (standardGroup) standardGroup.hidden = true; const fields = (template && template.spec && template.spec.fields) || []; if (host) { const heading = `<div class="sc-generated-heading"><b>${esc((template && template.spec && template.spec.icon) || '✨')} ${esc((template && template.spec && template.spec.displayName) || '模板专属字段')}</b><span>${esc((template && template.spec && template.spec.description) || '请填写模板专属内容')}</span></div>`; const fieldNodes = fields.filter((field) => field && field.key !== 'likes').map((field) => { const value = esc(state.itemDraft.customFields?.[field.key] || ''); const helpText = esc(field.helpText || ''); const unit = field.unit ? ` <em class="sc-field-unit">${esc(field.unit)}</em>` : ''; const required = field.required ? ' *' : ''; const placeholder = esc(field.placeholder || ''); const inputType = field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : field.type === 'image' ? 'url' : 'text'; let control = ''; if (field.type === 'textarea') { control = `<textarea name="custom_${esc(field.key)}" rows="3" placeholder="${placeholder}" ${field.required ? 'required' : ''}>${value}</textarea>`; } else if (field.type === 'image') { control = `<div class="sc-template-image-row"><input name="custom_${esc(field.key)}" type="url" value="${value}" placeholder="${placeholder}" ${field.required ? 'required' : ''}><button type="button" class="sc-secondary" data-template-image="${esc(field.key)}">从附件库选择</button>${value ? `<span class="sc-template-image-preview"><img src="${value}" alt=""></span>` : ''}</div>`; } else if (field.type === 'tags') { control = `<input name="custom_${esc(field.key)}" maxlength="180" value="${value}" placeholder="${placeholder}" ${field.required ? 'required' : ''}><small class="sc-field-help">多个标签用逗号分隔</small>`; } else { control = `<div class="sc-template-input-row"><input name="custom_${esc(field.key)}" type="${inputType}" value="${value}" placeholder="${placeholder}" ${field.required ? 'required' : ''}>${unit}</div>`; } return `<label class="sc-generated-field"><span>${esc(field.label)}${required}</span>${control}${helpText ? `<small class="sc-field-help">${helpText}</small>` : ''}</label>`; }).join(''); host.innerHTML = heading + fieldNodes; } } }
        if (state.itemDraft) { root.querySelectorAll('[data-template-image]').forEach((button) => button.addEventListener('click', () => { syncItemDraftFromForm(); attachmentSelectorTarget.value = `template-image:${button.dataset.templateImage}`; attachmentSelectorOpen.value = true; })); }
        bindDragSort();
        root.querySelectorAll('.sc-heart-toggle input').forEach((input) => input.addEventListener('change', () => {
          const key = input.dataset.groupKey;
          if (input.checked) state.expandedGroups.add(key); else state.expandedGroups.delete(key);
          persistExpandedGroups(state.expandedGroups);
          render();
          const nextInput = [...root.querySelectorAll('.sc-heart-toggle input')].find((candidate) => candidate.dataset.groupKey === key);
          const nextToggle = nextInput?.closest('.sc-heart-toggle');
          if (nextToggle) {
            nextToggle.classList.add(input.checked ? 'sc-heart-animate-on' : 'sc-heart-animate-off');
            window.setTimeout(() => nextToggle.classList.remove('sc-heart-animate-on', 'sc-heart-animate-off'), 420);
          }
        }));
        root.querySelector('#sc-settings-form')?.addEventListener('submit', saveSettings);
        root.querySelector('#sc-media-settings-form')?.addEventListener('submit', saveSettings);
        root.querySelectorAll('[data-category-filter]').forEach((button) => button.addEventListener('click', () => {
          state.categoryFilter = button.dataset.categoryFilter;
          render();
        }));
        root.querySelectorAll('[data-view-mode]').forEach((button) => button.addEventListener('click', () => {
          state.itemViewMode = button.dataset.viewMode;
          persistViewMode(button.dataset.viewMode);
          render();
        }));
        root.querySelector('#sc-item-search')?.addEventListener('input', (event) => {
          state.itemKeyword = String(event.target.value || '').trim().toLowerCase();
          render();
          const box = root.querySelector('#sc-item-search');
          if (box) { box.focus(); const end = box.value.length; box.setSelectionRange(end, end); }
        });
        root.querySelector('#sc-admin-settings-form')?.addEventListener('submit', saveAdminSettings);
        root.querySelectorAll('input[name="defaultItemPosition"]').forEach((input) => input.addEventListener('change', () => {
          root.querySelectorAll('.sc-position-options label').forEach((label) => label.classList.toggle('selected', label.contains(input)));
        }));
        bindThemeColorControls();
        bindEffectControls();
        bindCommentControls();
        bindSteamControls();
        bindHeroGifControls();
        bindVisitorStatsControls();
        bindMediaControls();
        root.querySelector('#sc-hero-gif-url')?.addEventListener('input', (event) => {
          state.settings.heroGifUrl = event.target.value;
          updateHeroGifPreview(event.target.value);
        });
        root.querySelector('#sc-cover-url')?.addEventListener('input', (event) => {
          if (state.itemDraft) state.itemDraft.cover = event.target.value;
          updateCoverPreview(event.target.value);
        });
        root.querySelector('#sc-bgm-url')?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            parseBgmSubject();
          }
        });
        root.querySelector('#sc-tmdb-url')?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            parseTmdbSubject();
          }
        });
        root.querySelector('#sc-item-form select[name="category"]')?.addEventListener('change', (event) => {
          if (!state.itemDraft) return;
          syncItemDraftFromForm();
          state.itemDraft.category = event.target.value;
          state.itemDraft.subcategory = '';
          render();
        });
      }

      function applyHaloButtonOverrides(scope) {
        const host = scope || root;
        if (!host || !host.querySelectorAll) return;
        host.querySelectorAll('.sc-primary').forEach((button) => {
          button.style.setProperty('background', 'transparent', 'important');
          button.style.setProperty('background-color', 'transparent', 'important');
          button.style.setProperty('background-image', 'none', 'important');
          button.style.setProperty('color', '#ffffff', 'important');
        });
        host.querySelectorAll('.sc-secondary').forEach((button) => {
          button.style.setProperty('background', 'transparent', 'important');
          button.style.setProperty('background-color', 'transparent', 'important');
          button.style.setProperty('background-image', 'none', 'important');
          button.style.setProperty('color', '#382932', 'important');
        });
        host.querySelectorAll('.sc-visit').forEach((link) => {
          link.style.setProperty('display', 'inline-flex', 'important');
          link.style.setProperty('align-items', 'center', 'important');
          link.style.setProperty('background', 'transparent', 'important');
          link.style.setProperty('background-color', 'transparent', 'important');
          link.style.setProperty('background-image', 'none', 'important');
          link.style.setProperty('color', '#ffffff', 'important');
          link.style.setProperty('opacity', '1', 'important');
          link.style.setProperty('visibility', 'visible', 'important');
        });
      }

      function scrollTemplateFieldIntoView() {
        if (!state.pendingTemplateFieldScroll) return;
        state.pendingTemplateFieldScroll = false;
        const fields = root.querySelectorAll('.sc-template-field');
        const lastField = fields[fields.length - 1];
        if (!lastField) return;
        const modalCard = lastField.closest('.sc-modal-card');
        const modal = lastField.closest('.sc-modal');
        const scroller = (modalCard && modalCard.scrollHeight > modalCard.clientHeight + 8)
          ? modalCard
          : ((modal && modal.scrollHeight > modal.clientHeight + 8) ? modal : null);
        requestAnimationFrame(() => {
          if (scroller) {
            const top = lastField.offsetTop - 18;
            scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
          } else {
            lastField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          const labelInput = lastField.querySelector('input[name="fieldLabel"]');
          if (labelInput) labelInput.focus({ preventScroll: true });
        });
      }

      function render() { if (!alive || !root) return; root.innerHTML = layout(); bind(); applyHaloButtonOverrides(root); scrollTemplateFieldIntoView(); }

      function bindDragSort() {
        if (!canManage) return;
        let drag = null;
        const finish = async () => {
          if (!drag) return;
          const current = drag;
          drag = null;
          if (current.placementTimer) clearTimeout(current.placementTimer);
          if (current.started && current.pendingNext !== undefined) {
            current.grid.insertBefore(current.placeholder, current.pendingNext || null);
          }
          try { current.card.releasePointerCapture(current.pointerId); } catch (_) {}
          current.proxy?.remove();
          current.placeholder?.replaceWith(current.card);
          current.card.classList.remove('sc-dragging');
          document.body.classList.remove('sc-pointer-sorting');
          window.removeEventListener('pointermove', current.move);
          window.removeEventListener('pointerup', current.up);
          window.removeEventListener('pointercancel', current.up);
          if (current.started) {
            const names = [...current.grid.querySelectorAll('.sc-draggable-card')].map((item) => item.dataset.itemName).filter(Boolean);
            const groupKey = current.group.dataset.groupKey;
            const groupItems = state.items.filter((item) => itemGroupKey(item) === groupKey);
            const byName = new Map(groupItems.map((item) => [item.metadata.name, item]));
            const ordered = names.map((name) => byName.get(name)).filter(Boolean);
            ordered.forEach((item, index) => { item.spec.priority = index; });
            state.pendingOrder = { groupKey, names };
            render();
          }
        };
        root.querySelectorAll('.sc-draggable-card').forEach((card) => {
          card.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || event.target.closest('button, a, input, textarea, select')) return;
            event.preventDefault();
            try { card.setPointerCapture(event.pointerId); } catch (_) {}
            const group = card.closest('.sc-item-group'); const gridElement = card.closest('.sc-card-grid, .sc-compact-list');
            if (!group || !gridElement) return;
            const startX = event.clientX; const startY = event.clientY;
            const move = (moveEvent) => {
              if (!drag || drag.card !== card) return;
              const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
              if (!drag.started && distance < 5) return;
              if (!drag.started) {
                drag.started = true; card.classList.add('sc-dragging'); document.body.classList.add('sc-pointer-sorting');
                const rect = card.getBoundingClientRect();
                const placeholder = document.createElement('div');
                placeholder.className = 'sc-drag-placeholder';
                placeholder.style.width = `${rect.width}px`; placeholder.style.height = `${rect.height}px`;
                const proxy = card.cloneNode(true);
                proxy.classList.add('sc-drag-proxy');
                proxy.style.width = `${rect.width}px`; proxy.style.height = `${rect.height}px`;
                proxy.style.left = `${moveEvent.clientX - drag.offsetX}px`; proxy.style.top = `${moveEvent.clientY - drag.offsetY}px`;
                proxy.setAttribute('aria-hidden', 'true');
                document.body.append(proxy);
                gridElement.replaceChild(placeholder, card);
                drag.placeholder = placeholder; drag.proxy = proxy;
              }
              moveEvent.preventDefault();
              if (drag.proxy) {
                drag.proxy.style.left = `${moveEvent.clientX - drag.offsetX}px`;
                drag.proxy.style.top = `${moveEvent.clientY - drag.offsetY}px`;
              }
              const siblings = [...gridElement.querySelectorAll('.sc-draggable-card')];
              const boxes = siblings.map((item) => ({ item, rect: item.getBoundingClientRect() }));
              const hovered = boxes.find(({ rect }) => moveEvent.clientX >= rect.left
                && moveEvent.clientX <= rect.right && moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom);
              let next = null;
              if (hovered) {
                // Decide by the horizontal center of the card under the pointer.
                // This keeps the behavior identical over the cover and white body areas.
                if (moveEvent.clientX < hovered.rect.left + hovered.rect.width / 2) {
                  next = hovered.item;
                } else {
                  const index = siblings.indexOf(hovered.item);
                  next = siblings[index + 1] || null;
                }
              } else {
                const nearest = boxes.slice().sort((left, right) => {
                  const lx = left.rect.left + left.rect.width / 2;
                  const ly = left.rect.top + left.rect.height / 2;
                  const rx = right.rect.left + right.rect.width / 2;
                  const ry = right.rect.top + right.rect.height / 2;
                  return Math.hypot(moveEvent.clientX - lx, moveEvent.clientY - ly)
                    - Math.hypot(moveEvent.clientX - rx, moveEvent.clientY - ry);
                })[0];
                if (nearest) next = moveEvent.clientX < nearest.rect.left + nearest.rect.width / 2 ? nearest.item : siblings[siblings.indexOf(nearest.item) + 1] || null;
              }
              const candidateKey = next?.dataset?.itemName || '__end__';
              if (candidateKey !== drag.placementKey) {
                drag.placementKey = candidateKey;
                drag.pendingNext = next || null;
                if (drag.placementTimer) clearTimeout(drag.placementTimer);
                const pendingNext = next || null;
                drag.placementTimer = window.setTimeout(() => {
                  if (!drag || !drag.started || drag.pendingNext !== pendingNext) return;
                  gridElement.insertBefore(drag.placeholder, pendingNext || null);
                }, 65);
              }
            };
            const up = () => finish();
            const cardRect = card.getBoundingClientRect();
            drag = { card, group, grid: gridElement, pointerId: event.pointerId, offsetX: event.clientX - cardRect.left, offsetY: event.clientY - cardRect.top, move, up, started: false, placeholder: null, proxy: null, placementKey: null, pendingNext: undefined, placementTimer: null };
            window.addEventListener('pointermove', move, { passive: false });
            window.addEventListener('pointerup', up, { once: true });
            window.addEventListener('pointercancel', up, { once: true });
          });
        });
      }

      async function saveDraggedOrder(groupKey, names) {
        const groupItems = state.items.filter((item) => itemGroupKey(item) === groupKey);
        const byName = new Map(groupItems.map((item) => [item.metadata.name, item]));
        const ordered = names.map((name) => byName.get(name)).filter(Boolean);
        if (ordered.length < 2) return;
        ordered.forEach((item, index) => { item.spec.priority = index; });
        root.querySelectorAll('.sc-item-group').forEach((node) => {
          if (node.dataset.groupKey === groupKey) node.classList.add('sc-order-saving');
        });
        try {
          await Promise.all(ordered.map((item) => request('put', '/items/' + encodeURIComponent(item.metadata.name), item.spec)));
          notify('success', '同组卡片排序已保存');
        } catch (error) {
          notify('error', errorMessage(error));
          await load();
        } finally {
          root.querySelectorAll('.sc-order-saving').forEach((node) => node.classList.remove('sc-order-saving'));
        }
      }

      function bindThemeColorControls() {
        const picker = root.querySelector('#sc-theme-picker'); const range = root.querySelector('#sc-theme-hue'); const hex = root.querySelector('#sc-theme-hex');
        const preview = root.querySelector('.sc-theme-color'); const output = root.querySelector('#sc-theme-hue-output');
        if (!picker || !range || !hex || !preview) return;
        const update = (color, updateHex = true) => {
          const normalized = normalizeHex(color); if (!normalized) return;
          const hue = Math.round(hexToHsl(normalized).h);
          picker.value = normalized; range.value = hue; if (updateHex) hex.value = normalized;
          preview.style.setProperty('--sc-selected-color', normalized); preview.querySelector('.sc-color-preview strong').textContent = normalized;
          if (output) output.value = `${hue}°`;
        };
        picker.addEventListener('input', (event) => update(event.target.value));
        hex.addEventListener('input', (event) => update(event.target.value, false));
        hex.addEventListener('blur', () => update(hex.value || DEFAULT_THEME_COLOR));
        range.addEventListener('input', (event) => {
          const current = hexToHsl(normalizeHex(hex.value) || picker.value || DEFAULT_THEME_COLOR);
          update(hslToHex(event.target.value, Math.max(55, current.s), Math.max(42, Math.min(72, current.l))));
        });
        root.querySelector('#sc-reset-theme-color')?.addEventListener('click', () => update(DEFAULT_THEME_COLOR));
      }

      function bindEffectControls() {
        const enabled = root.querySelector('input[name="effectEnabled"]');
        enabled?.addEventListener('change', () => {
          const label = enabled.closest('.sc-effect-switch')?.querySelector('span');
          if (label) label.textContent = enabled.checked ? '已开启' : '已关闭';
        });
        root.querySelectorAll('input[name="effectType"]').forEach((input) => input.addEventListener('change', () => {
          root.querySelectorAll('.sc-effect-options label').forEach((label) => label.classList.toggle('selected', label.contains(input)));
        }));
      }

      function bindCommentControls() {
        root.querySelectorAll('input[name="commentEnabled"], input[name="detailCommentEnabled"]').forEach((enabled) => enabled.addEventListener('change', () => {
          const label = enabled.closest('.sc-effect-switch')?.querySelector('span');
          const prefix = enabled.name === 'detailCommentEnabled' ? '作品详情评论' : '页面底部评论';
          if (label) label.textContent = `${prefix} · ${enabled.checked ? '已开启' : '已关闭'}`;
        }));
        root.querySelector('#sc-comment-type')?.addEventListener('change', (e) => {
          const isTwikoo = e.target.value === 'twikoo';
          const fields = root.querySelector('#sc-twikoo-fields');
          if (fields) fields.hidden = !isTwikoo;
        });
        const anonSwitch = root.querySelector('input[name="commentAnonymousEmail"]');
        anonSwitch?.addEventListener('change', () => {
          const label = anonSwitch.closest('.sc-effect-switch')?.querySelector('span');
          if (label) label.textContent = `允许匿名邮箱评论 · ${anonSwitch.checked ? '已开启' : '已关闭'}`;
        });
      }

      function bindSteamControls() {
        const enabled = root.querySelector('input[name="steamEnabled"]');
        enabled?.addEventListener('change', () => {
          const label = enabled.closest('.sc-effect-switch')?.querySelector('span');
          if (label) label.textContent = enabled.checked ? '已开启' : '已关闭';
        });
      }

      function bindHeroGifControls() {
        const enabled = root.querySelector('input[name="heroGifEnabled"]');
        enabled?.addEventListener('change', () => {
          const label = enabled.closest('.sc-effect-switch')?.querySelector('span');
          if (label) label.textContent = enabled.checked ? '已开启' : '已关闭';
        });
      }

      function bindVisitorStatsControls() {
        const enabled = root.querySelector('input[name="visitorStatsEnabled"]');
        enabled?.addEventListener('change', () => {
          const label = enabled.closest('.sc-effect-switch')?.querySelector('span');
          if (label) label.textContent = enabled.checked ? '已开启' : '已关闭';
        });
      }

      function bindMediaControls() {
        root.querySelectorAll('.sc-media-settings input[type="checkbox"]').forEach((input) => input.addEventListener('change', () => {
          const label = input.closest('.sc-effect-switch')?.querySelector('span');
          if (label) label.textContent = input.checked ? '已开启' : '已关闭';
        }));
        root.querySelectorAll('.sc-media-range input[type="range"]').forEach((input) => input.addEventListener('input', () => {
          const output = input.closest('label')?.querySelector('output');
          if (output) output.textContent = `${input.value}%`;
        }));
        root.querySelectorAll('.sc-media-settings input[name$="BackgroundUrl"]').forEach((input) => input.addEventListener('input', () => {
          const section = input.closest('.sc-media-settings');
          const type = section?.querySelector('select[name$="BackgroundType"]')?.value || 'image';
          const preview = section?.querySelector('.sc-media-preview');
          const url = input.value.trim();
          if (!preview) return;
          preview.innerHTML = url ? (type === 'video' ? `<video src="${esc(url)}" muted loop playsinline></video>` : `<img src="${esc(url)}" alt="背景预览">`) : '<span>暂无背景</span>';
        }));
        root.querySelectorAll('.sc-media-settings select').forEach((select) => select.addEventListener('change', () => {
          const section = select.closest('.sc-media-settings');
          const preview = section?.querySelector('.sc-media-preview');
          const url = section?.querySelector('input[name$="BackgroundUrl"]')?.value?.trim();
          if (!preview || !url) return;
          preview.innerHTML = select.value === 'video' ? `<video src="${esc(url)}" muted loop playsinline></video>` : `<img src="${esc(url)}" alt="背景预览">`;
        }));
      }

      async function action(name, objectName) {
                if (name === 'save-order') {
          if (!state.pendingOrder) return;
          state.savingOrder = true;
          render();
          try {
            await saveDraggedOrder(state.pendingOrder.groupKey, state.pendingOrder.names);
            state.pendingOrder = null;
            state.savingOrder = false;
            notify('success', '排序已成功保存');
            await load();
          } catch (error) {
            state.savingOrder = false;
            notify('error', errorMessage(error));
            render();
          }
          return;
        }
        if (name === 'cancel-order') {
          state.pendingOrder = null;
          state.savingOrder = false;
          notify('info', '已恢复原排序');
          await load();
          return;
        }
        if (name === 'cancel-confirmation') { state.confirmation = null; render(); return; }
        if (name === 'confirm-delete') {
          const pending = state.confirmation;
          state.confirmation = null;
          render();
          if (pending) await remove(pending.path, pending.successMessage);
          return;
        }
        if (name === 'close-modal') { attachmentSelectorOpen.value = false; attachmentSelectorTarget.value = ''; state.saving = false; state.itemDraft = null; state.categoryDraft = null; state.subcategoryDraft = null; state.templateDraft = null; render(); return; }
        if (name === 'select-cover') { syncItemDraftFromForm(); attachmentSelectorTarget.value = 'cover'; attachmentSelectorOpen.value = true; await nextTick(); render(); return; }
        if (name === 'select-hero-gif') { attachmentSelectorTarget.value = 'hero-gif'; attachmentSelectorOpen.value = true; await nextTick(); render(); return; }
        if (name === 'select-hero-background' || name === 'select-content-background') { attachmentSelectorTarget.value = name.replace('select-', ''); attachmentSelectorOpen.value = true; await nextTick(); render(); return; }
        if (name === 'clear-cover') { syncItemDraftFromForm(); state.itemDraft.cover = ''; render(); return; }
        if (name === 'new-template') {
          state.templateDraft = {
            displayName: '',
            icon: '✨',
            description: '',
            fields: defaultTemplateFields()
          };
          render();
          return;
        }
        if (name === 'edit-template') { const template=state.templates.find((item)=>item.metadata.name===objectName); state.templateDraft={...template.spec,fields:(template.spec.fields||[]).map((field)=>({...field})),_name:objectName}; render(); return; }
        if (name === 'reset-default-templates') { try { await request('post', '/templates/reset-defaults'); notify('success', '已重新加载默认模板'); await load(); } catch (error) { notify('error', errorMessage(error)); } return; }
        if (name === 'delete-template') {
          const template = state.templates.find((item) => item.metadata.name === objectName);
          const display = (template && template.spec && template.spec.displayName) || objectName;
          state.confirmation = {
            path: `/templates/${objectName}`,
            title: '删除模板内容',
            message: `确定要删除模板「${display}」吗？删除后不可恢复，且会让引用它的分类退回到动漫影视。`,
            successMessage: '模板已删除'
          };
          render();
          return;
        }
        if (name === 'parse-bgm') { await parseBgmSubject(); return; }
        if (name === 'parse-tmdb') { await parseTmdbSubject(); return; }
        if (name === 'new-item') {
          attachmentSelectorOpen.value = false;
          state.saving = false;
          if (!state.categories.length) { notify('warning', '请先新建一个分类'); state.tab = 'categories'; render(); return; }
          const targetCategory = state.categoryFilter !== 'all' && state.categories.some((c) => c.metadata.name === state.categoryFilter)
            ? state.categoryFilter
            : state.categories[0].metadata.name;
          const targetCategoryObj = state.categories.find((c) => c.metadata.name === targetCategory);
          const inheritedTemplate = targetCategoryObj?.spec?.template;
          const shouldPickTemplate = !inheritedTemplate || inheritedTemplate === 'standard' || inheritedTemplate === '';
          if (shouldPickTemplate && state.templates.length) {
            state.templateDraft = { _picker: true, _targetCategory: targetCategory };
            render();
            return;
          }
          state.itemDraft = {
            title: '', category: targetCategory, subcategory: '', cover: '', description: '', impression: '',
            watchUrl: '', externalUrl: '', tags: [], status: '已看完', score: 0, likes: 0,
            template: inheritedTemplate && inheritedTemplate !== 'standard' ? inheritedTemplate : '',
            priority: nextItemPriority(targetCategory, ''), published: true
          };
          render();
          return;
        }
        if (name === 'pick-template') {
          const targetCategory = state.templateDraft?._targetCategory;
          const templateName = objectName;
          state.templateDraft = null;
          state.itemDraft = {
            title: '', category: targetCategory || (state.categories[0] && state.categories[0].metadata.name), subcategory: '', cover: '', description: '', impression: '',
            watchUrl: '', externalUrl: '', tags: [], status: '已看完', score: 0, likes: 0,
            template: templateName === 'standard' ? '' : templateName,
            priority: nextItemPriority(targetCategory, ''), published: true
          };
          render();
          return;
        }
        if (name === 'edit-item') { attachmentSelectorOpen.value = false; state.saving = false; const item = state.items.find((x) => x.metadata.name === objectName); state.itemDraft = { ...item.spec, _name: objectName }; render(); return; }
        if (name === 'new-category') { attachmentSelectorOpen.value = false; state.saving = false; state.categoryDraft = { displayName: '', icon: '🌸', description: '', priority: state.categories.length, visible: true }; render(); return; }
        if (name === 'edit-category') { attachmentSelectorOpen.value = false; state.saving = false; const item = state.categories.find((x) => x.metadata.name === objectName); state.categoryDraft = { ...item.spec, _name: objectName }; render(); return; }
        if (name === 'new-subcategory') { attachmentSelectorOpen.value = false; state.saving = false; state.subcategoryDraft = { category: objectName, displayName: '', icon: '✦', description: '', priority: state.subcategories.length, visible: true }; render(); return; }
        if (name === 'edit-subcategory') { attachmentSelectorOpen.value = false; state.saving = false; const item = state.subcategories.find((x) => x.metadata.name === objectName); state.subcategoryDraft = { ...item.spec, _name: objectName }; render(); return; }
        if (name === 'delete-item') { state.confirmation = { path: `/items/${objectName}`, title: '删除展示内容', message: '确定要删除这条展示内容吗？删除后不可恢复。', successMessage: '展示内容已删除' }; render(); return; }
        if (name === 'delete-category') { state.confirmation = { path: `/categories/${objectName}`, title: '删除分类', message: '确定要删除这个分类吗？分类下有内容时系统会阻止删除。', successMessage: '分类已删除' }; render(); return; }
        if (name === 'delete-subcategory') { state.confirmation = { path: `/subcategories/${objectName}`, title: '删除二级标题', message: '确定要删除这个二级标题吗？删除后不可恢复。', successMessage: '二级标题已删除' }; render(); return; }
      }

      async function remove(path, message) {
        try {
          await request('delete', path);
          const parts = String(path).split('/').filter(Boolean);
          const kind = parts[0];
          const objectName = decodeURIComponent(parts.slice(1).join('/'));
          if (kind === 'items') state.items = state.items.filter((item) => item.metadata?.name !== objectName);
          if (kind === 'categories') state.categories = state.categories.filter((item) => item.metadata?.name !== objectName);
          if (kind === 'subcategories') state.subcategories = state.subcategories.filter((item) => item.metadata?.name !== objectName);
          if (kind === 'templates') {
            state.templates = state.templates.filter((item) => item.metadata?.name !== objectName);
            state.templateDraft = null;
            if (state.categoryDraft && state.categoryDraft.template === objectName) {
              state.categoryDraft.template = 'standard';
            }
          }
          state.confirmation = null;
          state.itemDraft = null;
          state.categoryDraft = null;
          state.subcategoryDraft = null;
          notify('success', message);
          render();
        } catch (error) { notify('error', errorMessage(error)); }
      }

      function syncItemDraftFromForm() {
        const formElement = root.querySelector('#sc-item-form');
        if (!formElement || !state.itemDraft) return;
        const form = new FormData(formElement);
        const name = state.itemDraft._name;
        state.itemDraft = {
          title: form.get('title'), category: form.get('category'), subcategory: form.get('subcategory'), cover: form.get('cover'),
          status: form.get('status'), score: Number(form.get('score') || 0), likes: Number(form.get('likes') || 0),
          priority: form.get('priority') !== null && form.get('priority') !== '' ? Number(form.get('priority')) : Number(state.itemDraft.priority ?? 0), description: form.get('description'),
          impression: form.get('impression'), watchUrl: form.get('watchUrl'), externalUrl: form.get('externalUrl'), tags: String(form.get('tags') || '').split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
          published: form.get('published') === 'on', customFields: Object.fromEntries([...form.entries()].filter(([key]) => key.startsWith('custom_')).map(([key,value]) => [key.slice(7), String(value)])), _name: name
        };
      }

      async function closeAttachmentSelector() {
        attachmentSelectorOpen.value = false;
        attachmentSelectorTarget.value = '';
        await nextTick();
        render();
      }

      async function selectAttachment(attachments) {
        const selected = Array.isArray(attachments) ? attachments[0] : attachments;
        const url = typeof selected === 'string' ? selected : (
          selected?.url || selected?.status?.permalink || selected?.spec?.url ||
          selected?.permalink || selected?.spec?.permalink || ''
        );
        if (!url) {
          notify('warning', '没有读取到所选图片的地址，请重新选择');
          return;
        }
        const target = attachmentSelectorTarget.value;
        if (target && target.startsWith('template-image:')) {
          const key = target.slice('template-image:'.length);
          if (state.itemDraft) {
            state.itemDraft.customFields = state.itemDraft.customFields || {};
            state.itemDraft.customFields[key] = url;
          }
          attachmentSelectorOpen.value = false;
          attachmentSelectorTarget.value = '';
          notify('success', '已从 Halo 附件库选择图片');
          await nextTick();
          render();
          return;
        }
        if (target === 'hero-gif') {
          state.settings.heroGifUrl = url;
          attachmentSelectorOpen.value = false;
          attachmentSelectorTarget.value = '';
          notify('success', '已从 Halo 附件库选择头图区 GIF');
          await nextTick();
          render();
          return;
        }
        if (target === 'hero-background' || target === 'content-background') {
          const prefix = target.replace('-background', '');
          state.settings[`${prefix}BackgroundUrl`] = url;
          attachmentSelectorOpen.value = false;
          attachmentSelectorTarget.value = '';
          notify('success', '已从 Halo 附件库选择背景媒体');
          await nextTick();
          render();
          return;
        }
        state.itemDraft.cover = url;
        attachmentSelectorOpen.value = false;
        attachmentSelectorTarget.value = '';
        notify('success', '已从 Halo 附件库选择封面');
        await nextTick();
        render();
      }

      function updateHeroGifPreview(url) {
        const preview = root.querySelector('.sc-hero-gif-preview');
        if (!preview) return;
        preview.replaceChildren();
        if (!String(url || '').trim()) { preview.innerHTML = '<span>GIF</span>'; return; }
        const image = document.createElement('img'); image.alt = '头图区动图预览'; image.src = String(url).trim();
        image.addEventListener('error', () => { preview.innerHTML = '<span>GIF</span>'; }, { once: true });
        preview.append(image);
      }

      function updateCoverPreview(url) {
        const preview = root.querySelector('.sc-preview');
        if (!preview) return;
        const showPlaceholder = () => {
          const wrapper = document.createElement('span');
          wrapper.append(document.createTextNode('🌸'));
          const label = document.createElement('small');
          label.textContent = '封面预览';
          wrapper.append(label);
          preview.replaceChildren(wrapper);
        };
        if (!String(url || '').trim()) {
          showPlaceholder();
          return;
        }
        const image = document.createElement('img');
        image.alt = '封面预览';
        image.addEventListener('error', showPlaceholder, { once: true });
        image.src = String(url).trim();
        preview.replaceChildren(image);
      }

      async function parseBgmSubject() {
        const input = root.querySelector('#sc-bgm-url');
        const btn = root.querySelector('[data-action="parse-bgm"]');
        const raw = String(input?.value || '').trim();
        if (!raw) {
          notify('warning', '请先输入 bgm.tv 条目链接或数字 ID');
          input?.focus();
          return;
        }
        const match = raw.match(/(?:subject\/|^)(\d+)/);
        if (!match) {
          notify('warning', '未识别到有效的条目 ID，例如：https://bgm.tv/subject/364450');
          return;
        }
        const subjectId = match[1];
        if (btn) {
          btn.disabled = true;
          btn.textContent = '解析中…';
        }
        try {
          const res = await fetch(`https://api.bgm.tv/v0/subjects/${subjectId}`);
          if (!res.ok) {
            throw new Error(`Bangumi 返回错误状态 ${res.status}`);
          }
          const data = await res.json();
          const title = data.name_cn || data.name || '';
          const cover = data.images?.large || data.images?.common || data.images?.medium || data.images?.small || '';
          const score = data.rating?.score ? Number(data.rating.score).toFixed(1) : '';
          const description = data.summary || '';
          const rawTags = Array.isArray(data.tags) ? data.tags : [];
          const tags = rawTags
            .map((t) => (typeof t === 'string' ? t : t?.name || ''))
            .map((t) => t.trim())
            .filter((t) => t && !['TV', '日本', '日本动画'].includes(t))
            .slice(0, 6);

          const form = root.querySelector('#sc-item-form');
          if (form) {
            if (cover) {
              const coverInput = form.querySelector('#sc-cover-url');
              if (coverInput) coverInput.value = cover;
              updateCoverPreview(cover);
            }
            if (title) {
              const titleInput = form.querySelector('input[name="title"]');
              if (titleInput) titleInput.value = title;
            }
            if (score) {
              const scoreInput = form.querySelector('input[name="score"]');
              if (scoreInput) scoreInput.value = score;
            }
            if (description) {
              const descInput = form.querySelector('textarea[name="description"]');
              if (descInput) descInput.value = description;
            }
            if (tags.length) {
              const tagsInput = form.querySelector('input[name="tags"]');
              if (tagsInput) tagsInput.value = tags.join(', ');
            }
            const extInput = form.querySelector('input[name="externalUrl"]');
            if (extInput && (!extInput.value || extInput.value.includes('bgm.tv') || extInput.value.includes('bangumi.tv'))) {
              extInput.value = `https://bgm.tv/subject/${subjectId}`;
            }
          }
          syncItemDraftFromForm();
          notify('success', `已成功解析并填入《${title || subjectId}》`);
        } catch (err) {
          notify('error', `解析失败：${err.message || '网络或接口异常'}`);
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '一键填入';
          }
        }
      }

      async function parseTmdbSubject() {
        const input = root.querySelector('#sc-tmdb-url');
        const btn = root.querySelector('[data-action="parse-tmdb"]');
        const raw = String(input?.value || '').trim();
        if (!raw) {
          notify('warning', '请先输入 TMDB 链接，如 https://www.themoviedb.org/movie/12345');
          input?.focus();
          return;
        }
        const match = raw.match(/(movie|tv)\/(\d+)/);
        if (!match) {
          notify('warning', '未识别到有效的 TMDB 链接，请粘贴 movie 或 tv 链接，如 https://www.themoviedb.org/movie/12345');
          return;
        }
        const type = match[1];
        const id = match[2];
        const key = String(state.settings.tmdbApiKey || '').trim();
        if (!key) {
          notify('warning', '请先在“后台设置”中填写 TMDB API Key');
          return;
        }
        if (btn) {
          btn.disabled = true;
          btn.textContent = '解析中…';
        }
        try {
          const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${encodeURIComponent(key)}&language=zh-CN`);
          if (!res.ok) {
            throw new Error(`TMDB 返回错误状态 ${res.status}`);
          }
          const data = await res.json();
          const title = data.title || data.name || '';
          const cover = data.poster_path ? `https://image.tmdb.org/t/p/original${data.poster_path}` : '';
          const score = Number(data.vote_average) > 0 ? Number(data.vote_average).toFixed(1) : '';
          const description = data.overview || '';
          const tags = Array.isArray(data.genres) ? data.genres.map((g) => g.name).filter(Boolean).slice(0, 6) : [];

          const form = root.querySelector('#sc-item-form');
          if (form) {
            if (cover) {
              const coverInput = form.querySelector('#sc-cover-url');
              if (coverInput) coverInput.value = cover;
              updateCoverPreview(cover);
            }
            if (title) {
              const titleInput = form.querySelector('input[name="title"]');
              if (titleInput) titleInput.value = title;
            }
            if (score) {
              const scoreInput = form.querySelector('input[name="score"]');
              if (scoreInput) scoreInput.value = score;
            }
            if (description) {
              const descInput = form.querySelector('textarea[name="description"]');
              if (descInput) descInput.value = description;
            }
            if (tags.length) {
              const tagsInput = form.querySelector('input[name="tags"]');
              if (tagsInput) tagsInput.value = tags.join(', ');
            }
            const extInput = form.querySelector('input[name="externalUrl"]');
            if (extInput && (!extInput.value || extInput.value.includes('themoviedb.org'))) {
              extInput.value = `https://www.themoviedb.org/${type}/${id}`;
            }
          }
          syncItemDraftFromForm();
          notify('success', `已成功解析并填入《${title || id}》`);
        } catch (err) {
          notify('error', `解析失败：${err.message || '网络或接口异常'}`);
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '一键填入';
          }
        }
      }

      async function saveItem(event) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const old = state.itemDraft;
        const category = String(form.get('category') || '');
        const subcategory = String(form.get('subcategory') || '');
        const movedGroup = Boolean(old._name) && (old.category !== category || (old.subcategory || '') !== subcategory);
        const priority = movedGroup ? nextItemPriority(category, subcategory) : (form.get('priority') !== null && form.get('priority') !== '' ? Number(form.get('priority')) : Number(old.priority ?? 0));
        const customFields={}; for(const [name,value] of form.entries()) if(name.startsWith('custom_')) customFields[name.slice(7)]=String(value).trim();
        // Decide which template the saved item belongs to. The status / score /
        // description / impression / watchUrl / externalUrl / tags inputs are
        // physically hidden when a non-standard template is active, but they
        // still exist in the DOM and FormData would pick up stale values. Read
        // them only when the active template is the 动漫影视 (standard) one.
        const savedCategory = state.categories.find((item) => item.metadata.name === category);
        const effectiveTemplate = String(old.template || (savedCategory && savedCategory.spec && savedCategory.spec.template) || '').trim();
        const isStandard = !effectiveTemplate || effectiveTemplate === 'standard' || effectiveTemplate === 'preset-standard';
        const standardFields = isStandard
          ? {
              status: String(form.get('status') || '').trim(),
              score: Number(form.get('score') || 0),
              description: String(form.get('description') || '').trim(),
              impression: String(form.get('impression') || '').trim(),
              watchUrl: String(form.get('watchUrl') || '').trim(),
              externalUrl: String(form.get('externalUrl') || '').trim(),
              tags: String(form.get('tags') || '').split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 6)
            }
          : {
              status: '',
              score: 0,
              description: String(customFields.description || '').trim(),
              impression: '',
              watchUrl: '',
              externalUrl: '',
              tags: []
            };
        const payload = {
          title: form.get('title'), category, subcategory, cover: form.get('cover'),
          status: standardFields.status, score: standardFields.score,
          likes: Number(form.get('likes') || 0), priority,
          description: standardFields.description, impression: standardFields.impression,
          watchUrl: standardFields.watchUrl, externalUrl: standardFields.externalUrl,
          tags: standardFields.tags, template: old.template || '', customFields,
          published: form.get('published') === 'on'
        };
        state.itemDraft = { ...payload, _name: old._name };
        state.saving = true; render();
        try { await request(old._name ? 'put' : 'post', old._name ? `/items/${old._name}` : '/items', payload); state.saving = false; notify('success', old._name ? '展示内容已更新' : '展示内容已添加'); state.itemDraft = null; await load(); }
        catch (error) { state.saving = false; state.itemDraft = { ...payload, _name: old._name }; notify('error', errorMessage(error)); render(); }
      }

      async function saveTemplate(event) { event.preventDefault(); const form=new FormData(event.currentTarget); const old=state.templateDraft; const previousFields = (old && Array.isArray(old.fields)) ? old.fields : []; const fields=form.getAll('fieldLabel').map((label,index)=>{ const key = String(form.getAll('fieldKey')[index] || `field_${Date.now()}_${index}`); const previous = previousFields.find((p) => p.key === key); return { key, label: String(label).trim(), type: String(form.getAll('fieldType')[index] || 'text'), unit: String(form.getAll('fieldUnit')[index] || '').trim(), placeholder: String(form.getAll('fieldPlaceholder')[index] || '').trim(), helpText: String(form.getAll('fieldHelp')[index] || '').trim(), required: form.get(`fieldRequired_${index}`) === 'on', showInCard: form.get(`fieldShowInCard_${index}`) === 'on', builtin: !!(previous && previous.builtin), core: !!(previous && previous.core) }; }).filter((field) => field.label).slice(0, 12); const payload = { displayName: form.get('displayName'), icon: form.get('icon'), description: form.get('description'), fields }; try { await request(old._name ? 'put' : 'post', old._name ? `/templates/${old._name}` : '/templates', payload); state.templateDraft = null; notify('success', old._name ? '模板已更新' : '模板已创建'); await load(); } catch (error) { notify('error', errorMessage(error)); } }

      async function saveCategory(event) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const old = state.categoryDraft;
        const template = String(form.get('template') || 'standard'); const linkedTemplate=state.templates.find((item)=>item.metadata.name===template); const payload = { displayName: form.get('displayName'), icon: form.get('icon'), description: form.get('description'), template, templateFields: linkedTemplate?.spec?.fields || [], priority: Number(form.get('priority') || 0), visible: form.get('visible') === 'on' };
        state.categoryDraft = { ...payload, _name: old._name };
        state.saving = true; render();
        try { await request(old._name ? 'put' : 'post', old._name ? `/categories/${old._name}` : '/categories', payload); state.saving = false; notify('success', old._name ? '分类已更新' : '分类已创建'); state.categoryDraft = null; await load(); }
        catch (error) { state.saving = false; state.categoryDraft = { ...payload, _name: old._name }; notify('error', errorMessage(error)); render(); }
      }

      async function saveSubcategory(event) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const old = state.subcategoryDraft;
        const payload = { category: form.get('category'), displayName: form.get('displayName'), icon: form.get('icon'), description: form.get('description'), priority: Number(form.get('priority') || 0), visible: form.get('visible') === 'on' };
        state.subcategoryDraft = { ...payload, _name: old._name }; state.saving = true; render();
        try { await request(old._name ? 'put' : 'post', old._name ? `/subcategories/${old._name}` : '/subcategories', payload); state.saving = false; notify('success', old._name ? '二级标题已更新' : '二级标题已创建'); state.subcategoryDraft = null; await load(); }
        catch (error) { state.saving = false; state.subcategoryDraft = { ...payload, _name: old._name }; notify('error', errorMessage(error)); render(); }
      }

      async function saveAdminSettings(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const defaultItemPosition = form.get('defaultItemPosition') === 'start' ? 'start' : 'end';
        const payload = {
          pageTitle: state.settings.pageTitle,
          subtitle: state.settings.subtitle,
          ownerText: state.settings.ownerText,
          themeColor: state.settings.themeColor,
          effectEnabled: state.settings.effectEnabled,
          effectType: state.settings.effectType,
          commentEnabled: state.settings.commentEnabled,
          detailCommentEnabled: state.settings.detailCommentEnabled,
          steamEnabled: state.settings.steamEnabled,
          heroGifEnabled: state.settings.heroGifEnabled,
          heroGifUrl: state.settings.heroGifUrl,
          visitorStatsEnabled: state.settings.visitorStatsEnabled,
          heroBackgroundEnabled: state.settings.heroBackgroundEnabled,
          heroBackgroundType: state.settings.heroBackgroundType,
          heroBackgroundUrl: state.settings.heroBackgroundUrl,
          heroBackgroundOpacity: state.settings.heroBackgroundOpacity,
          heroBackgroundSaturation: state.settings.heroBackgroundSaturation,
          contentBackgroundEnabled: state.settings.contentBackgroundEnabled,
          contentBackgroundType: state.settings.contentBackgroundType,
          contentBackgroundUrl: state.settings.contentBackgroundUrl,
          contentBackgroundOpacity: state.settings.contentBackgroundOpacity,
          contentBackgroundSaturation: state.settings.contentBackgroundSaturation,
          signatureEnabled: state.settings.signatureEnabled,
          signatureText: state.settings.signatureText,
          defaultItemPosition,
          commentType: ['halo', 'haloNext', 'twikoo'].includes(state.settings.commentType) ? state.settings.commentType : 'halo',
          twikooEnvId: state.settings.twikooEnvId,
          twikooJsUrl: state.settings.twikooJsUrl,
          commentAnonymousEmail: state.settings.commentAnonymousEmail,
          tmdbApiKey: String(form.get('tmdbApiKey') || '').trim()
        };
        try {
          const saved = await request('put', '/admin/settings', payload);
          state.settings = { ...state.settings, ...saved };
          notify('success', '后台设置已保存');
          render();
        } catch (error) {
          notify('error', errorMessage(error));
        }
      }

      function broadcastSettingsSaved(settings) {
        const payload = {
          time: Date.now(),
          commentType: ['halo', 'haloNext', 'twikoo'].includes(settings?.commentType) ? settings.commentType : 'halo',
          commentEnabled: settings?.commentEnabled !== false,
          detailCommentEnabled: settings?.detailCommentEnabled !== false
        };
        try {
          localStorage.setItem('showcase-settings-updated', JSON.stringify(payload));
        } catch (_) {}
        try {
          if (typeof BroadcastChannel === 'function') {
            const channel = new BroadcastChannel('showcase-sync');
            channel.postMessage({ type: 'settings-saved', ...payload });
            channel.close();
          }
        } catch (_) {}
      }

      async function saveSettings(event) {
        event.preventDefault(); const form = new FormData(root.querySelector('#sc-settings-form') || event.currentTarget); const mediaForm = root.querySelector('#sc-media-settings-form'); const media = mediaForm ? new FormData(mediaForm) : form;
        const payload = { pageTitle: form.get('pageTitle'), subtitle: form.get('subtitle'), ownerText: form.get('ownerText'), themeColor: normalizeHex(form.get('themeColor')) || DEFAULT_THEME_COLOR, effectEnabled: form.get('effectEnabled') === 'on', effectType: form.get('effectType') === 'stars' ? 'stars' : 'sakura', commentEnabled: form.get('commentEnabled') === 'on', detailCommentEnabled: form.get('detailCommentEnabled') === 'on', steamEnabled: form.get('steamEnabled') === 'on', heroGifEnabled: form.get('heroGifEnabled') === 'on', heroGifUrl: form.get('heroGifUrl'), signatureEnabled: form.get('signatureEnabled') === 'on', signatureText: form.get('signatureText'), heroBackgroundEnabled: media.get('heroBackgroundEnabled') === 'on', heroBackgroundType: media.get('heroBackgroundType'), heroBackgroundUrl: media.get('heroBackgroundUrl'), heroBackgroundOpacity: Number(media.get('heroBackgroundOpacity') || 28), heroBackgroundSaturation: Number(media.get('heroBackgroundSaturation') || 100), contentBackgroundEnabled: media.get('contentBackgroundEnabled') === 'on', contentBackgroundType: media.get('contentBackgroundType'), contentBackgroundUrl: media.get('contentBackgroundUrl'), contentBackgroundOpacity: Number(media.get('contentBackgroundOpacity') || 18), contentBackgroundSaturation: Number(media.get('contentBackgroundSaturation') || 100), defaultItemPosition: state.settings.defaultItemPosition || 'end', commentType: (() => { const v = form.get('commentType'); return ['halo', 'haloNext', 'twikoo'].includes(v) ? v : 'halo'; })(), twikooEnvId: String(form.get('twikooEnvId') || '').trim(), twikooJsUrl: String(form.get('twikooJsUrl') || '').trim(), commentAnonymousEmail: form.get('commentAnonymousEmail') === 'on' };
        payload.visitorStatsEnabled = form.get('visitorStatsEnabled') === 'on';
        payload.tmdbApiKey = state.settings.tmdbApiKey;
        try {
          const saved = await request('put', '/admin/settings', payload);
          // Preserve explicit false values when either or both comment
          // checkboxes are disabled.
          state.settings = {
            ...state.settings,
            ...(saved || {}),
            commentEnabled: typeof saved?.commentEnabled === 'boolean' ? saved.commentEnabled : payload.commentEnabled,
            detailCommentEnabled: typeof saved?.detailCommentEnabled === 'boolean' ? saved.detailCommentEnabled : payload.detailCommentEnabled
          };
          notify('success', '前台页面设置已保存');
          broadcastSettingsSaved({
            commentType: state.settings.commentType || payload.commentType || 'halo',
            commentEnabled: state.settings.commentEnabled,
            detailCommentEnabled: state.settings.detailCommentEnabled
          });
          render();
        } catch (error) { notify('error', errorMessage(error)); }
      }

      onMounted(() => load());
      onBeforeUnmount(() => { alive = false; });
      return () => h(Fragment, null, [
        h('div', { class: 'sc-root', ref: (element) => { root = element; } }),
        attachmentSelectorOpen.value
          ? h(AttachmentSelectorModal, { accepts: attachmentSelectorTarget.value === 'hero-gif' ? ['image/gif'] : attachmentSelectorTarget.value.endsWith('-background') ? ['image/*', 'video/mp4'] : ['image/*'], onClose: closeAttachmentSelector, onSelect: selectAttachment })
          : null
      ]);
    }
  };

  window.showcase = definePlugin({
    routes: [{ parentName: 'Root', route: { path: '/showcase', name: 'Showcase', component: ShowcaseConsole, meta: { permissions: ['plugin:showcase:view'], title: '展示架', menu: { name: '展示架', group: 'content', icon: ShelfIcon, priority: 55 } } } }]
  });
})();
