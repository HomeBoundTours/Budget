/* =========================================================
   app.js - UI rendering, navigation, and actions
   ========================================================= */

let selExpAcct = null, selExpCat = null;
let calYear, calMonth;
const _now = new Date();
calYear = _now.getFullYear(); calMonth = _now.getMonth();

/* ---------- theme ---------- */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.settings.theme || 'light');
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = state.settings.theme === 'dark' ? '☀' : '☾';
}
function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  save(); applyTheme(); renderAll();
}

/* ---------- navigation ---------- */
const BAR_TABS = ['dashboard', 'calendar', 'insights'];
function show(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === tab));
  document.querySelectorAll('.bottom-nav button[data-tab]').forEach(b => {
    const on = b.dataset.tab === tab || (b.dataset.tab === 'more' && !BAR_TABS.includes(tab));
    b.classList.toggle('active', on);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}
function quickJump(tab) { show(tab); }

/* ---------- quick-add sheet ---------- */
let selQAcct = null, selQCat = null;
function openQuickAdd() {
  if (selQAcct === null || !acctById(selQAcct)) selQAcct = state.accounts[0] ? state.accounts[0].id : null;
  if (selQCat === null || !state.categories.includes(selQCat)) selQCat = state.categories[0] || null;
  renderQuickChips();
  document.getElementById('quickAdd').classList.add('open');
  setTimeout(() => { const f = document.getElementById('qAmount'); if (f) f.focus(); }, 120);
}
function closeQuickAdd() { document.getElementById('quickAdd').classList.remove('open'); }
function renderQuickChips() {
  document.getElementById('qAcctChips').innerHTML = state.accounts.map(a =>
    `<div class="chip acc ${a.id === selQAcct ? 'active' : ''}" onclick="selQAcct='${a.id}';renderQuickChips()">${esc(a.name)}</div>`).join('');
  document.getElementById('qCatChips').innerHTML = state.categories.map(c =>
    `<div class="chip ${c === selQCat ? 'active' : ''}" onclick="selQCat='${escq(c)}';renderQuickChips()">${esc(c)}</div>`).join('');
}
function quickSave() {
  const amt = parseFloat(document.getElementById('qAmount').value);
  if (!amt || amt <= 0) return toast('Enter an amount');
  if (!selQAcct) return toast('Pick an account');
  state.transactions.push({ id: uid(), type: 'expense', amount: round2(amt), accountId: selQAcct,
    category: selQCat, note: '', date: todayISO() });
  save();
  document.getElementById('qAmount').value = '';
  closeQuickAdd();
  toast(money(amt) + ' · ' + selQCat + ' saved', 'success');
  renderAll();
}

/* ---------- more sheet ---------- */
function openMore() { document.getElementById('moreSheet').classList.add('open'); }
function closeMore() { document.getElementById('moreSheet').classList.remove('open'); }
function moreGo(tab) { closeMore(); show(tab); }

/* ---------- detailed-add collapse ---------- */
function toggleExpMore() {
  const row = document.getElementById('expMoreRow');
  const open = row.style.display === 'none';
  row.style.display = open ? 'grid' : 'none';
  document.getElementById('expMoreToggle').textContent = open ? '– Hide date & note' : '+ Date & note';
}

/* ---------- master render ---------- */
function renderAll() {
  renderDueBanner();
  renderAvailToday();
  renderDashboard();
  renderAddForm();
  renderPaycheck();
  renderInsights();
  renderPlan();
  renderCalendar();
  renderRecurringLists();
  renderTxFilters();
  renderTx();
  renderSettings();
}

/* ---------- available to spend today ---------- */
function availCardHTML() {
  const a = availableToday();
  if (!a) {
    return `<div class="avail empty-plan" onclick="moreGo('plan')">
      <div><div class="avail-lbl">Daily spending</div><div class="avail-cta">Build your budget plan →</div></div>
      <div class="avail-hint">Get a daily number with rollover</div></div>`;
  }
  const neg = a.available < 0;
  const carryTxt = a.carryIn >= 0 ? 'rolled in ' + money(a.carryIn) : 'carried deficit ' + money(a.carryIn);
  return `<div class="avail ${neg ? 'neg' : 'pos'}">
    <div class="avail-top">
      <div class="avail-lbl">Available to spend today</div>
      <button class="avail-edit" onclick="moreGo('plan')">Adjust</button>
    </div>
    <div class="avail-amt">${money(a.available)}</div>
    <div class="avail-sub">Daily budget ${money(a.daily)} · ${carryTxt} · spent today ${money(a.todaySpent)}</div>
  </div>`;
}
function renderAvailToday() {
  const h = availCardHTML();
  const a = document.getElementById('availToday'); if (a) a.innerHTML = h;
  const b = document.getElementById('availTodayIns'); if (b) b.innerHTML = h;
}

/* ---------- budget plan / advisor ---------- */
function renderPlan() {
  const inc = document.getElementById('planIncome');
  if (inc && document.activeElement !== inc) inc.value = state.plan.income || '';
  const est = estMonthlyIncomeFromPaydays();
  const estEl = document.getElementById('planEst');
  if (estEl) estEl.innerHTML = est > 0 ? `<a class="more-link" onclick="useEstIncome()">Use scheduled paydays (~${money(est)}/mo)</a>` : '';

  const list = document.getElementById('planExpList');
  if (list) {
    const items = state.plan.monthlyExpenses || [];
    list.innerHTML = items.length
      ? items.map(e => `<div class="listrow"><div class="grow">${esc(e.name)}</div>
          <div class="amt out">${money(e.amount)}</div>
          <button class="del" onclick="removeMonthlyExpense('${e.id}')">×</button></div>`).join('')
        + `<div class="listrow"><div class="grow"><b>Total fixed</b></div><div class="amt"><b>${money(planFixedMonthly())}</b></div></div>`
      : '<div class="empty">No monthly expenses added yet.</div>';
  }
  const sum = document.getElementById('planSummary');
  if (sum) sum.innerHTML = `Income <b>${money(planIncome())}</b> − fixed <b>${money(planFixedMonthly())}</b> = <b>${money(planDiscretionary())}</b> discretionary / month`;

  const cards = document.getElementById('tierCards');
  if (cards) cards.innerHTML = ['aggressive', 'base', 'conservative'].map(k => {
    const c = tierCalc(k); const active = state.plan.tier === k;
    return `<div class="tier ${active ? 'active' : ''}">
      <div class="tier-h"><span class="tier-name">${c.label}</span><span class="tier-rate">save ${Math.round(c.rate * 100)}%</span></div>
      <div class="tier-daily">${money(c.daily)}<span>per day to spend</span></div>
      <div class="tier-rows">
        <div><span>Save / month</span><b>${money(c.monthlySave)}</b></div>
        <div><span>Saved in 1 year</span><b class="save">${money(c.annualSave)}</b></div>
      </div>
      <button class="btn ${active ? 'nav' : ''} sm full" onclick="chooseTier('${k}')">${active ? 'Active plan ✓' : 'Use this plan'}</button>
    </div>`;
  }).join('');
}
function setPlanIncome(v) { state.plan.income = parseFloat(v) || 0; save(); renderPlan(); renderAvailToday(); }
function useEstIncome() { state.plan.income = estMonthlyIncomeFromPaydays(); save(); renderPlan(); renderAvailToday(); }
function addMonthlyExpense() {
  const n = document.getElementById('mexName').value.trim();
  const a = parseFloat(document.getElementById('mexAmount').value);
  if (!n || !a || a <= 0) return toast('Enter a name and amount');
  state.plan.monthlyExpenses.push({ id: uid(), name: n, amount: round2(a) });
  save();
  document.getElementById('mexName').value = ''; document.getElementById('mexAmount').value = '';
  renderPlan();
}
function removeMonthlyExpense(id) { state.plan.monthlyExpenses = state.plan.monthlyExpenses.filter(e => e.id !== id); save(); renderPlan(); }
function chooseTier(k) {
  if (planIncome() <= 0) return toast('Enter your monthly income first');
  state.plan.tier = k;
  state.plan.startDate = todayISO();   // rollover begins today
  save();
  toast(TIERS[k].label + ' plan active — ' + money(tierCalc(k).daily) + '/day', 'success');
  renderAll();
}

/* ---------- due / automation banner ---------- */
function autoPostDue() {
  let posted = 0;
  state.recurring.forEach(item => {
    if (!item.autopost) return;
    const due = dueOccurrences(item);
    due.forEach(d => { postOccurrence(item, d); posted++; });
    if (due.length) item.lastPosted = due[due.length - 1];
  });
  if (posted) save();
  return posted;
}
function renderDueBanner() {
  const el = document.getElementById('dueBanner');
  if (!el) return;
  const due = collectDue();
  if (!due.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const count = due.reduce((s, d) => s + d.dates.length, 0);
  el.style.display = 'flex';
  el.innerHTML = `<div><b>${count}</b> scheduled item${count > 1 ? 's' : ''} due
      <span class="muted">- ${due.map(d => esc(d.item.name)).slice(0, 3).join(', ')}${due.length > 3 ? '…' : ''}</span></div>
    <button class="btn sm" onclick="postAllDue()">Post all</button>`;
}
function postAllDue() {
  let posted = 0;
  collectDue().forEach(({ item, dates }) => {
    dates.forEach(d => { postOccurrence(item, d); posted++; });
    item.lastPosted = dates[dates.length - 1];
  });
  save(); toast(posted + ' item' + (posted > 1 ? 's' : '') + ' posted', 'success'); renderAll();
}

/* ---------- dashboard ---------- */
function renderDashboard() {
  document.getElementById('heroNet').textContent = money(totalNet());
  const cards = document.getElementById('acctCards');
  cards.innerHTML = state.accounts.map((a, i) => `
    <div class="acct" style="--i:${i}">
      <div class="name">${esc(a.name)}</div>
      <div class="bal">${money(balance(a.id))}</div>
      <div class="type">${esc(a.type)}</div>
    </div>`).join('');

  const tm = thisMonthTx();
  const income = tm.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const spend  = tm.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  document.getElementById('summaryStats').innerHTML = `
    <div class="stat income"><div class="lbl">Income · this month</div><div class="val">${money(income)}</div></div>
    <div class="stat spend"><div class="lbl">Spent · this month</div><div class="val">${money(spend)}</div></div>
    <div class="stat"><div class="lbl">Net · this month</div><div class="val">${money(income - spend)}</div></div>`;

  chartTrend('trendChart');
  chartCategory('catDonut', thisMonth());

  const totals = categoryTotals(thisMonth());
  const catsShown = state.categories.filter(c => totals[c] || state.budgets[c]);
  const bars = document.getElementById('catBars');
  if (!catsShown.length) { bars.innerHTML = '<div class="empty">No spending logged this month yet.</div>'; }
  else {
    const max = Math.max(...catsShown.map(c => totals[c] || 0), 1);
    bars.innerHTML = catsShown.sort((a, b) => (totals[b] || 0) - (totals[a] || 0)).map(c => {
      const spent = totals[c] || 0, limit = state.budgets[c] || 0;
      let pct, cls = '', right;
      if (limit) {
        pct = Math.min(100, spent / limit * 100);
        cls = spent > limit ? 'over' : (spent > limit * 0.85 ? 'warn' : '');
        right = `${money0(spent)} <span class="muted">/ ${money0(limit)}</span>`;
      } else { pct = spent / max * 100; right = money(spent); }
      return `<div class="catbar">
        <div class="top"><span>${esc(c)}</span><span class="amt">${right}</span></div>
        <div class="track"><div class="${cls}" style="width:${Math.max(4, pct)}%"></div></div>
      </div>`;
    }).join('');
  }

  const up = upcomingItems(14);
  document.getElementById('upcomingList').innerHTML = up.length
    ? up.map(u => `<div class="up-row">
        <span class="dot ${u.kind === 'payday' ? 'in' : 'out'}"></span>
        <div class="grow"><div class="t1">${esc(u.name)}</div><div class="t2">${fmtDateLong(u.date)}</div></div>
        <div class="amt ${u.kind === 'payday' ? 'in' : 'out'}">${u.kind === 'payday' ? '+' : '-'}${money(u.amount)}</div>
      </div>`).join('')
    : '<div class="empty">Nothing scheduled in the next two weeks. Add bills &amp; payday on the Calendar tab.</div>';

  const recent = [...state.transactions].sort(sortTx).slice(0, 6);
  document.getElementById('recentTx').innerHTML = recent.length
    ? recent.map(txRow).join('') : '<div class="empty">Nothing yet - tap the + to add your first transaction.</div>';
}

const sortTx = (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

function upcomingItems(days) {
  const start = todayISO(), end = dateToISO(addDays(new Date(), days));
  const out = [];
  state.recurring.forEach(item =>
    occurrences(item, start, end).forEach(d =>
      out.push({ date: d, name: item.name, amount: item.amount, kind: item.kind })));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function txRow(t) {
  let icon, sign, title, sub, amtCls;
  if (t.type === 'income')        { icon = '↓'; sign = '+'; title = t.source || 'Income'; sub = acctName(t.accountId); amtCls = 'in'; }
  else if (t.type === 'transfer') { icon = '⇄'; sign = '';  title = 'Transfer'; sub = acctName(t.fromId) + ' → ' + acctName(t.toId); amtCls = ''; }
  else                            { icon = '↑'; sign = '-'; title = t.category + (t.note ? ' · ' + t.note : ''); sub = acctName(t.accountId); amtCls = 'out'; }
  return `<div class="tx">
    <div class="ic ${t.type === 'income' ? 'in' : (t.type === 'transfer' ? 'tr' : '')}">${icon}</div>
    <div class="meta"><div class="t1">${esc(title)} ${t.auto ? '<span class="autotag">auto</span>' : ''}</div>
      <div class="t2">${esc(sub)} · ${fmtDate(t.date)}</div></div>
    <div class="amt ${amtCls}">${sign}${money(t.amount)}</div>
    <button class="del" title="Delete" onclick="delTx('${t.id}')">×</button>
  </div>`;
}

/* ---------- add spending (full form) ---------- */
function renderAddForm() {
  const dEl = document.getElementById('expDate'); if (dEl && !dEl.value) dEl.value = todayISO();
  if (selExpAcct === null || !acctById(selExpAcct)) selExpAcct = state.accounts[0] ? state.accounts[0].id : null;
  document.getElementById('expAcctChips').innerHTML = state.accounts.map(a =>
    `<div class="chip acc ${a.id === selExpAcct ? 'active' : ''}" onclick="selExpAcct='${a.id}';renderAddForm()">${esc(a.name)}</div>`).join('');
  if (selExpCat === null || !state.categories.includes(selExpCat)) selExpCat = state.categories[0] || null;
  document.getElementById('expCatChips').innerHTML = state.categories.map(c =>
    `<div class="chip ${c === selExpCat ? 'active' : ''}" onclick="selExpCat='${escq(c)}';renderAddForm()">${esc(c)}</div>`).join('');
  fillSelect('trFrom', state.accounts, 'id', 'name', selExpAcct);
  fillSelect('trTo', state.accounts, 'id', 'name', state.accounts[1] ? state.accounts[1].id : null);
}
function addExpense() {
  const amt = parseFloat(document.getElementById('expAmount').value);
  if (!amt || amt <= 0) return toast('Enter an amount');
  if (!selExpAcct) return toast('Pick an account');
  state.transactions.push({ id: uid(), type: 'expense', amount: round2(amt), accountId: selExpAcct,
    category: selExpCat, note: document.getElementById('expNote').value.trim(), date: document.getElementById('expDate').value || todayISO() });
  save();
  document.getElementById('expAmount').value = ''; document.getElementById('expNote').value = '';
  toast(money(amt) + ' saved', 'success'); renderAll();
}
function addTransfer() {
  const from = document.getElementById('trFrom').value, to = document.getElementById('trTo').value;
  const amt = parseFloat(document.getElementById('trAmount').value);
  if (!amt || amt <= 0) return toast('Enter an amount');
  if (from === to) return toast('Pick two different accounts');
  state.transactions.push({ id: uid(), type: 'transfer', amount: round2(amt), fromId: from, toId: to, date: todayISO(), category: 'Transfer' });
  save(); document.getElementById('trAmount').value = ''; toast('Transfer recorded', 'success'); renderAll();
}

/* ---------- paycheck ---------- */
function renderPaycheck() {
  const dEl = document.getElementById('payDate'); if (dEl && !dEl.value) dEl.value = todayISO();
  const rl = document.getElementById('ruleList');
  rl.innerHTML = state.rules.map((r, i) => `
    <div class="ruleRow">
      <select onchange="state.rules[${i}].accountId=this.value;saveRules()">${optList(r.accountId)}</select>
      <div class="amt-wrap sm"><span>$</span><input type="number" value="${r.amount || ''}" placeholder="0.00"
        onchange="state.rules[${i}].amount=parseFloat(this.value)||0;saveRules();updatePayPreview()"></div>
      <button class="del" onclick="state.rules.splice(${i},1);saveRules();renderPaycheck()">×</button>
    </div>`).join('') || '<div class="hint">No fixed allocations - the full paycheck goes to your remainder account.</div>';
  fillSelect('remainderSelect', state.accounts, 'id', 'name', state.remainderId);
  updatePayPreview();
}
function optList(sel) { return state.accounts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join(''); }
function updatePayPreview() {
  const amt = parseFloat(document.getElementById('payAmount').value) || 0;
  const el = document.getElementById('payPreview');
  const fixed = state.rules.reduce((s, r) => s + (r.amount || 0), 0);
  const remainder = amt - fixed;
  let lines = state.rules.filter(r => r.amount > 0).map(r => `<div>• ${money(r.amount)} → <b>${esc(acctName(r.accountId))}</b></div>`).join('');
  lines += `<div>• ${money(remainder)} → <b>${esc(acctName(state.remainderId))}</b> <span class="pill">remainder</span></div>`;
  if (amt <= 0) { el.innerHTML = 'Enter an amount to preview the split.'; return; }
  if (remainder < 0) { el.innerHTML = `<b style="color:var(--red)">Fixed allocations (${money(fixed)}) exceed the paycheck (${money(amt)}).</b>`; return; }
  el.innerHTML = `<b>Split preview</b>${lines}`;
}
function addPaycheck() {
  const amt = parseFloat(document.getElementById('payAmount').value);
  if (!amt || amt <= 0) return toast('Enter paycheck amount');
  const fixed = state.rules.reduce((s, r) => s + (r.amount || 0), 0);
  if (fixed > amt) return toast('Fixed amounts exceed paycheck');
  const date = document.getElementById('payDate').value || todayISO();
  const source = document.getElementById('paySource').value.trim() || 'Paycheck';
  postOccurrence({ kind: 'payday', amount: round2(amt), name: source }, date);
  save();
  document.getElementById('payAmount').value = ''; document.getElementById('paySource').value = '';
  toast('Paycheck deposited & split', 'success'); show('dashboard');
}

/* ---------- insights ---------- */
function renderInsights() {
  if (!document.getElementById('insights').classList.contains('active')) return;
  chartTrend('insTrend');
  chartAccounts('insAccounts');
  chartCategory('insCategory', thisMonth());
  chartDaily('insDaily');
  const months = lastNMonths(6).map(m => monthTotals(m.key).spend);
  const avg = months.reduce((s, v) => s + v, 0) / (months.filter(v => v > 0).length || 1);
  const tm = thisMonthTx().filter(t => t.type === 'expense');
  const biggest = tm.sort((a, b) => b.amount - a.amount)[0];
  document.getElementById('insNumbers').innerHTML = `
    <div class="mini"><div class="lbl">Avg monthly spend</div><div class="val">${money(avg)}</div></div>
    <div class="mini"><div class="lbl">Transactions this month</div><div class="val">${thisMonthTx().length}</div></div>
    <div class="mini"><div class="lbl">Biggest expense (mo)</div><div class="val">${biggest ? money(biggest.amount) : '-'}</div>
      <div class="sub">${biggest ? esc(biggest.category) : ''}</div></div>`;
}

/* ---------- calendar ---------- */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function calShift(n) {
  calMonth += n;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function calToday() { calYear = _now.getFullYear(); calMonth = new Date().getMonth(); renderCalendar(); }

function renderCalendar() {
  const wrap = document.getElementById('calGrid'); if (!wrap) return;
  document.getElementById('calTitle').textContent = MONTHS[calMonth] + ' ' + calYear;

  const first = new Date(calYear, calMonth, 1);
  const startISO = dateToISO(first);
  const endISO = dateToISO(new Date(calYear, calMonth + 1, 0));
  const byDay = {};
  state.recurring.forEach(item =>
    occurrences(item, startISO, endISO).forEach(d => { (byDay[d] = byDay[d] || []).push({ kind: item.kind, name: item.name, amount: item.amount, sched: true }); }));
  state.transactions.forEach(t => {
    if (monthKey(t.date) === startISO.slice(0, 7) && t.type !== 'transfer')
      (byDay[t.date] = byDay[t.date] || []).push({ kind: t.type === 'income' ? 'payday' : 'bill', name: t.type === 'income' ? (t.source || 'Income') : (t.note || t.category), amount: t.amount, logged: true });
  });

  let html = '<div class="cal-head">' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div>${d}</div>`).join('') + '</div><div class="cal-body">';
  const lead = first.getDay();
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < lead; i++) html += '<div class="cell empty"></div>';
  const todayStr = todayISO();
  for (let day = 1; day <= dim; day++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const items = byDay[iso] || [];
    const isToday = iso === todayStr;
    const dots = items.slice(0, 6).map(it =>
      `<span class="cal-dot ${it.kind === 'payday' ? 'in' : 'out'} ${it.logged ? 'logged' : ''}" title="${esc(it.name)} ${money(it.amount)}"></span>`).join('');
    const overflow = items.length > 6 ? `<div class="cal-count">+${items.length - 6}</div>` : '';
    html += `<div class="cell ${isToday ? 'today' : ''} ${items.length ? 'has' : ''}" onclick="dayDetail('${iso}')">
      <div class="dnum">${day}</div><div class="cal-dots">${dots}</div>${overflow}</div>`;
  }
  html += '</div>';
  wrap.innerHTML = html;
}

function dayDetail(iso) {
  const sched = [];
  state.recurring.forEach(item => occurrences(item, iso, iso).forEach(() => sched.push(item)));
  const logged = state.transactions.filter(t => t.date === iso);
  let body = `<h3 style="margin-bottom:8px">${fmtDateLong(iso)}</h3>`;
  if (!sched.length && !logged.length) body += '<div class="empty">Nothing scheduled or logged.</div>';
  if (sched.length) {
    body += '<div class="sectiontitle">Scheduled</div>';
    body += sched.map(it => `<div class="up-row"><span class="dot ${it.kind === 'payday' ? 'in' : 'out'}"></span>
      <div class="grow"><div class="t1">${esc(it.name)}</div><div class="t2">${it.kind === 'payday' ? 'Payday' : (esc(it.category) + ' · ' + acctName(it.accountId))} · ${it.freq}</div></div>
      <div class="amt ${it.kind === 'payday' ? 'in' : 'out'}">${it.kind === 'payday' ? '+' : '-'}${money(it.amount)}</div></div>`).join('');
  }
  if (logged.length) body += '<div class="sectiontitle">Logged</div>' + logged.map(txRow).join('');
  openModal(body);
}

/* ---------- recurring management ---------- */
function renderRecurringLists() {
  const bills = state.recurring.filter(r => r.kind === 'bill');
  const pays = state.recurring.filter(r => r.kind === 'payday');
  const bEl = document.getElementById('billList');
  if (bEl) bEl.innerHTML = bills.length ? bills.map(recurRow).join('') : '<div class="empty">No recurring bills yet.</div>';
  const pEl = document.getElementById('paydayList');
  if (pEl) pEl.innerHTML = pays.length ? pays.map(recurRow).join('') : '<div class="empty">No payday scheduled yet.</div>';
}
function recurRow(it) {
  const next = nextOccurrence(it);
  const freqLabel = it.freq === 'biweekly' ? 'Every 2 weeks' : it.freq === 'weekly' ? 'Weekly' : it.freq === 'monthly' ? `Monthly (day ${it.dayOfMonth})` : 'One-time';
  return `<div class="listrow">
    <span class="dot ${it.kind === 'payday' ? 'in' : 'out'}"></span>
    <div class="grow"><div class="t1">${esc(it.name)} ${it.autopost ? '<span class="autotag">auto</span>' : ''}</div>
      <div class="t2">${freqLabel}${it.kind === 'bill' ? ' · ' + esc(it.category) + ' · ' + acctName(it.accountId) : ''} · next ${next ? fmtDate(next) : '-'}</div></div>
    <div class="amt ${it.kind === 'payday' ? 'in' : 'out'}">${it.kind === 'payday' ? '+' : '-'}${money(it.amount)}</div>
    <label class="mini-toggle" title="Auto-post when due"><input type="checkbox" ${it.autopost ? 'checked' : ''} onchange="toggleAuto('${it.id}',this.checked)"><span></span></label>
    <button class="del" onclick="removeRecurring('${it.id}')">×</button>
  </div>`;
}
function toggleAuto(id, val) { const it = state.recurring.find(r => r.id === id); if (it) { it.autopost = val; save(); renderAll(); } }
function removeRecurring(id) { if (!confirm('Remove this scheduled item?')) return; state.recurring = state.recurring.filter(r => r.id !== id); save(); renderAll(); toast('Removed'); }

function addBill() {
  const name = document.getElementById('billName').value.trim();
  const amount = parseFloat(document.getElementById('billAmount').value);
  if (!name || !amount || amount <= 0) return toast('Enter a name and amount');
  const freq = document.getElementById('billFreq').value;
  const item = { id: uid(), kind: 'bill', name, amount: round2(amount),
    accountId: document.getElementById('billAccount').value, category: document.getElementById('billCategory').value,
    freq, autopost: document.getElementById('billAuto').checked, lastPosted: null };
  if (freq === 'monthly') { item.dayOfMonth = parseInt(document.getElementById('billDay').value) || 1; item.anchor = todayISO(); }
  else item.anchor = document.getElementById('billDate').value || todayISO();
  item.lastPosted = dateToISO(addDays(new Date(), -1));
  state.recurring.push(item);
  save(); document.getElementById('billName').value = ''; document.getElementById('billAmount').value = '';
  toast('Bill scheduled', 'success'); renderAll();
}
function addPayday() {
  const name = document.getElementById('pdName').value.trim() || 'Paycheck';
  const amount = parseFloat(document.getElementById('pdAmount').value);
  const anchor = document.getElementById('pdDate').value;
  if (!amount || amount <= 0) return toast('Enter the paycheck amount');
  if (!anchor) return toast('Pick your next payday date');
  state.recurring.push({ id: uid(), kind: 'payday', name, amount: round2(amount),
    freq: document.getElementById('pdFreq').value, anchor,
    autopost: document.getElementById('pdAuto').checked,
    lastPosted: dateToISO(addDays(new Date(), -1)) });
  save(); document.getElementById('pdAmount').value = '';
  toast('Payday scheduled', 'success'); renderAll();
}

/* ---------- transactions ---------- */
function renderTxFilters() {
  fillSelect('fAccount', state.accounts, 'id', 'name', document.getElementById('fAccount').value, true, 'All accounts');
  const fc = document.getElementById('fCategory'); const cur = fc.value;
  fc.innerHTML = '<option value="">All categories</option>' + state.categories.map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
}
function renderTx() {
  const fa = document.getElementById('fAccount').value, fc = document.getElementById('fCategory').value, ft = document.getElementById('fType').value;
  let list = [...state.transactions].sort(sortTx);
  if (fa) list = list.filter(t => t.accountId === fa || t.fromId === fa || t.toId === fa);
  if (fc) list = list.filter(t => t.category === fc);
  if (ft) list = list.filter(t => t.type === ft);
  document.getElementById('txList').innerHTML = list.length ? list.map(txRow).join('') : '<div class="empty">No matching transactions.</div>';
}
function delTx(id) { state.transactions = state.transactions.filter(t => t.id !== id); save(); renderAll(); toast('Deleted'); }

/* ---------- settings ---------- */
function renderSettings() {
  document.getElementById('acctSettings').innerHTML = state.accounts.map((a, i) => `
    <div class="listrow">
      <input style="max-width:140px" value="${escq(a.name)}" onchange="state.accounts[${i}].name=this.value;save();renderAll()">
      <span class="pill">${esc(a.type)}</span><div class="grow"></div>
      <span class="muted" style="font-size:12px">start</span>
      <div class="amt-wrap sm" style="width:108px"><span>$</span><input type="number" value="${a.opening || 0}"
        onchange="state.accounts[${i}].opening=parseFloat(this.value)||0;save();renderAll()"></div>
      ${state.accounts.length > 1 ? `<button class="del" onclick="removeAccount('${a.id}')">×</button>` : ''}
    </div>`).join('');

  document.getElementById('catSettings').innerHTML = state.categories.map(c => `<div class="chip" onclick="removeCategory('${escq(c)}')">${esc(c)} ×</div>`).join('');

  document.getElementById('budgetSettings').innerHTML = state.categories.map(c => `
    <div class="listrow">
      <div class="grow">${esc(c)}</div>
      <div class="amt-wrap sm" style="width:120px"><span>$</span><input type="number" placeholder="no limit" value="${state.budgets[c] || ''}"
        onchange="setBudget('${escq(c)}',this.value)"></div>
    </div>`).join('');

  fillSelect('billAccount', state.accounts, 'id', 'name', state.accounts[0] ? state.accounts[0].id : null);
  const bc = document.getElementById('billCategory');
  if (bc) bc.innerHTML = state.categories.map(c => `<option>${esc(c)}</option>`).join('');
  const bd = document.getElementById('billDate'); if (bd && !bd.value) bd.value = todayISO();
  const pdd = document.getElementById('pdDate'); if (pdd && !pdd.value) pdd.value = nextFridayISO();
}
function setBudget(c, v) { const n = parseFloat(v); if (!n || n <= 0) delete state.budgets[c]; else state.budgets[c] = n; save(); renderDashboard(); }
function addAccount() {
  const name = document.getElementById('newAcctName').value.trim(); if (!name) return toast('Enter a name');
  state.accounts.push({ id: uid(), name, type: document.getElementById('newAcctType').value, opening: 0 });
  save(); document.getElementById('newAcctName').value = ''; toast('Account added'); renderAll();
}
function removeAccount(id) {
  if (state.accounts.length <= 1) return;
  const used = state.transactions.some(t => t.accountId === id || t.fromId === id || t.toId === id);
  if (used && !confirm('This account has transactions. Remove anyway? (History stays.)')) return;
  state.accounts = state.accounts.filter(a => a.id !== id);
  if (state.remainderId === id) state.remainderId = state.accounts[0].id;
  state.rules = state.rules.filter(r => r.accountId !== id);
  save(); renderAll(); toast('Account removed');
}
function addCategory() {
  const c = document.getElementById('newCat').value.trim(); if (!c) return;
  if (!state.categories.includes(c)) state.categories.push(c);
  save(); document.getElementById('newCat').value = ''; renderAll();
}
function removeCategory(c) { if (!confirm('Remove category "' + c + '"?')) return; state.categories = state.categories.filter(x => x !== c); delete state.budgets[c]; save(); renderAll(); }
function addRuleRow() { state.rules.push({ accountId: state.accounts[0].id, amount: 0 }); saveRules(); renderPaycheck(); }
function saveRules(announce) { state.remainderId = document.getElementById('remainderSelect').value || state.remainderId; save(); if (announce) toast('Rules saved', 'success'); }

/* ---------- data ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'budget-backup-' + todayISO() + '.json'; a.click(); toast('Backup downloaded', 'success');
}
function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); if (!d.accounts) throw 0; state = d; state.settings = state.settings || { theme: 'light' }; state.plan = state.plan || { income: 0, monthlyExpenses: [], tier: null, startDate: null }; save(); applyTheme(); renderAll(); toast('Backup imported', 'success'); } catch (_) { toast('Invalid backup file'); } };
  r.readAsText(f); e.target.value = '';
}
function resetAll() { if (confirm('Erase ALL data and start fresh?')) { localStorage.removeItem(KEY); state = JSON.parse(JSON.stringify(DEFAULT)); save(); applyTheme(); renderAll(); show('settings'); toast('Reset complete'); } }

/* ---------- modal ---------- */
function openModal(html) { document.getElementById('modalBody').innerHTML = html; document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }

/* ---------- small utils ---------- */
function fillSelect(id, arr, vKey, lKey, sel, withAll, allLabel) {
  const el = document.getElementById(id); if (!el) return;
  let html = withAll ? `<option value="">${allLabel || 'All'}</option>` : '';
  html += arr.map(o => `<option value="${o[vKey]}" ${o[vKey] === sel ? 'selected' : ''}>${esc(o[lKey])}</option>`).join('');
  el.innerHTML = html;
}
function nextFridayISO() { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return dateToISO(d); }

/* ---------- boot ---------- */
applyTheme();
autoPostDue();
show('dashboard');
document.getElementById('payAmount').addEventListener('input', updatePayPreview);
document.getElementById('billFreq').addEventListener('change', function () {
  document.getElementById('billMonthlyRow').style.display = this.value === 'monthly' ? 'block' : 'none';
  document.getElementById('billDateRow').style.display = this.value === 'monthly' ? 'none' : 'block';
});
