(() => {
  const USER_LABELS = { edgar: 'Edgar', nelia: 'Nélia' };
  const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTHS_FULL_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const TOTAL_LABEL = { expense: 'Total gasto', income: 'Total recebido' };
  const NEW_TITLE = { expense: 'Nova despesa', income: 'Novo rendimento' };
  const EDIT_TITLE = { expense: 'Editar despesa', income: 'Editar rendimento' };

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

  const CUSTOM_COLOR_PALETTE = ['#3b6fd6', '#d1447a', '#4fae4f', '#e8b93f', '#8b6bb5', '#4fd1c5', '#e5484d', '#5a9e5a'];

  function categoryBadgeHtml(cat) {
    if (cat.custom) {
      const letter = escapeHtml((cat.label || '?').trim().charAt(0).toUpperCase());
      return `<span class="cat-icon" style="background:${cat.color}"><span class="cat-initial">${letter}</span></span>`;
    }
    return `<span class="cat-icon" style="background:${cat.color}">${categoryIconSvg(cat.id)}</span>`;
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
    const label = prompt(type === 'income' ? 'Nome da nova categoria de rendimento:' : 'Nome da nova categoria de despesa:');
    if (!label || !label.trim()) return;
    const existingCustomCount = state.categoriesByType[type].filter((c) => c.custom).length;
    const color = CUSTOM_COLOR_PALETTE[existingCustomCount % CUSTOM_COLOR_PALETTE.length];
    try {
      const cat = await api('/api/categories', { method: 'POST', body: JSON.stringify({ type, label: label.trim(), color }) });
      state.categoriesByType[type] = [...state.categoriesByType[type], cat];
      renderCategoryGrid(type);
      state.selectedCategoryId = cat.id;
      const opt = $('category-grid').querySelector(`[data-id="${cat.id}"]`);
      if (opt) opt.classList.add('selected');
    } catch (err) {
      alert('Não foi possível criar a categoria. Tenta de novo.');
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

  function renderCategoryBreakdown(expenses, total, type) {
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
        ${categoryBadgeHtml(r)}
        <span class="cat-info">
          <span class="cat-name">${r.label}</span>
          <span class="cat-meta">${r.percent.toFixed(0)}% · ${r.count} ${r.count === 1 ? 'operação' : 'operações'}</span>
        </span>
        <span class="cat-amount">${formatMoney(r.amount)}</span>
      `;
      div.addEventListener('click', () => openCategoryDetail(r.id, type));
      container.appendChild(div);
    }
    renderDonut(rows, total);
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
      $('trend-wrap').classList.add('hidden');
      $('category-list').innerHTML = '';
      $('empty-state').classList.remove('hidden');
      $('total-amount').textContent = formatMoney(0);
      $('donut-total').textContent = formatMoney(0);
      $('balance-income').textContent = formatMoney(0);
      $('balance-expense').textContent = formatMoney(0);
      $('balance-net').textContent = formatMoney(0);
      return;
    }
    $('donut-wrap').classList.remove('hidden');

    const userFilter = state.scope === 'me' ? state.currentUser : undefined;
    const effectiveFrom = state.periodType === 'range' ? state.rangeFrom : from;
    const effectiveTo = state.periodType === 'range' ? state.rangeTo : to;

    const [expenseList, incomeList] = await Promise.all([
      api(`/api/expenses?${buildParams({ user: userFilter, from: effectiveFrom, to: effectiveTo, type: 'expense' }).toString()}`),
      api(`/api/expenses?${buildParams({ user: userFilter, from: effectiveFrom, to: effectiveTo, type: 'income' }).toString()}`),
    ]);
    const expenseTotal = expenseList.reduce((sum, e) => sum + e.amount, 0);
    const incomeTotal = incomeList.reduce((sum, e) => sum + e.amount, 0);
    const netBalance = incomeTotal - expenseTotal;

    const activeList = state.viewType === 'income' ? incomeList : expenseList;
    const activeTotal = state.viewType === 'income' ? incomeTotal : expenseTotal;

    $('total-amount').textContent = formatMoney(activeTotal);
    $('donut-total').textContent = formatMoney(activeTotal);
    $('balance-income').textContent = formatMoney(incomeTotal);
    $('balance-expense').textContent = formatMoney(expenseTotal);
    $('balance-net').textContent = formatSigned(netBalance);
    $('balance-net').classList.toggle('income', netBalance >= 0);
    $('balance-net').classList.toggle('expense', netBalance < 0);
    renderCategoryBreakdown(activeList, activeTotal, state.viewType);

    if (state.periodType === 'range') {
      renderTrend(null);
    } else {
      const buckets = trendBuckets(state.anchorDate, state.periodType, 6);
      const spanFrom = buckets[0].from;
      const spanTo = buckets[buckets.length - 1].to;
      const spanList = await api(`/api/expenses?${buildParams({ user: userFilter, from: spanFrom, to: spanTo, type: state.viewType }).toString()}`);
      const totals = buckets.map((b) => spanList.filter((e) => e.date >= b.from && e.date <= b.to).reduce((s, e) => s + e.amount, 0));
      renderTrend(totals);
    }
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
        if (!confirm('Eliminar este registo?')) return;
        await api(`/api/expenses/${e.id}`, { method: 'DELETE' });
        openCategoryDetail(categoryId, type);
        loadDashboard();
      });
      list.appendChild(row);
    }
    showView('view-category');
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
      const opt = $('category-grid').querySelector(`[data-id="${expense.category}"]`);
      if (opt) opt.classList.add('selected');
    } else {
      state.editingExpenseId = null;
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
      if (!confirm('Eliminar este registo?')) return;
      await api(`/api/expenses/${state.editingExpenseId}`, { method: 'DELETE' });
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
      };
      try {
        if (state.editingExpenseId) {
          await api(`/api/expenses/${state.editingExpenseId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
        }
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
