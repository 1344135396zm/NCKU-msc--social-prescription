(function () {
  'use strict';

  const CONFIG = window.SP_CONFIG;
  const CATS = CONFIG.categories;
  const STORE_KEY = 'sp-state-v1';

  const $ = (sel) => document.querySelector(sel);
  const state = {
    mode: null,
    page: null,        // 'contact' = 聯絡我們頁面；null = 依模式顯示
    resources: [],
    list: [],          // 已加入清單的資源 id
    rx: { goal: '', note: '', followup: '' },
    patient: { cats: new Set(), district: '', free: false },
    worker: { cats: new Set(), district: '', audience: '', free: false, q: '' }
  };

  // ---------- 儲存（只存在本機瀏覽器） ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: state.mode, list: state.list, rx: state.rx,
        large: document.documentElement.classList.contains('large')
      }));
    } catch (e) { /* 無痕模式等情況可忽略 */ }
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      state.mode = s.mode || null;
      state.list = Array.isArray(s.list) ? s.list : [];
      state.rx = Object.assign(state.rx, s.rx || {});
      if (s.large) document.documentElement.classList.add('large');
    } catch (e) { /* ignore */ }
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }

    const header = rows.shift().map((h) => h.trim());
    return rows
      .filter((r) => r.some((v) => v.trim()))
      .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
  }

  function toCatKeys(value) {
    return value.split(/[、,，;|]/).map((v) => v.trim()).filter(Boolean)
      .map((v) => (CATS.find((c) => c.key === v || c.label === v) || {}).key)
      .filter(Boolean);
  }

  function normalize(r, i) {
    return Object.assign({}, r, {
      id: r.id || 'row-' + (i + 1),
      cats: toCatKeys(r.category || ''),
      isFree: /免費/.test(r.cost || '')
    });
  }

  async function fetchResources(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    if (!text.trim()) throw new Error('empty');
    const rows = parseCSV(text).filter((r) => r.name).map(normalize);
    if (!rows.length) throw new Error('no rows');
    return rows;
  }

  async function load() {
    // 先讀 Google 試算表；讀不到或是空的，就改讀同資料夾的 data.csv 當備份。
    const urls = CONFIG.dataUrl ? [CONFIG.dataUrl, 'data.csv'] : ['data.csv'];
    for (const url of urls) {
      try {
        state.resources = await fetchResources(url);
        if (url !== urls[0]) console.warn('試算表讀取失敗，改用 data.csv');
        return;
      } catch (e) { /* 試下一個來源 */ }
    }
    const s = $('#load-status');
    s.hidden = false;
    s.textContent = location.protocol === 'file:'
      ? '無法讀取資料：請用本機伺服器開啟（見 README），不要直接雙擊 index.html。'
      : '無法讀取資料，請稍後再試。';
  }

  // ---------- 小工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const catOf = (key) => CATS.find((c) => c.key === key);
  const byId = (id) => state.resources.find((r) => r.id === id);
  const uniq = (field) => [...new Set(state.resources.map((r) => r[field]).filter(Boolean))].sort();

  function fillSelect(sel, values) {
    values.forEach((v) => sel.insertAdjacentHTML('beforeend', `<option>${esc(v)}</option>`));
  }

  function isStale(dateStr) {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (isNaN(d)) return true;
    const limit = new Date();
    limit.setMonth(limit.getMonth() - CONFIG.staleMonths);
    return d < limit;
  }

  function phoneLinks(contact) {
    // 把電話號碼變成可點的連結
    return esc(contact).replace(/(\d[\d\-]{2,}\d)/g, (m) => `<a href="tel:${m.replace(/-/g, '')}">${m}</a>`);
  }

  function mapLink(r) {
    if (!r.address) return '';
    const q = encodeURIComponent(r.address);
    return ` <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">地圖</a>`;
  }

  function filterResources(f) {
    const q = (f.q || '').toLowerCase();
    return state.resources.filter((r) =>
      (!f.cats.size || r.cats.some((c) => f.cats.has(c))) &&
      (!f.district || r.district === f.district || r.district === '全國' || r.district === '線上') &&
      (!f.audience || r.audience === f.audience || !r.audience || r.audience === '不限') &&
      (!f.free || r.isFree) &&
      (!q || [r.name, r.description, r.address, r.district, r.audience].join(' ').toLowerCase().includes(q))
    );
  }

  function addButton(r) {
    const inList = state.list.includes(r.id);
    const label = state.mode === 'worker' ? '加入處方單' : '加入我的清單';
    return `<button type="button" class="${inList ? 'added' : 'primary'}" data-toggle="${esc(r.id)}">
      ${inList ? '✓ 已加入' : label}</button>`;
  }

  function catTags(r) {
    return r.cats.map((k) => `<span class="tag">${esc(catOf(k).label)}</span>`).join('');
  }

  // ---------- 民眾模式 ----------
  function renderNeedGrid() {
    $('#need-grid').innerHTML = CATS.map((c) => `
      <button type="button" class="need" data-cat="${c.key}" aria-pressed="false">
        <span class="need-icon" aria-hidden="true">${c.icon}</span>${esc(c.need)}
      </button>`).join('');
  }

  function renderPatient() {
    const f = state.patient;
    document.querySelectorAll('#need-grid .need').forEach((b) =>
      b.setAttribute('aria-pressed', f.cats.has(b.dataset.cat)));
    $('#p-mental-note').hidden = !f.cats.has('mental');

    if (!f.cats.size) {
      $('#p-result-title').textContent = '';
      $('#p-results').innerHTML = '<p class="hint">點選上面的選項，就會出現適合你的資源。</p>';
      return;
    }
    const list = filterResources(f);
    $('#p-result-title').textContent = `找到 ${list.length} 個資源`;
    $('#p-results').innerHTML = list.length ? list.map((r) => `
      <article class="card">
        <div class="tags">${catTags(r)}${r.isFree ? '<span class="tag free">免費</span>' : ''}</div>
        <h3>${esc(r.name)}</h3>
        <p>${esc(r.description)}</p>
        <dl>
          ${r.time ? `<dt>時間</dt><dd>${esc(r.time)}</dd>` : ''}
          ${r.address ? `<dt>地點</dt><dd>${esc(r.address)}${mapLink(r)}</dd>` : ''}
          ${r.contact ? `<dt>聯絡</dt><dd>${phoneLinks(r.contact)}</dd>` : ''}
          ${r.cost && !r.isFree ? `<dt>費用</dt><dd>${esc(r.cost)}</dd>` : ''}
          ${r.signup ? `<dt>報名</dt><dd>${esc(r.signup)}</dd>` : ''}
        </dl>
        ${addButton(r)}
      </article>`).join('')
      : '<p class="hint">這個條件下目前沒有資源，試試看選「都可以」或取消「只看免費」。</p>';
  }

  // ---------- Link worker 模式 ----------
  function renderWorkerCats() {
    $('#w-cats').innerHTML = CATS.map((c) => `
      <label class="check"><input type="checkbox" value="${c.key}"> ${esc(c.label)}</label>`).join('');
  }

  function renderWorker() {
    const list = filterResources(state.worker);
    $('#w-result-title').textContent = `共 ${list.length} 筆資源`;
    $('#w-results').innerHTML = list.length ? list.map((r) => `
      <article class="row">
        <div class="row-main">
          <div class="tags">${catTags(r)}
            ${r.isFree ? '<span class="tag free">免費</span>' : ''}
            ${isStale(r.verified_date) ? '<span class="tag warn">需重新確認</span>' : ''}
          </div>
          <h3>${esc(r.name)}</h3>
          <p>${esc(r.description)}</p>
          <dl class="grid-dl">
            <dt>對象</dt><dd>${esc(r.audience || '不限')}</dd>
            <dt>地區</dt><dd>${esc(r.district)}</dd>
            ${r.address ? `<dt>地址</dt><dd>${esc(r.address)}${mapLink(r)}</dd>` : ''}
            ${r.time ? `<dt>時間</dt><dd>${esc(r.time)}</dd>` : ''}
            <dt>費用</dt><dd>${esc(r.cost || '未填')}</dd>
            ${r.signup ? `<dt>報名</dt><dd>${esc(r.signup)}</dd>` : ''}
            ${r.contact ? `<dt>聯絡</dt><dd>${phoneLinks(r.contact)}</dd>` : ''}
            ${r.website ? `<dt>網站</dt><dd><a href="${esc(r.website)}" target="_blank" rel="noopener">連結</a></dd>` : ''}
            ${r.accessibility ? `<dt>無障礙</dt><dd>${esc(r.accessibility)}</dd>` : ''}
            <dt>確認日期</dt><dd>${esc(r.verified_date || '未確認')}${r.source ? `（來源：${esc(r.source)}）` : ''}</dd>
          </dl>
        </div>
        ${addButton(r)}
      </article>`).join('')
      : '<p class="hint">沒有符合的資源。</p>';
  }

  // ---------- 清單 / 處方單 ----------
  function renderList() {
    const worker = state.mode === 'worker';
    const title = worker ? '社會處方單' : '我的清單';
    $('#rx-heading').textContent = title;
    $('#rx-print-title').textContent = title;
    $('#list-title-short').textContent = worker ? '處方單' : '清單';
    $('#list-count').textContent = state.list.length;
    $('#rx-worker-fields').hidden = !worker;
    $('#rx-date').textContent = new Date().toLocaleDateString('zh-TW');

    $('#rx-goal').value = state.rx.goal;
    $('#rx-note').value = state.rx.note;
    $('#rx-followup').value = state.rx.followup;
    $('#rx-fields-print').innerHTML = [
      ['對個案重要的事', state.rx.goal], ['建議 / 備註', state.rx.note], ['下次追蹤', state.rx.followup]
    ].filter(([, v]) => v).map(([k, v]) => `<p><strong>${k}：</strong>${esc(v)}</p>`).join('');

    const items = state.list.map(byId).filter(Boolean);
    $('#rx-empty').hidden = items.length > 0;
    $('#rx-items').innerHTML = items.map((r) => `
      <li>
        <strong>${esc(r.name)}</strong>
        <button type="button" class="link no-print" data-toggle="${esc(r.id)}">移除</button>
        <div>${esc(r.description)}</div>
        ${r.time ? `<div>時間：${esc(r.time)}</div>` : ''}
        ${r.address ? `<div>地點：${esc(r.address)}</div>` : ''}
        ${r.contact ? `<div>聯絡：${phoneLinks(r.contact)}</div>` : ''}
        ${r.cost ? `<div>費用：${esc(r.cost)}</div>` : ''}
        ${r.signup ? `<div>報名：${esc(r.signup)}</div>` : ''}
      </li>`).join('');
  }

  // ---------- 聯絡我們 ----------
  function safeUrl(url) {
    return /^(https?:|mailto:|tel:)/i.test(url) ? url : '';
  }

  function renderContact() {
    const team = CONFIG.team || {};
    $('#contact-name').textContent = team.name || '（請在 config.js 填入服務隊名稱）';
    $('#contact-intro').textContent = team.intro || '';
    $('#contact-note').textContent = team.note || '';
    const links = (team.links || []).filter((l) => safeUrl(l.url || ''));
    $('#contact-links').innerHTML = links.length
      ? links.map((l) => {
          const external = /^https?:/i.test(l.url) ? ' target="_blank" rel="noopener"' : '';
          return `<a class="contact-link" href="${esc(l.url)}"${external}>${esc(l.label)}</a>`;
        }).join('')
      : '<p class="hint">（請在 config.js 填入 Facebook、Instagram 等連結）</p>';
  }

  // ---------- 畫面切換 ----------
  function render() {
    const page = state.page;
    $('#view-contact').hidden = page !== 'contact';
    $('#view-landing').hidden = !!page || !!state.mode;
    $('#view-patient').hidden = !!page || state.mode !== 'patient';
    $('#view-worker').hidden = !!page || state.mode !== 'worker';
    if (page === 'contact') renderContact();
    document.querySelectorAll('.mode-switch button').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    $('#list-toggle').hidden = !state.mode;
    if (state.mode === 'patient') renderPatient();
    if (state.mode === 'worker') renderWorker();
    renderList();
  }

  function setMode(mode) {
    state.mode = mode;
    state.page = null;
    save();
    render();
    window.scrollTo(0, 0);
  }

  function setPage(page) {
    state.page = page;
    render();
    window.scrollTo(0, 0);
  }

  function toggleItem(id) {
    const i = state.list.indexOf(id);
    if (i >= 0) state.list.splice(i, 1); else state.list.push(id);
    save();
    render();
  }

  // ---------- 事件 ----------
  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      if (!t) return;
      if (t.dataset.mode) setMode(t.dataset.mode);
      else if (t.dataset.page) setPage(t.dataset.page);
      else if (t.dataset.toggle) toggleItem(t.dataset.toggle);
      else if (t.dataset.cat) {
        const cats = state.patient.cats;
        cats.has(t.dataset.cat) ? cats.delete(t.dataset.cat) : cats.add(t.dataset.cat);
        renderPatient();
      }
    });

    $('#home-link').addEventListener('click', (e) => { e.preventDefault(); setMode(null); });

    $('#font-toggle').addEventListener('click', () => {
      const on = document.documentElement.classList.toggle('large');
      $('#font-toggle').setAttribute('aria-pressed', on);
      save();
    });

    // 民眾篩選
    $('#p-district').addEventListener('change', (e) => { state.patient.district = e.target.value; renderPatient(); });
    $('#p-free').addEventListener('change', (e) => { state.patient.free = e.target.checked; renderPatient(); });

    // Link worker 篩選
    const w = state.worker;
    $('#w-q').addEventListener('input', (e) => { w.q = e.target.value; renderWorker(); });
    $('#w-cats').addEventListener('change', (e) => {
      e.target.checked ? w.cats.add(e.target.value) : w.cats.delete(e.target.value);
      renderWorker();
    });
    $('#w-district').addEventListener('change', (e) => { w.district = e.target.value; renderWorker(); });
    $('#w-audience').addEventListener('change', (e) => { w.audience = e.target.value; renderWorker(); });
    $('#w-free').addEventListener('change', (e) => { w.free = e.target.checked; renderWorker(); });
    $('#w-reset').addEventListener('click', () => {
      $('#w-filters').reset();
      Object.assign(w, { cats: new Set(), district: '', audience: '', free: false, q: '' });
      renderWorker();
    });

    // 清單面板
    const panel = $('#list-panel');
    $('#list-toggle').addEventListener('click', () => { panel.hidden = false; });
    $('#list-close').addEventListener('click', () => { panel.hidden = true; });
    panel.addEventListener('click', (e) => { if (e.target === panel) panel.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.hidden = true; });

    ['goal', 'note', 'followup'].forEach((k) => {
      $('#rx-' + k).addEventListener('input', (e) => { state.rx[k] = e.target.value; save(); });
    });
    $('#rx-print-btn').addEventListener('click', () => { renderList(); window.print(); });
    $('#rx-clear').addEventListener('click', () => {
      if (!confirm('確定要清空清單嗎？')) return;
      state.list = [];
      state.rx = { goal: '', note: '', followup: '' };
      save();
      render();
    });
  }

  async function init() {
    restore();
    // 網址可指定模式，例如 ?mode=worker（方便 link worker 加入書籤）
    const urlMode = new URLSearchParams(location.search).get('mode');
    if (urlMode === 'patient' || urlMode === 'worker') state.mode = urlMode;
    // ?page=contact 可以直接打開聯絡頁（方便放在 QR Code 或社群貼文）
    if (new URLSearchParams(location.search).get('page') === 'contact') state.page = 'contact';
    $('#font-toggle').setAttribute('aria-pressed', document.documentElement.classList.contains('large'));
    renderNeedGrid();
    renderWorkerCats();
    bind();
    await load();
    const districts = uniq('district').filter((d) => d !== '全國' && d !== '線上');
    fillSelect($('#p-district'), districts);
    fillSelect($('#w-district'), districts);
    fillSelect($('#w-audience'), uniq('audience').filter((a) => a !== '不限'));
    state.list = state.list.filter(byId);
    render();
  }

  init();
})();
