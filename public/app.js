(() => {
  const USER_LABELS = { edgar: 'Edgar', nelia: 'Nélia' };
  const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTHS_FULL_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const state = {
    currentUser: null,
    scope: 'me',
    periodType: 'year',
    anchorDate: new Date(),
    rangeFrom: null,
    rangeTo: null,
    categories: [],
    selectedCategoryId: null,
    dateOffset: 0,
    editingExpenseId: null,
    viewingCategoryId: null,
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

  function categoryById(id) {
    return state.categories.find((c) => c.id === id) || { id, label: id, color: '#8e8e93' };
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
  function renderCategoryGrid() {
    const grid = $('category-grid');
    grid.innerHTML = '';
    for (const cat of state.categories) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-option';
      btn.dataset.id = cat.id;
      btn.innerHTML = `<span class="cat-icon" style="background:${cat.color}">${categoryIconSvg(cat.id)}</span><span class="label">${cat.label}</span>`;
      btn.addEventListener('click', () => {
        state.selectedCategoryId = cat.id;
        grid.querySelectorAll('.category-option').forEach((el) => el.classList.remove('selected'));
        btn.classList.add('selected');
      });
      grid.appendChild(btn);
    }
  }

  function renderDonut(rows, total) {
    const svg = $('donut');
    svg.innerHTML = '';
    const r = 50, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
    if (total <= 0) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
      bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', '#2a2a2e'); bg.setAttribute('stroke-width', '12');
      svg.appendChild(bg);
      return;
    }
    let offset = 0;
    for (const row of rows) {
      const len = (row.amount / total) * circumference;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', row.color);
      circle.setAttribute('stroke-width', '12');
      circle.setAttribute('stroke-dasharray', `${len} ${circumference - len}`);
      circle.setAttribute('stroke-dashoffset', String(-offset));
      svg.appendChild(circle);
      offset += len;
    }
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

  function renderCategoryBreakdown(expenses, total) {
    const map = {};
    for (const e of expenses) {
      if (!map[e.category]) map[e.category] = { amount: 0, count: 0 };
      map[e.category].amount += e.amount;
      map[e.category].count += 1;
    }
    const rows = Object.entries(map).map(([catId, v]) => ({
      ...categoryById(catId),
      amount: v.amount,
      count: v.count,
      percent: total > 0 ? (v.amount / total) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);

    const container = $('category-list');
    container.innerHTML = '';
    $('empty-state').classList.toggle('hidden', rows.length > 0);
    for (const r of rows) {
      const div = document.createElement('div');
      div.className = 'category-row';
      div.innerHTML = `
        <span class="cat-icon" style="background:${r.color}">${categoryIconSvg(r.id)}</span>
        <span class="cat-info">
          <span class="cat-name">${r.label}</span>
          <span class="cat-meta">${r.percent.toFixed(0)}% · ${r.count} ${r.count === 1 ? 'operação' : 'operações'}</span>
        </span>
        <span class="cat-amount">${formatMoney(r.amount)}</span>
      `;
      div.addEventListener('click', () => openCategoryDetail(r.id));
      container.appendChild(div);
    }
    renderDonut(rows, total);
  }

  async function loadDashboard() {
    const { from, to, label } = periodRange(state.anchorDate, state.periodType);
    $('period-label').textContent = label;
    document.querySelectorAll('#period-tabs .ptab').forEach((el) => el.classList.toggle('active', el.dataset.period === state.periodType));
    $('period-nav').classList.toggle('hidden', state.periodType === 'range');
    $('range-picker').classList.toggle('hidden', state.periodType !== 'range');

    if (state.periodType === 'range' && (!state.rangeFrom || !state.rangeTo)) {
      $('donut-wrap').classList.add('hidden');
      $('trend-wrap').classList.add('hidden');
      $('category-list').innerHTML = '';
      $('empty-state').classList.remove('hidden');
      $('total-amount').textContent = formatMoney(0);
      $('donut-total').textContent = formatMoney(0);
      return;
    }
    $('donut-wrap').classList.remove('hidden');

    const userFilter = state.scope === 'me' ? state.currentUser : undefined;
    const params = new URLSearchParams();
    if (userFilter) params.set('user', userFilter);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const expenses = await api(`/api/expenses?${params.toString()}`);
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    $('total-amount').textContent = formatMoney(total);
    $('donut-total').textContent = formatMoney(total);
    renderCategoryBreakdown(expenses, total);

    if (state.periodType === 'range') {
      renderTrend(null);
    } else {
      const buckets = trendBuckets(state.anchorDate, state.periodType, 6);
      const spanFrom = buckets[0].from;
      const spanTo = buckets[buckets.length - 1].to;
      const spanParams = new URLSearchParams();
      if (userFilter) spanParams.set('user', userFilter);
      spanParams.set('from', spanFrom);
      spanParams.set('to', spanTo);
      const spanExpenses = await api(`/api/expenses?${spanParams.toString()}`);
      const totals = buckets.map((b) => spanExpenses.filter((e) => e.date >= b.from && e.date <= b.to).reduce((s, e) => s + e.amount, 0));
      renderTrend(totals);
    }
  }

  async function openCategoryDetail(categoryId) {
    state.viewingCategoryId = categoryId;
    const cat = categoryById(categoryId);
    $('category-title').textContent = cat.label;
    const { from, to } = periodRange(state.anchorDate, state.periodType);
    const userFilter = state.scope === 'me' ? state.currentUser : undefined;
    const params = new URLSearchParams();
    if (userFilter) params.set('user', userFilter);
    params.set('from', state.periodType === 'range' ? state.rangeFrom : from);
    params.set('to', state.periodType === 'range' ? state.rangeTo : to);
    const expenses = await api(`/api/expenses?${params.toString()}`);
    const filtered = expenses.filter((e) => e.category === categoryId);
    const list = $('category-transactions');
    list.innerHTML = '';
    for (const e of filtered) {
      const row = document.createElement('div');
      row.className = 'transaction-row';
      const d = parseDate(e.date);
      row.innerHTML = `
        <span class="t-info">
          <span class="t-note">${escapeHtml(e.note || cat.label)}</span>
          <span class="t-date">${d.getDate()} ${MONTHS_PT[d.getMonth()]} · <span class="t-user">${USER_LABELS[e.user]}</span></span>
        </span>
        <span class="t-amount">${formatMoney(e.amount)}</span>
        <button class="t-delete" aria-label="Eliminar" data-id="${e.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"/></svg>
        </button>
      `;
      row.querySelector('.t-info').addEventListener('click', () => openAddView(e));
      row.querySelector('.t-delete').addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (!confirm('Eliminar esta despesa?')) return;
        await api(`/api/expenses/${e.id}`, { method: 'DELETE' });
        openCategoryDetail(categoryId);
        loadDashboard();
      });
      list.appendChild(row);
    }
    showView('view-category');
  }

  function openAddView(expense) {
    $('form-error').classList.add('hidden');
    const grid = $('category-grid');
    grid.querySelectorAll('.category-option').forEach((el) => el.classList.remove('selected'));
    if (expense) {
      state.editingExpenseId = expense.id;
      $('add-title').textContent = 'Editar despesa';
      $('add-delete').classList.remove('hidden');
      $('amount-input').value = expense.amount;
      $('note-input').value = expense.note || '';
      $('date-input').value = expense.date;
      $('date-input').classList.remove('hidden');
      document.querySelectorAll('#date-quick .chip').forEach((c) => c.classList.remove('active'));
      state.selectedCategoryId = expense.category;
      const opt = grid.querySelector(`[data-id="${expense.category}"]`);
      if (opt) opt.classList.add('selected');
    } else {
      state.editingExpenseId = null;
      $('add-title').textContent = 'Nova despesa';
      $('add-delete').classList.add('hidden');
      $('amount-input').value = '';
      $('note-input').value = '';
      state.selectedCategoryId = state.viewingCategoryId || null;
      if (state.selectedCategoryId) {
        const opt = grid.querySelector(`[data-id="${state.selectedCategoryId}"]`);
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
    let categories = [];
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

    categories = await api('/api/categories');
    state.categories = categories;
    renderCategoryGrid();

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
    $('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('login-error').classList.add('hidden');
      try {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('login-password').value }) });
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

    $('fab-add').addEventListener('click', () => { state.viewingCategoryId = null; openAddView(null); });
  }

  function wireCategoryDetail() {
    $('category-back').addEventListener('click', () => showView('view-dashboard'));
  }

  function wireAddForm() {
    $('add-back').addEventListener('click', () => {
      showView(state.viewingCategoryId ? 'view-category' : 'view-dashboard');
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
      if (!confirm('Eliminar esta despesa?')) return;
      await api(`/api/expenses/${state.editingExpenseId}`, { method: 'DELETE' });
      showView(state.viewingCategoryId ? 'view-category' : 'view-dashboard');
      if (state.viewingCategoryId) openCategoryDetail(state.viewingCategoryId);
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
      };
      try {
        if (state.editingExpenseId) {
          await api(`/api/expenses/${state.editingExpenseId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
        }
        showView(state.viewingCategoryId ? 'view-category' : 'view-dashboard');
        if (state.viewingCategoryId) openCategoryDetail(state.viewingCategoryId);
        loadDashboard();
      } catch (err) {
        $('form-error').textContent = 'Não foi possível guardar. Tenta de novo.';
        $('form-error').classList.remove('hidden');
      }
    });
  }

  init();
})();
