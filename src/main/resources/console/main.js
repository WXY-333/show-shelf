(() => {
  'use strict';
  const { definePlugin, utils } = window.HaloUiShared;
  const { h, onMounted, onBeforeUnmount, markRaw, ref, resolveComponent, nextTick, Fragment } = window.Vue;
  const API = '/apis/api.showcase.halo.run/v1alpha1';
  const DEFAULT_THEME_COLOR = '#E96F9D';

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
      const state = {
        tab: 'items', loading: true, items: [], categories: [], subcategories: [],
        settings: { pageTitle: '', subtitle: '', ownerText: '', themeColor: DEFAULT_THEME_COLOR, effectEnabled: true, effectType: 'sakura', commentEnabled: true, commentWidgetInstalled: false, commentWidgetActive: false, commentWidgetMessage: '', steamEnabled: false, steamInstalled: false, steamActive: false, steamMessage: '', heroGifEnabled: true, heroGifUrl: '/plugins/showcase/assets/static/gif.gif', visitorStatsEnabled: false, heroBackgroundEnabled: false, heroBackgroundType: 'image', heroBackgroundUrl: '', heroBackgroundOpacity: 28, heroBackgroundSaturation: 100, contentBackgroundEnabled: false, contentBackgroundType: 'image', contentBackgroundUrl: '', contentBackgroundOpacity: 18, contentBackgroundSaturation: 100, signatureEnabled: true, signatureText: 'Keep discovering beautiful stories' },
        itemDraft: null, categoryDraft: null, subcategoryDraft: null, saving: false, confirmation: null
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

      async function load() {
        state.loading = true; state.saving = false; render();
        try {
          const [items, categories, subcategories, settings] = await Promise.all([
            request('get', '/admin/items'), request('get', '/admin/categories'), request('get', '/admin/subcategories'), request('get', '/settings')
          ]);
          state.items = items || []; state.categories = categories || []; state.subcategories = subcategories || []; state.settings = settings || state.settings;
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
            <button data-tab="settings" class="${state.tab === 'settings' ? 'active' : ''}">页面设置</button>
          </nav>
          <main>${state.loading ? loadingHtml() : contentHtml()}</main>
          ${itemModalHtml()}${categoryModalHtml()}${subcategoryModalHtml()}${confirmationHtml()}
        </div>`;
      }

      function loadingHtml() { return '<div class="sc-loading"><i></i><i></i><i></i><span>正在整理展示架…</span></div>'; }
      function contentHtml() {
        if (state.tab === 'categories') return categoriesHtml();
        if (state.tab === 'settings') return settingsHtml() + mediaSettingsPanelHtml();
        return itemsHtml();
      }

      function itemsHtml() {
        const controls = canManage ? '<button class="sc-primary" data-action="new-item">＋ 添加展示内容</button>' : '';
        if (!state.items.length) return `<section class="sc-section"><div class="sc-section-head"><div><h2>展示内容</h2><p>优先从第一部喜欢的动漫开始吧。</p></div>${controls}</div><div class="sc-empty"><b>🌸</b><h3>展示架还是空的</h3><p>添加封面、简介和观看感受后，内容会立即出现在 /movie。</p></div></section>`;
        const cards = state.items.map((item) => {
          const s = item.spec || {}; const category = state.categories.find((c) => c.metadata.name === s.category);
          return `<article class="sc-card"><div class="sc-cover">${s.cover ? `<img src="${esc(s.cover)}" alt="">` : '<span>🌸</span>'}<em class="${s.published ? 'online' : ''}">${s.published ? '已发布' : '草稿'}</em></div>
            <div class="sc-card-body"><small>${esc(category?.spec?.icon || '🌸')} ${esc(category?.spec?.displayName || '未分类')}</small><h3 title="${esc(s.title)}">${esc(s.title || '未命名')}</h3><p>${esc(s.description || s.impression || '暂无简介')}</p>
            <footer><span>${Number(s.score) > 0 ? `评分 ${esc(s.score)}/10` : esc(s.status || '未标记')}</span>${canManage ? `<div><button data-action="edit-item" data-name="${esc(item.metadata.name)}">编辑</button><button class="danger" data-action="delete-item" data-name="${esc(item.metadata.name)}">删除</button></div>` : ''}</footer></div></article>`;
        }).join('');
        return `<section class="sc-section"><div class="sc-section-head"><div><h2>展示内容</h2><p>卡片会按排序值从小到大显示。</p></div>${controls}</div><div class="sc-card-grid">${cards}</div></section>`;
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
        const commentStatusClass = s.commentWidgetActive ? 'connected' : s.commentWidgetInstalled ? 'inactive' : 'missing';
        const commentStatusText = s.commentWidgetActive ? '已连接' : s.commentWidgetInstalled ? '未启用' : '未安装';
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
          <div class="sc-comment-settings ${commentStatusClass}"><div class="sc-comment-icon" aria-hidden="true"><img src="/plugins/showcase/assets/static/评论组件图标.png?v=1.2.3" alt=""></div><div class="sc-comment-copy"><div><strong>页面评论区</strong><em>${commentStatusText}</em></div><small>连接 Halo 官方“评论组件”插件，在 /movie 页面底部显示公共评论区。展示架不会修改 Halo 全局评论配置；匿名评论功能需管理员在 Halo系统设置内的评论设置中勾选启用评论</small><p>${esc(s.commentWidgetMessage || '正在检查 Halo 评论组件插件状态…')}</p></div><label class="sc-effect-switch"><input name="commentEnabled" type="checkbox" ${s.commentEnabled !== false ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${s.commentEnabled !== false ? '已开启' : '已关闭'}</span></label></div>
          <div class="sc-visitor-stats-settings"><div><strong>访客统计</strong><small>在页脚上方显示今日访客、今日访问、总访客和总访问数量。统计数据由展示架独立保存。</small></div><label class="sc-effect-switch"><input name="visitorStatsEnabled" type="checkbox" ${s.visitorStatsEnabled === true ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${s.visitorStatsEnabled === true ? '已开启' : '已关闭'}</span></label></div>
          ${!s.commentWidgetActive ? '<div class="sc-comment-notice">请先在 Halo 插件管理中安装并启用 <b>评论组件</b> 插件。展示架评论开关不会修改 Halo 全站评论配置。</div>' : ''}
          <div class="sc-steam-settings ${steamStatusClass}"><div class="sc-steam-icon" aria-hidden="true"><img src="/plugins/showcase/assets/static/logo.png" alt=""></div><div class="sc-steam-copy"><div><strong>Steam 游戏联动</strong><em>${steamStatusText}</em></div><small>开启后，/movie 会自动增加“游戏”分类，并读取“Steam 信息展示”插件中的游戏资料。</small><p>${esc(s.steamMessage || '正在检查 Steam 信息展示插件状态…')}</p></div><label class="sc-effect-switch"><input name="steamEnabled" type="checkbox" ${s.steamEnabled === true ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${s.steamEnabled === true ? '已开启' : '已关闭'}</span></label></div>
          ${!s.steamActive ? '<div class="sc-steam-notice">请先在 Halo 插件管理中安装并启用 <b>Steam 信息展示</b> 插件。即使提前打开联动，前台也只会显示缺少插件的提示，不会影响其他分类。</div>' : ''}
          ${canManage ? '<button class="sc-primary" type="submit">保存页面设置</button>' : ''}</form></section>`;
      }

      function itemModalHtml() {
        if (!state.itemDraft) return '';
        const d = state.itemDraft; const categoryOptions = state.categories.map((category) => `<option value="${esc(category.metadata.name)}" ${d.category === category.metadata.name ? 'selected' : ''}>${esc(category.spec.icon || '')} ${esc(category.spec.displayName)}</option>`).join(''); const subcategoryOptions = state.subcategories.filter((x) => x.spec?.category === d.category).map((x) => `<option value="${esc(x.metadata.name)}" ${d.subcategory === x.metadata.name ? 'selected' : ''}>${esc(x.spec.icon || '✦')} ${esc(x.spec.displayName)}</option>`).join('');
        return `<div class="sc-modal${attachmentSelectorOpen.value ? ' sc-modal-behind' : ''}" role="dialog" aria-modal="true" aria-label="${d._name ? '编辑展示内容' : '添加展示内容'}"><div class="sc-modal-card wide"><header><div><small>CONTENT EDITOR</small><h2>${d._name ? '编辑展示内容' : '添加展示内容'}</h2></div><button type="button" data-action="close-modal">×</button></header>
          <form id="sc-item-form"><div class="sc-form-grid"><div class="sc-cover-editor"><div class="sc-preview">${d.cover ? `<img src="${esc(d.cover)}" alt="封面预览">` : '<span>🌸<small>封面预览</small></span>'}</div><div class="sc-cover-actions"><button type="button" class="sc-upload" data-action="select-cover">从 Halo 附件库选择</button>${d.cover ? '<button type="button" class="sc-clear-cover" data-action="clear-cover">清除封面</button>' : ''}</div><label><span>或粘贴封面 URL</span><input id="sc-cover-url" name="cover" value="${esc(d.cover)}" placeholder="https://…"></label></div>
          <div class="sc-fields"><label><span>标题 *</span><input name="title" maxlength="120" value="${esc(d.title)}" required autofocus></label><div class="sc-two"><label><span>分类 *</span><select name="category" required>${categoryOptions}</select></label><label><span>二级标题</span><select name="subcategory"><option value="">默认区域</option>${subcategoryOptions}</select></label></div><div class="sc-two"><label><span>观看状态</span><input name="status" maxlength="30" value="${esc(d.status || '已看完')}"></label><label class="sc-score-field"><span>个人评分（0-10）</span><input class="sc-score-input" name="score" type="number" min="0" max="10" step="0.1" inputmode="decimal" value="${esc(d.score ?? 0)}" placeholder="例如：9.6"><small class="sc-field-help">支持输入一位小数，例如 9.6。</small></label></div><label><span>点赞数量</span><input name="likes" type="number" min="0" max="2147483647" step="1" inputmode="numeric" value="${esc(d.likes || 0)}"><small class="sc-field-help">可手动调整前台点赞累计数量，访客点赞后会继续在此基础上累加。</small></label>
          <label><span>作品简介</span><textarea name="description" rows="4" maxlength="3000">${esc(d.description)}</textarea></label><label><span>观看后感受</span><textarea name="impression" rows="5" maxlength="5000" placeholder="记录触动你的台词、人物或片段…">${esc(d.impression)}</textarea></label>
          <label><span>观看链接（选填）</span><input name="watchUrl" type="url" maxlength="2000" value="${esc(d.watchUrl)}" placeholder="https://…"><small class="sc-field-help">填写后，详情中会显示“去观看”按钮；留空则不显示该按钮。</small></label><label><span>其他链接（选填）</span><input name="externalUrl" type="url" maxlength="2000" value="${esc(d.externalUrl || '')}" placeholder="https://…"><small class="sc-field-help">填写后，详情中显示一个受主题色控制的“打开其他链接”卡片。</small></label><label><span>封面标签（可选）</span><input name="tags" maxlength="180" value="${esc((d.tags || []).slice(0, 6).join(', '))}" placeholder="例如：治愈、校园、恋爱"><small class="sc-field-help">多个标签用逗号分隔，最多显示 6 个，前端每行显示 3 个。</small></label><label class="sc-check"><input name="published" type="checkbox" ${d.published !== false ? 'checked' : ''}><span>发布到前台 /movie</span></label></div></div>
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
        root.querySelector('#sc-settings-form')?.addEventListener('submit', saveSettings);
        root.querySelector('#sc-media-settings-form')?.addEventListener('submit', saveSettings);
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
        root.querySelector('#sc-item-form select[name="category"]')?.addEventListener('change', (event) => {
          if (!state.itemDraft) return;
          syncItemDraftFromForm();
          state.itemDraft.category = event.target.value;
          state.itemDraft.subcategory = '';
          render();
        });
      }

      function render() { if (!alive || !root) return; root.innerHTML = layout(); bind(); }

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
        const enabled = root.querySelector('input[name="commentEnabled"]');
        enabled?.addEventListener('change', () => {
          const label = enabled.closest('.sc-effect-switch')?.querySelector('span');
          if (label) label.textContent = enabled.checked ? '已开启' : '已关闭';
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
        if (name === 'cancel-confirmation') { state.confirmation = null; render(); return; }
        if (name === 'confirm-delete') {
          const pending = state.confirmation;
          state.confirmation = null;
          render();
          if (pending) await remove(pending.path, pending.successMessage);
          return;
        }
        if (name === 'close-modal') { attachmentSelectorOpen.value = false; attachmentSelectorTarget.value = ''; state.saving = false; state.itemDraft = null; state.categoryDraft = null; state.subcategoryDraft = null; render(); return; }
        if (name === 'select-cover') { syncItemDraftFromForm(); attachmentSelectorTarget.value = 'cover'; attachmentSelectorOpen.value = true; await nextTick(); render(); return; }
        if (name === 'select-hero-gif') { attachmentSelectorTarget.value = 'hero-gif'; attachmentSelectorOpen.value = true; await nextTick(); render(); return; }
        if (name === 'select-hero-background' || name === 'select-content-background') { attachmentSelectorTarget.value = name.replace('select-', ''); attachmentSelectorOpen.value = true; await nextTick(); render(); return; }
        if (name === 'clear-cover') { syncItemDraftFromForm(); state.itemDraft.cover = ''; render(); return; }
        if (name === 'new-item') {
          attachmentSelectorOpen.value = false;
          state.saving = false;
          if (!state.categories.length) { notify('warning', '请先新建一个分类'); state.tab = 'categories'; render(); return; }
          state.itemDraft = { title: '', category: state.categories[0].metadata.name, subcategory: '', cover: '', description: '', impression: '', watchUrl: '', externalUrl: '', tags: [], status: '已看完', score: 0, likes: 0, priority: state.items.length, published: true }; render(); return;
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
          priority: Number(form.get('priority') || 0), description: form.get('description'),
          impression: form.get('impression'), watchUrl: form.get('watchUrl'), externalUrl: form.get('externalUrl'), tags: String(form.get('tags') || '').split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 6),
          published: form.get('published') === 'on', _name: name
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
        if (attachmentSelectorTarget.value === 'hero-gif') {
          state.settings.heroGifUrl = url;
          attachmentSelectorOpen.value = false;
          attachmentSelectorTarget.value = '';
          notify('success', '已从 Halo 附件库选择头图区 GIF');
          await nextTick();
          render();
          return;
        }
        if (attachmentSelectorTarget.value === 'hero-background' || attachmentSelectorTarget.value === 'content-background') {
          const prefix = attachmentSelectorTarget.value.replace('-background', '');
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

      async function saveItem(event) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const old = state.itemDraft;
        const payload = { title: form.get('title'), category: form.get('category'), subcategory: form.get('subcategory'), cover: form.get('cover'), status: form.get('status'), score: Number(form.get('score') || 0), likes: Number(form.get('likes') || 0), priority: Number(form.get('priority') || 0), description: form.get('description'), impression: form.get('impression'), watchUrl: form.get('watchUrl'), externalUrl: form.get('externalUrl'), tags: String(form.get('tags') || '').split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 6), published: form.get('published') === 'on' };
        state.itemDraft = { ...payload, _name: old._name };
        state.saving = true; render();
        try { await request(old._name ? 'put' : 'post', old._name ? `/items/${old._name}` : '/items', payload); state.saving = false; notify('success', old._name ? '展示内容已更新' : '展示内容已添加'); state.itemDraft = null; await load(); }
        catch (error) { state.saving = false; state.itemDraft = { ...payload, _name: old._name }; notify('error', errorMessage(error)); render(); }
      }

      async function saveCategory(event) {
        event.preventDefault(); const form = new FormData(event.currentTarget); const old = state.categoryDraft;
        const payload = { displayName: form.get('displayName'), icon: form.get('icon'), description: form.get('description'), priority: Number(form.get('priority') || 0), visible: form.get('visible') === 'on' };
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

      async function saveSettings(event) {
        event.preventDefault(); const form = new FormData(root.querySelector('#sc-settings-form') || event.currentTarget); const mediaForm = root.querySelector('#sc-media-settings-form'); const media = mediaForm ? new FormData(mediaForm) : form;
        const payload = { pageTitle: form.get('pageTitle'), subtitle: form.get('subtitle'), ownerText: form.get('ownerText'), themeColor: normalizeHex(form.get('themeColor')) || DEFAULT_THEME_COLOR, effectEnabled: form.get('effectEnabled') === 'on', effectType: form.get('effectType') === 'stars' ? 'stars' : 'sakura', commentEnabled: form.get('commentEnabled') === 'on', steamEnabled: form.get('steamEnabled') === 'on', heroGifEnabled: form.get('heroGifEnabled') === 'on', heroGifUrl: form.get('heroGifUrl'), signatureEnabled: form.get('signatureEnabled') === 'on', signatureText: form.get('signatureText'), heroBackgroundEnabled: media.get('heroBackgroundEnabled') === 'on', heroBackgroundType: media.get('heroBackgroundType'), heroBackgroundUrl: media.get('heroBackgroundUrl'), heroBackgroundOpacity: Number(media.get('heroBackgroundOpacity') || 28), heroBackgroundSaturation: Number(media.get('heroBackgroundSaturation') || 100), contentBackgroundEnabled: media.get('contentBackgroundEnabled') === 'on', contentBackgroundType: media.get('contentBackgroundType'), contentBackgroundUrl: media.get('contentBackgroundUrl'), contentBackgroundOpacity: Number(media.get('contentBackgroundOpacity') || 18), contentBackgroundSaturation: Number(media.get('contentBackgroundSaturation') || 100) };
        payload.visitorStatsEnabled = form.get('visitorStatsEnabled') === 'on';
        try { const saved = await request('put', '/admin/settings', payload); state.settings = { ...state.settings, ...saved }; notify('success', '前台页面设置已保存'); render(); } catch (error) { notify('error', errorMessage(error)); }
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
