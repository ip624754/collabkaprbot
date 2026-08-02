import assert from 'node:assert/strict';

const app = {
  innerHTML: '',
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {},
  classList: { toggle() {}, add() {}, remove() {} },
};
const body = { classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} };
globalThis.location = { pathname: '/admin/login', search: '', href: 'https://example.test/admin/login' };
globalThis.history = {
  replaceState(_a, _b, url) {
    const next = new URL(url, 'https://example.test');
    location.pathname = next.pathname;
    location.search = next.search;
  },
  pushState() {},
};
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document = {
  body,
  getElementById(id) { return id === 'app' ? app : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return {
      style: {}, classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {}, appendChild() {}, remove() {}, focus() {}, select() {}, click() {},
      querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {},
    };
  },
};
globalThis.window = globalThis;
window.__adminUi = { mobileNavOpen: false };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.addEventListener = () => {};
window.clearInterval = clearInterval;
window.setInterval = setInterval;
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
  status: 401,
  headers: { 'content-type': 'application/json' },
});
globalThis.alert = () => {};
globalThis.confirm = () => false;
globalThis.prompt = () => '';

await import('./admin-web.js');
await new Promise((resolve) => setTimeout(resolve, 25));
assert.ok(app.innerHTML.length > 500, 'real ESM entry graph renders login shell');
assert.ok(app.innerHTML.includes('Вход') || app.innerHTML.includes('вход'), 'login surface remains reachable');
console.log('✅ STEP590H real admin-web ESM graph load OK (1 entry + 6 bounded modules)');
