// Run with: node src/test/js/console-search.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

async function checkSearch() {
  let mounted, search, html, renders = 0;
  const root = {
    set innerHTML(value) {
      html = value;
      renders++;
      const match = value.match(/id="sc-item-search"[^>]* value="([^"]*)"/);
      search = match ? {
        value: match[1], listeners: {},
        addEventListener(type, listener) { this.listeners[type] = listener; },
        focus() {}, setSelectionRange() {},
        emit(type, isComposing = false) { this.listeners[type]?.({ target: this, isComposing }); }
      } : null;
    },
    querySelector(selector) { return selector === '#sc-item-search' ? search : null; },
    querySelectorAll() { return []; }
  };
  const window = {
    HaloUiShared: { definePlugin: (plugin) => plugin, utils: { permission: { has: () => true } } },
    Vue: {
      h: (_, props) => props?.ref?.(root), onMounted: (callback) => { mounted = callback; },
      onBeforeUnmount() {}, markRaw: (value) => value, ref: (value) => ({ value }),
      resolveComponent() {}
    },
    localStorage: { getItem: () => null },
    axios: async ({ url }) => ({ data: url.endsWith('/items') ? [
      { metadata: { name: 'chinese' }, spec: { title: '中文' } },
      { metadata: { name: 'english' }, spec: { title: 'English' } }
    ] : url.endsWith('/settings') ? {} : [] })
  };
  runInNewContext(readFileSync(join(__dirname, '../../main/resources/console/main.js'), 'utf8'), {
    window, document: { querySelector: () => ({}) }, console
  });
  window.showcase.routes[0].route.component.setup()();
  await mounted();
  const hasItem = (name) => html.includes(`data-item-name="${name}"`);

  // Pinyin must not replace the input, even when isComposing is absent/false.
  const composingInput = search;
  const beforeComposition = renders;
  search.emit('compositionstart');
  search.value = 'z';
  search.emit('input', true);
  search.value = 'zhong';
  search.emit('input');
  assert.equal(renders, beforeComposition);
  assert.equal(search, composingInput);
  assert.ok(hasItem('chinese') && hasItem('english'));

  search.value = '中文';
  search.emit('compositionend');
  assert.equal(renders, beforeComposition + 1);
  assert.ok(hasItem('chinese') && !hasItem('english'));
  search.emit('input'); // Some browsers send a final input after compositionend.
  assert.equal(renders, beforeComposition + 1);

  // A canceled composition leaves the existing filter intact.
  search.emit('compositionstart');
  search.value = '中文a';
  search.emit('input', true);
  search.value = '中文';
  search.emit('compositionend');
  assert.equal(renders, beforeComposition + 1);

  search.value = 'ENGLISH';
  search.emit('input');
  assert.ok(!hasItem('chinese') && hasItem('english'));
  search.value = '';
  search.emit('input');
  assert.ok(hasItem('chinese') && hasItem('english'));
  console.log('Console search regression check passed.');
}

checkSearch().catch((error) => { console.error(error); process.exitCode = 1; });
