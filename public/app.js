(() => {
  const USER_LABELS = { edgar: 'Edgar', nelia: 'Nélia' };
  const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTHS_FULL_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const TOTAL_LABEL = { expense: 'Total gasto', income: 'Total recebido' };
  const NEW_TITLE = { expense: 'Nova despesa', income: 'Novo rendimento' };
  const EDIT_TITLE = { expense: 'Editar despesa', income: 'Editar rendimento' };
  const EMPTY_MESSAGE = { expense: 'Ainda não há despesas neste período.', income: 'Ainda não há rendimentos neste período.' };
  const MODAL_COLOR_PALETTE = ['#3b6fd6', '#d1447a', '#4fae4f', '#e8b93f', '#8b6bb5', '#4fd1c5', '#e5484d', '#5a9e5a', '#a8c8a0', '#7ec6e8', '#6fae7c', '#c94f4f'];

  const state = {
    currentUser: null,
    scope: 'me',
    viewType: 'expense',
    periodType: 'year',
    anchorDate: new Date(),
    rangeFrom: null,
    rangeTo: null,
    categoriesByType: { expense: [], income: [] },
    selectedCategoryId: null,
    formType: 'expense',
    dateOffset: 0,
    editingExpenseId: null,
    viewingCategoryId: null,
    viewingCategoryType: null,
    chartMode: localStorage.getItem('gastos_chart_mode') || 'donut',
    listMode: localStorage.getItem('gastos_list_mode') || 'groups',
    formIncluded: true,
    lastRows: [],
    lastTotal: 0,
  };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function formatMoney(v) {
    const opts = Number.isInteger(v) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return '€ ' + v.toLocaleString('pt-PT', opts);
  }
  function formatSigned(v) {
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return sign + formatMoney(Math.abs(v));
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
    });
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  function showFatalError(message) {
    $('fatal-error-message').textContent = message;
    showView('view-fatal-error');
  }

  function categoryById(id) {
    const all = [...state.categoriesByType.expense, ...state.categoriesByType.income];
    return all.find((c) => c.id === id) || { id, label: id, color: '#8e8e93' };
  }

  function buildParams({ user, from, to, type }) {
    const params = new URLSearchParams();
    if (user) params.set('user', user);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (type) params.set('type', type);
    return params;
  }

  // ---------- toasts ----------
  function showToast(message, type = 'success') {
    const root = $('toast-root');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-leaving');
      setTimeout(() => el.remove(), 220);
    }, 2200);
  }

  // ---------- modals ----------
  function showConfirm(message, confirmLabel) {
    return new Promise((resolve) => {
      $('modal-confirm-message').textContent = message;
      $('modal-confirm-ok').textContent = confirmLabel || 'Eliminar';
      $('modal-category').classList.add('hidden');
      $('modal-confirm').classList.remove('hidden');
      $('modal-overlay').classList.remove('hidden');

      const okBtn = $('modal-confirm-ok');
      const cancelBtn = $('modal-confirm-cancel');
      const overlay = $('modal-overlay');

      function cleanup(result) {
        overlay.classList.add('hidden');
        $('modal-confirm').classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlay);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onOverlay(e) { if (e.target === overlay) cleanup(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlay);
    });
  }

  function showCategoryModal(type) {
    return new Promise((resolve) => {
      const grid = $('modal-category-colors');
      grid.innerHTML = '';
      let selectedColor = MODAL_COLOR_PALETTE[0];
      MODAL_COLOR_PALETTE.forEach((color, i) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'modal-color-swatch' + (i === 0 ? ' selected' : '');
        swatch.style.background = color;
        swatch.addEventListener('click', () => {
          selectedColor = color;
          grid.querySelectorAll('.modal-color-swatch').forEach((s) => s.classList.remove('selected'));
          swatch.classList.add('selected');
        });
        grid.appendChild(swatch);
      });
      $('modal-category-label').value = '';
      $('modal-confirm').classList.add('hidden');
      $('modal-category').classList.remove('hidden');
      $('modal-overlay').classList.remove('hidden');
      setTimeout(() => $('modal-category-label').focus(), 60);

      const createBtn = $('modal-category-create');
      const cancelBtn = $('modal-category-cancel');
      const overlay = $('modal-overlay');
      const labelInput = $('modal-category-label');

      function cleanup(result) {
        overlay.classList.add('hidden');
        $('modal-category').classList.add('hidden');
        createBtn.removeEventListener('click', onCreate);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlay);
        labelInput.removeEventListener('keydown', onKeydown);
        resolve(result);
      }
      function onCreate() {
        const label = labelInput.value.trim();
        if (!label) { labelInput.focus(); return; }
        cleanup({ label, color: selectedColor });
      }
      function onCancel() { cleanup(null); }
      function onOverlay(e) { if (e.target === overlay) cleanup(null); }
      function onKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); onCreate(); } }

      createBtn.addEventListener('click', onCreate);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlay);
      labelInput.addEventListener('keydown', onKeydown);
    });
  }

  // ---------- animated numbers ----------
  function animateNumber(el, from, to, formatFn, duration = 500) {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      el.textContent = formatFn(current);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = formatFn(to);
    }
    requestAnimationFrame(tick);
  }

  function setAnimatedMoney(el, newValue, formatFn) {
    const prev = parseFloat(el.dataset.value || '0');
    el.dataset.value = String(newValue);
    animateNumber(el, prev, newValue, formatFn || formatMoney);
  }

  // ---------- period math ----------
  function startOfWeek(d) { const day = (d.getDay() + 6) % 7; const r = new Date(d); r.setDate(d.getDate() - day); return r; }
  function endOfWeek(d) { const s = startOfWeek(d); const r = new Date(s); r.setDate(s.getDate() + 6); return r; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function startOfYear(d) { return new Date(d.getFullYear(), 0, 1); }
  function endOfYear(d) { return new Date(d.getFullYear(), 11, 31); }

  function periodRange(anchor, type) {
    switch (type) {
      case 'day':
        return { from: fmtDate(anchor), to: fmtDate(anchor), label: `${anchor.getDate()} ${MONTHS_PT[anchor.getMonth()]} ${anchor.getFullYear()}` };
      case 'week': {
        const s = startOfWeek(anchor), e = endOfWeek(anchor);
        return { from: fmtDate(s), to: fmtDate(e), label: `${s.getDate()} - ${e.getDate()} ${MONTHS_PT[e.getMonth()]}` };
      }
      case 'month': {
        const s = startOfMonth(anchor), e = endOfMonth(anchor);
        return { from: fmtDate(s), to: fmtDate(e), label: `${MONTHS_FULL_PT[anchor.getMonth()]} ${anchor.getFullYear()}` };
      }
      case 'year': {
        const s = startOfYear(anchor), e = endOfYear(anchor);
        return { from: fmtDate(s), to: fmtDate(e), label: String(anchor.getFullYear()) };
      }
      case 'range':
        return { from: state.rangeFrom, to: state.rangeTo, label: 'Período' };
      default:
        return { from: fmtDate(anchor), to: fmtDate(anchor), label: '' };
    }
  }

  function shiftAnchor(anchor, type, delta) {
    const d = new Date(anchor);
    if (type === 'day') d.setDate(d.getDate() + delta);
    else if (type === 'week') d.setDate(d.getDate() + 7 * delta);
    else if (type === 'month') d.setMonth(d.getMonth() + delta);
    else if (type === 'year') d.setFullYear(d.getFullYear() + delta);
    return d;
  }

  function trendBuckets(anchor, type, count = 6) {
    const buckets = [];
    for (let i = count - 1; i >= 0; i -= 1) {
      buckets.push(periodRange(shiftAnchor(anchor, type, -i), type));
    }
    return buckets;
  }

  // ---------- rendering ----------
  const CUSTOM_COLOR_PALETTE = MODAL_COLOR_PALETTE;

  function categoryBadgeHtml(cat) {
    if (cat.custom) {
      const letter = escapeHtml((cat.label || '?').trim().charAt(0).toUpperCase());
      return `<span class="cat-icon" style="background:${cat.color}"><span class="cat-initial">${letter}</span></span>`;
    }
    return `<span class="cat-icon" style="background:${cat.color}">${categoryIconSvg(cat.id)}</span>`;
  }

  function renderCategoryGrid(type) {
    const grid = $('category-grid');
    grid.innerHTML = '';
    for (const cat of state.categoriesByType[type]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-option';
      btn.dataset.id = cat.id;
      btn.innerHTML = `${categoryBadgeHtml(cat)}<span class="label">${escapeHtml(cat.label)}</span>`;
      btn.addEventListener('click', () => {
        state.selectedCategoryId = cat.id;
        grid.querySelectorAll('.category-option').forEach((el) => el.classList.remove('selected'));
        btn.classList.add('selected');
      });
      grid.appendChild(btn);
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'category-option';
    addBtn.innerHTML = `<span class="cat-icon cat-icon-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></span><span class="label">Criar</span>`;
    addBtn.addEventListener('click', () => createCustomCategory(type));
    grid.appendChild(addBtn);
  }

  async function createCustomCategory(type) {
    const result = await showCategoryModal(type);
    if (!result) return;
    try {
      const cat = await api('/api/categories', { method: 'POST', body: JSON.stringify({ type, label: result.label, color: result.color }) });
      state.categoriesByType[type] = [...state.categoriesByType[type], cat];
      renderCategoryGrid(type);
      state.selectedCategoryId = cat.id;
      const opt = $('category-grid').querySelector(`[data-id="${cat.id}"]`);
      if (opt) opt.classList.add('selected');
      showToast('Categoria criada');
    } catch (err) {
      showToast('Não foi possível criar a categoria.', 'error');
    }
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderChart(rows, total) {
    state.lastRows = rows;
    state.lastTotal = total;
    if (state.chartMode === 'bar') renderBarChart(rows, total);
    else renderDonut(rows, total);
  }

  function renderBarChart(rows, total) {
    const container = $('bar-chart');
    container.innerHTML = '';
    const max = rows.length ? rows[0].amount : 0;
    rows.forEach((r, i) => {
      const item = document.createElement('div');
      item.className = 'bar-item';
      item.style.animation = `fadeSlideIn 0.3s cubic-bezier(0.16,1,0.3,1) ${i * 0.03}s both`;
      item.innerHTML = `
        <div class="bar-item-top">
          <span class="bar-item-label">${escapeHtml(r.label)}</span>
          <span class="bar-item-amount">${formatMoney(r.amount)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="background:${r.color}"></div></div>
      `;
      container.appendChild(item);
      const fill = item.querySelector('.bar-fill');
      requestAnimationFrame(() => {
        fill.style.width = `${max > 0 ? (r.amount / max) * 100 : 0}%`;
      });
    });
  }

  function renderDonut(rows, total) {
    const svg = $('donut');
    svg.innerHTML = '';
    const r = 50, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
    if (total <= 0) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
      bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', cssVar('--border') || '#2a2a2e'); bg.setAttribute('stroke-width', '12');
      svg.appendChild(bg);
      return;
    }
    const pending = [];
    let offset = 0;
    for (const row of rows) {
      const len = (row.amount / total) * circumference;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', row.color);
      circle.setAttribute('stroke-width', '12');
      circle.setAttribute('stroke-dasharray', `0 ${circumference}`);
      circle.setAttribute('stroke-dashoffset', String(-offset));
      svg.appendChild(circle);
      pending.push({ circle, len });
      offset += len;
    }
    requestAnimationFrame(() => {
      for (const { circle, len } of pending) {
        circle.setAttribute('stroke-dasharray', `${len} ${circumference - len}`);
      }
    });
  }

  function renderTrend(totals) {
    const wrap = $('trend-wrap');
    if (!totals || totals.length < 2 || totals.every((v) => v === 0)) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    const svg = $('trend');
    svg.innerHTML = '';
    const max = Math.max(...totals, 1);
    const stepX = 300 / (totals.length - 1);
    const points = totals.map((v, i) => `${i * stepX},${55 - (v / max) * 50}`);
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    area.setAttribute('points', `0,60 ${points.join(' ')} 300,60`);
    area.setAttribute('fill', '#3b6fd633');
    svg.appendChild(area);
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#3b6fd6');
    polyline.setAttribute('stroke-width', '2.5');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);
  }

  function groupByCategory(expenses, total) {
    const map = {};
    for (const e of expenses) {
      if (!map[e.category]) map[e.category] = { amount: 0, count: 0 };
      map[e.category].amount += e.amount;
      map[e.category].count += 1;
    }
    return Object.entries(map).map(([catId, v]) => ({
      ...categoryById(catId),
      amount: v.amount,
      count: v.count,
      percent: total > 0 ? (v.amount / total) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);
  }

  function renderGroupedList(rows, type) {
    const container = $('category-list');
    container.innerHTML = '';
    rows.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'category-row';
      div.style.animation = `fadeSlideIn 0.3s cubic-bezier(0.16,1,0.3,1) ${i * 0.03}s both`;
      div.innerHTML = `
        ${categoryBadgeHtml(r)}
        <span class="cat-info">
          <span class="cat-name">${escapeHtml(r.label)}</span>
          <span class="cat-meta">${r.percent.toFixed(0)}% · ${r.count} ${r.count === 1 ? 'operação' : 'operações'}</span>
        </span>
        <span class="cat-amount">${formatMoney(r.amount)}</span>
      `;
      div.addEventListener('click', () => openCategoryDetail(r.id, type));
      container.appendChild(div);
    });
  }

  function renderFlatList(expenses, type) {
    const container = $('category-list');
    container.innerHTML = '';
    const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
    sorted.forEach((e, i) => {
      const cat = categoryById(e.category);
      const d = parseDate(e.date);
      const wrapper = document.createElement('div');
      wrapper.className = 'swipe-row';
      wrapper.style.animation = `fadeSlideIn 0.3s cubic-bezier(0.16,1,0.3,1) ${i * 0.02}s both`;

      const bg = document.createElement('div');
      bg.className = 'swipe-bg';
      bg.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/></svg>';

      const row = document.createElement('div');
      row.className = 'category-row' + (e.included === false ? ' is-excluded' : '');
      row.innerHTML = `
        ${categoryBadgeHtml(cat)}
        <span class="cat-info">
          <span class="cat-name">${escapeHtml(e.note || cat.label)}${offTagHtml(e)}</span>
          <span class="cat-meta">${escapeHtml(cat.label)} · ${d.getDate()} ${MONTHS_PT[d.getMonth()]} · ${USER_LABELS[e.user]}</span>
        </span>
        <span class="cat-amount">${formatMoney(e.amount)}</span>
      `;
      row.addEventListener('click', () => openAddView(e));
      attachSwipeToDelete(row, async () => {
        await api(`/api/expenses/${e.id}`, { method: 'DELETE' });
        showToast('Eliminado');
        loadDashboard();
      });
      wrapper.appendChild(bg);
      wrapper.appendChild(row);
      container.appendChild(wrapper);
    });
  }

  function renderCategoryBreakdown(expenses, counted, total, type) {
    const rows = groupByCategory(counted, total);
    $('empty-state-message').textContent = EMPTY_MESSAGE[type];
    $('empty-state').classList.toggle('hidden', (state.listMode === 'date' ? expenses : counted).length > 0);
    if (state.listMode === 'date') {
      renderFlatList(expenses, type);
    } else {
      renderGroupedList(rows, type);
    }
    renderChart(rows, total);
  }

  async function loadDashboard() {
    const { from, to, label } = periodRange(state.anchorDate, state.periodType);
    $('period-label').textContent = label;
    document.querySelectorAll('#period-tabs .ptab').forEach((el) => el.classList.toggle('active', el.dataset.period === state.periodType));
    document.querySelectorAll('#type-tabs .ttab').forEach((el) => el.classList.toggle('active', el.dataset.type === state.viewType));
    $('period-nav').classList.toggle('hidden', state.periodType === 'range');
    $('range-picker').classList.toggle('hidden', state.periodType !== 'range');
    $('total-label').textContent = TOTAL_LABEL[state.viewType];

    if (state.periodType === 'range' && (!state.rangeFrom || !state.rangeTo)) {
      $('donut-wrap').classList.add('hidden');
      $('bar-chart-wrap').classList.add('hidden');
      $('trend-wrap').classList.add('hidden');
      $('category-list').innerHTML = '';
      $('empty-state-message').textContent = EMPTY_MESSAGE[state.viewType];
      $('empty-state').classList.remove('hidden');
      setAnimatedMoney($('total-amount'), 0);
      setAnimatedMoney($('donut-total'), 0);
      return;
    }
    $('donut-wrap').classList.toggle('hidden', state.chartMode !== 'donut');
    $('bar-chart-wrap').classList.toggle('hidden', state.chartMode !== 'bar');

    const userFilter = state.scope === 'me' ? state.currentUser : undefined;
    const effectiveFrom = state.periodType === 'range' ? state.rangeFrom : from;
    const effectiveTo = state.periodType === 'range' ? state.rangeTo : to;

    const [expenseList, incomeList] = await Promise.all([
      api(`/api/expenses?${buildParams({ user: userFilter, from: effectiveFrom, to: effectiveTo, type: 'expense' }).toString()}`),
      api(`/api/expenses?${buildParams({ user: userFilter, from: effectiveFrom, to: effectiveTo, type: 'income' }).toString()}`),
    ]);
    const countedExpenses = countedList(expenseList);
    const countedIncomes = countedList(incomeList);
    const expenseTotal = countedExpenses.reduce((sum, e) => sum + e.amount, 0);
    const incomeTotal = countedIncomes.reduce((sum, e) => sum + e.amount, 0);
    const netBalance = incomeTotal - expenseTotal;

    const activeList = state.viewType === 'income' ? incomeList : expenseList;
    const countedActive = state.viewType === 'income' ? countedIncomes : countedExpenses;
    const activeTotal = state.viewType === 'income' ? incomeTotal : expenseTotal;

    setAnimatedMoney($('total-amount'), activeTotal);
    setAnimatedMoney($('donut-total'), activeTotal);
    setAnimatedMoney($('balance-income'), incomeTotal);
    setAnimatedMoney($('balance-expense'), expenseTotal);
    setAnimatedMoney($('balance-net'), netBalance, formatSigned);
    $('balance-net').classList.toggle('income', netBalance >= 0);
    $('balance-net').classList.toggle('expense', netBalance < 0);
    state.lastExpenses = activeList;
    renderCategoryBreakdown(activeList, countedActive, activeTotal, state.viewType);

    if (state.periodType === 'range') {
      renderTrend(null);
    } else {
      const buckets = trendBuckets(state.anchorDate, state.periodType, 6);
      const spanFrom = buckets[0].from;
      const spanTo = buckets[buckets.length - 1].to;
      const spanList = await api(`/api/expenses?${buildParams({ user: userFilter, from: spanFrom, to: spanTo, type: state.viewType }).toString()}`);
      const totals = buckets.map((b) => countedList(spanList).filter((e) => e.date >= b.from && e.date <= b.to).reduce((s, e) => s + e.amount, 0));
      renderTrend(totals);
    }
  }

  function attachSwipeToDelete(rowEl, onDelete) {
    let startX = 0;
    let currentX = 0;
    let dragging = false;
    const threshold = -76;

    rowEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.t-delete')) return;
      dragging = true;
      startX = e.clientX;
      rowEl.classList.remove('snapping');
      rowEl.classList.add('dragging');
      try { rowEl.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    });
    rowEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      currentX = Math.min(0, e.clientX - startX);
      rowEl.style.transform = `translateX(${currentX}px)`;
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      rowEl.classList.remove('dragging');
      rowEl.classList.add('snapping');
      if (currentX < threshold) {
        rowEl.style.transform = 'translateX(-100%)';
        setTimeout(onDelete, 180);
      } else {
        rowEl.style.transform = 'translateX(0)';
      }
      currentX = 0;
    }
    rowEl.addEventListener('pointerup', endDrag);
    rowEl.addEventListener('pointercancel', endDrag);
  }

  async function openCategoryDetail(categoryId, type) {
    state.viewingCategoryId = categoryId;
    state.viewingCategoryType = type;
    const cat = categoryById(categoryId);
    $('category-title').textContent = cat.label;
    const { from, to } = periodRange(state.anchorDate, state.periodType);
    const userFilter = state.scope === 'me' ? state.currentUser : undefined;
    const effectiveFrom = state.periodType === 'range' ? state.rangeFrom : from;
    const effectiveTo = state.periodType === 'range' ? state.rangeTo : to;
    const expenses = await api(`/api/expenses?${buildParams({ user: userFilter, from: effectiveFrom, to: effectiveTo, type }).toString()}`);
    const filtered = expenses.filter((e) => e.category === categoryId);
    const list = $('category-transactions');
    list.innerHTML = '';
    filtered.forEach((e, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'swipe-row';
      wrapper.style.animation = `fadeSlideIn 0.3s cubic-bezier(0.16,1,0.3,1) ${i * 0.03}s both`;

      const bg = document.createElement('div');
      bg.className = 'swipe-bg';
      bg.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/></svg>';

      const row = document.createElement('div');
      row.className = 'transaction-row' + (e.included === false ? ' is-excluded' : '');
      const d = parseDate(e.date);
      row.innerHTML = `
        <span class="t-info">
          <span class="t-note">${escapeHtml(e.note || cat.label)}${offTagHtml(e)}</span>
          <span class="t-date">${d.getDate()} ${MONTHS_PT[d.getMonth()]} · <span class="t-user">${USER_LABELS[e.user]}</span></span>
        </span>
        <span class="t-amount">${formatMoney(e.amount)}</span>
        <button class="t-delete" aria-label="Eliminar" data-id="${e.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/></svg>
        </button>
      `;

      async function doDelete() {
        await api(`/api/expenses/${e.id}`, { method: 'DELETE' });
        showToast('Eliminado');
        openCategoryDetail(categoryId, type);
        loadDashboard();
      }

      row.querySelector('.t-info').addEventListener('click', () => openAddView(e));
      row.querySelector('.t-delete').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const ok = await showConfirm('Eliminar este registo?');
        if (!ok) return;
        doDelete();
      });
      attachSwipeToDelete(row, doDelete);

      wrapper.appendChild(bg);
      wrapper.appendChild(row);
      list.appendChild(wrapper);
    });
    showView('view-category');
  }

  function setIncluded(value) {
    state.formIncluded = value;
    const sw = $('include-switch');
    sw.classList.toggle('on', value);
    sw.setAttribute('aria-checked', String(value));
  }

  function countedList(list) {
    return state.scope === 'all' ? list.filter((e) => e.included !== false) : list;
  }

  function offTagHtml(e) {
    return e.included === false ? '<span class="off-tag">fora de ambos</span>' : '';
  }

  function setFormType(type) {
    state.formType = type;
    document.querySelectorAll('#type-quick .ttab').forEach((c) => c.classList.toggle('active', c.dataset.type === type));
    renderCategoryGrid(type);
  }

  function openAddView(expense) {
    $('form-error').classList.add('hidden');
    if (expense) {
      state.editingExpenseId = expense.id;
      const type = expense.type || 'expense';
      setFormType(type);
      $('add-title').textContent = EDIT_TITLE[type];
      $('add-delete').classList.remove('hidden');
      $('amount-input').value = expense.amount;
      $('note-input').value = expense.note || '';
      $('date-input').value = expense.date;
      $('date-input').classList.remove('hidden');
      document.querySelectorAll('#date-quick .chip').forEach((c) => c.classList.remove('active'));
      state.selectedCategoryId = expense.category;
      setIncluded(expense.included !== false);
      const opt = $('category-grid').querySelector(`[data-id="${expense.category}"]`);
      if (opt) opt.classList.add('selected');
    } else {
      state.editingExpenseId = null;
      setIncluded(true);
      const type = state.viewingCategoryType || state.viewType;
      setFormType(type);
      $('add-title').textContent = NEW_TITLE[type];
      $('add-delete').classList.add('hidden');
      $('amount-input').value = '';
      $('note-input').value = '';
      state.selectedCategoryId = state.viewingCategoryId || null;
      if (state.selectedCategoryId) {
        const opt = $('category-grid').querySelector(`[data-id="${state.selectedCategoryId}"]`);
        if (opt) opt.classList.add('selected');
      }
      state.dateOffset = 0;
      document.querySelectorAll('#date-quick .chip').forEach((c) => c.classList.toggle('active', c.dataset.offset === '0'));
      $('date-input').classList.add('hidden');
      const today = new Date();
      $('date-input').value = fmtDate(today);
    }
    showView('view-add');
    $('amount-input').focus();
  }

  // ---------- wiring ----------
  async function init() {
    try {
      const session = await api('/api/session');
      if (!session.authenticated) {
        showView('view-login');
        wireLogin();
        return;
      }
    } catch (e) {
      showView('view-login');
      wireLogin();
      return;
    }

    let expenseCats;
    let incomeCats;
    try {
      [expenseCats, incomeCats] = await Promise.all([
        api('/api/categories?type=expense'),
        api('/api/categories?type=income'),
      ]);
    } catch (e) {
      showFatalError('Não foi possível carregar os dados. Verifica a ligação e tenta novamente.');
      return;
    }
    state.categoriesByType = { expense: expenseCats, income: incomeCats };
    renderCategoryGrid('expense');

    const savedUser = sessionStorage.getItem('gastos_user');
    if (savedUser) {
      state.currentUser = savedUser;
      enterDashboard();
    } else {
      showView('view-user');
    }
    wireUserSelect();
    wireDashboard();
    wireAddForm();
    wireCategoryDetail();
  }

  function wireLogin() {
    $('show-password-toggle').addEventListener('change', (e) => {
      $('login-password').type = e.target.checked ? 'text' : 'password';
    });

    $('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('login-error').classList.add('hidden');
      try {
        const password = $('login-password').value.trim();
        await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
        location.reload();
      } catch (err) {
        $('login-error').textContent = err.status === 401
          ? 'Palavra-passe incorreta.'
          : 'Não foi possível ligar ao servidor. Confirma que a app está a correr (npm start) e que abriste http://localhost:3000, não o ficheiro index.html diretamente.';
        $('login-error').classList.remove('hidden');
      }
    });
  }

  function wireUserSelect() {
    document.querySelectorAll('.user-card').forEach((card) => {
      card.addEventListener('click', () => {
        state.currentUser = card.dataset.user;
        sessionStorage.setItem('gastos_user', state.currentUser);
        enterDashboard();
      });
    });
  }

  function enterDashboard() {
    $('current-user-label').textContent = USER_LABELS[state.currentUser];
    showView('view-dashboard');
    loadDashboard();
  }

  function wireDashboard() {
    $('switch-user-btn').addEventListener('click', () => {
      sessionStorage.removeItem('gastos_user');
      showView('view-user');
    });

    $('who-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-scope]');
      if (!btn) return;
      state.scope = btn.dataset.scope;
      document.querySelectorAll('#who-filter .chip').forEach((c) => c.classList.toggle('active', c === btn));
      loadDashboard();
    });

    $('type-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      state.viewType = btn.dataset.type;
      loadDashboard();
    });

    document.querySelectorAll('#chart-toggle .chart-toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.chartMode));
    $('donut-wrap').classList.toggle('hidden', state.chartMode !== 'donut');
    $('bar-chart-wrap').classList.toggle('hidden', state.chartMode !== 'bar');
    $('chart-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      state.chartMode = btn.dataset.mode;
      localStorage.setItem('gastos_chart_mode', state.chartMode);
      document.querySelectorAll('#chart-toggle .chart-toggle-btn').forEach((b) => b.classList.toggle('active', b === btn));
      $('donut-wrap').classList.toggle('hidden', state.chartMode !== 'donut');
      $('bar-chart-wrap').classList.toggle('hidden', state.chartMode !== 'bar');
      renderChart(state.lastRows, state.lastTotal);
    });

    document.querySelectorAll('#list-mode-toggle .chip').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.listMode));
    $('list-mode-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      state.listMode = btn.dataset.mode;
      localStorage.setItem('gastos_list_mode', state.listMode);
      document.querySelectorAll('#list-mode-toggle .chip').forEach((b) => b.classList.toggle('active', b === btn));
      if (state.listMode === 'date') {
        renderFlatList(state.lastExpenses || [], state.viewType);
      } else {
        renderGroupedList(state.lastRows || [], state.viewType);
      }
    });

    $('period-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-period]');
      if (!btn) return;
      state.periodType = btn.dataset.period;
      state.anchorDate = new Date();
      if (state.periodType === 'range' && !state.rangeFrom) {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 30);
        state.rangeFrom = fmtDate(from);
        state.rangeTo = fmtDate(to);
        $('range-from').value = state.rangeFrom;
        $('range-to').value = state.rangeTo;
      }
      loadDashboard();
    });

    $('period-prev').addEventListener('click', () => {
      state.anchorDate = shiftAnchor(state.anchorDate, state.periodType, -1);
      loadDashboard();
    });
    $('period-next').addEventListener('click', () => {
      state.anchorDate = shiftAnchor(state.anchorDate, state.periodType, 1);
      loadDashboard();
    });

    $('range-from').addEventListener('change', (e) => { state.rangeFrom = e.target.value; loadDashboard(); });
    $('range-to').addEventListener('change', (e) => { state.rangeTo = e.target.value; loadDashboard(); });

    $('fab-add').addEventListener('click', () => {
      state.viewingCategoryId = null;
      state.viewingCategoryType = null;
      openAddView(null);
    });

    $('export-btn').addEventListener('click', () => {
      const { from, to } = periodRange(state.anchorDate, state.periodType);
      const effectiveFrom = state.periodType === 'range' ? state.rangeFrom : from;
      const effectiveTo = state.periodType === 'range' ? state.rangeTo : to;
      const userFilter = state.scope === 'me' ? state.currentUser : undefined;
      const params = buildParams({ user: userFilter, from: effectiveFrom, to: effectiveTo });
      window.location.href = `/api/report.xlsx?${params.toString()}`;
    });
  }

  function wireCategoryDetail() {
    $('category-back').addEventListener('click', () => showView('view-dashboard'));
  }

  function wireAddForm() {
    $('add-back').addEventListener('click', () => {
      showView(state.viewingCategoryId ? 'view-category' : 'view-dashboard');
    });

    $('include-switch').addEventListener('click', () => setIncluded(!state.formIncluded));

    $('type-quick').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn || state.editingExpenseId) return;
      state.selectedCategoryId = null;
      setFormType(btn.dataset.type);
      $('add-title').textContent = NEW_TITLE[btn.dataset.type];
    });

    $('date-quick').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-offset]');
      if (!btn) return;
      document.querySelectorAll('#date-quick .chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.offset === 'custom') {
        $('date-input').classList.remove('hidden');
      } else {
        $('date-input').classList.add('hidden');
        const d = new Date();
        d.setDate(d.getDate() - Number(btn.dataset.offset));
        $('date-input').value = fmtDate(d);
      }
    });

    $('add-delete').addEventListener('click', async () => {
      if (!state.editingExpenseId) return;
      const ok = await showConfirm('Eliminar este registo?');
      if (!ok) return;
      await api(`/api/expenses/${state.editingExpenseId}`, { method: 'DELETE' });
      showToast('Eliminado');
      showView(state.viewingCategoryId ? 'view-category' : 'view-dashboard');
      if (state.viewingCategoryId) openCategoryDetail(state.viewingCategoryId, state.viewingCategoryType);
      loadDashboard();
    });

    $('expense-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('form-error').classList.add('hidden');
      if (!state.selectedCategoryId) {
        $('form-error').textContent = 'Escolhe uma categoria.';
        $('form-error').classList.remove('hidden');
        return;
      }
      const payload = {
        user: state.currentUser,
        category: state.selectedCategoryId,
        amount: parseFloat($('amount-input').value),
        date: $('date-input').value,
        note: $('note-input').value,
        type: state.formType,
        included: state.formIncluded,
      };
      const isEdit = Boolean(state.editingExpenseId);
      try {
        if (isEdit) {
          await api(`/api/expenses/${state.editingExpenseId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
        }
        showToast(isEdit ? 'Atualizado' : 'Guardado');
        showView(state.viewingCategoryId ? 'view-category' : 'view-dashboard');
        if (state.viewingCategoryId) openCategoryDetail(state.viewingCategoryId, state.viewingCategoryType);
        loadDashboard();
      } catch (err) {
        $('form-error').textContent = 'Não foi possível guardar. Tenta de novo.';
        $('form-error').classList.remove('hidden');
      }
    });
  }

  $('fatal-error-retry').addEventListener('click', () => location.reload());

  init();
})();
