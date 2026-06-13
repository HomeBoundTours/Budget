/* =========================================================
   data.js - state, storage, and shared helpers
   Loaded first. Exposes globals used by charts.js and app.js.
   ========================================================= */

const KEY = 'budgetTracker_v1';

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT = {
  accounts: [
    { id: 'a_chk',  name: 'Checking', type: 'Checking', opening: 0 },
    { id: 'a_sav',  name: 'Savings',  type: 'Savings',  opening: 0 },
    { id: 'a_cash', name: 'Cash',     type: 'Cash',     opening: 0 }
  ],
  categories: ['Housing', 'Groceries', 'Dining', 'Transport', 'Utilities',
               'Subscriptions', 'Shopping', 'Health', 'Entertainment', 'Savings', 'Other'],
  rules: [{ accountId: 'a_sav', amount: 0 }],
  remainderId: 'a_chk',
  budgets: {},
  recurring: [],
  transactions: [],
  plan: { income: 0, monthlyExpenses: [], tier: null, startDate: null },
  settings: { theme: 'light' }
};

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.accounts) {
      const merged = JSON.parse(JSON.stringify(DEFAULT));
      Object.assign(merged, s);
      merged.settings = Object.assign({}, DEFAULT.settings, s.settings || {});
      merged.budgets = s.budgets || {};
      merged.recurring = s.recurring || [];
      merged.plan = Object.assign({ income: 0, monthlyExpenses: [], tier: null, startDate: null }, s.plan || {});
      return merged;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT));
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* ---------- formatting + lookups ---------- */
const money = n => (n < 0 ? '-$' : '$') +
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = n => (n < 0 ? '-$' : '$') +
  Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

const acctById = id => state.accounts.find(a => a.id === id);
const acctName = id => { const a = acctById(id); return a ? a.name : '-'; };
const round2 = n => Math.round(n * 100) / 100;

function balance(id) {
  const a = acctById(id); if (!a) return 0;
  let b = a.opening;
  state.transactions.forEach(t => {
    if (t.type === 'expense' && t.accountId === id) b -= t.amount;
    if (t.type === 'income'  && t.accountId === id) b += t.amount;
    if (t.type === 'transfer') { if (t.fromId === id) b -= t.amount; if (t.toId === id) b += t.amount; }
  });
  return b;
}
const totalNet = () => state.accounts.reduce((s, a) => s + balance(a.id), 0);

const monthKey = d => d.slice(0, 7);
const thisMonth = () => todayISO().slice(0, 7);
const thisMonthTx = () => state.transactions.filter(t => monthKey(t.date) === thisMonth());

/* ---------- month/series helpers for charts ---------- */
function lastNMonths(n) {
  const out = [];
  const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: dd.toISOString().slice(0, 7), label: dd.toLocaleDateString('en-US', { month: 'short' }) });
  }
  return out;
}
function monthTotals(key) {
  let income = 0, spend = 0;
  state.transactions.forEach(t => {
    if (monthKey(t.date) !== key) return;
    if (t.type === 'income') income += t.amount;
    if (t.type === 'expense') spend += t.amount;
  });
  return { income, spend };
}
function categoryTotals(key) {
  const m = {};
  state.transactions.forEach(t => {
    if (t.type === 'expense' && monthKey(t.date) === key)
      m[t.category] = (m[t.category] || 0) + t.amount;
  });
  return m;
}

/* ---------- budget plan / advisor ---------- */
const DAYS_PER_MONTH = 365 / 12; // 30.4375
const TIERS = {
  aggressive:   { key: 'aggressive',   label: 'Aggressive',   rate: 0.50, blurb: 'Save hard, leaner days' },
  base:         { key: 'base',         label: 'Base',         rate: 0.30, blurb: 'Balanced' },
  conservative: { key: 'conservative', label: 'Conservative', rate: 0.15, blurb: 'Easy to stick to' }
};

function planIncome() { return state.plan.income || 0; }
function planFixedMonthly() { return (state.plan.monthlyExpenses || []).reduce((s, e) => s + (e.amount || 0), 0); }
function planDiscretionary() { return Math.max(0, planIncome() - planFixedMonthly()); }

// For a tier: how much you save, what's left to spend, and the daily allowance.
function tierCalc(key) {
  const t = TIERS[key];
  const disc = planDiscretionary();
  const monthlySave = round2(disc * t.rate);
  const monthlySpendable = round2(planIncome() - monthlySave);
  const daily = round2(monthlySpendable / DAYS_PER_MONTH);
  return { key, label: t.label, rate: t.rate, blurb: t.blurb,
    monthlySave, monthlySpendable, daily, annualSave: round2(monthlySave * 12) };
}
function activeDailyBudget() { return state.plan.tier ? tierCalc(state.plan.tier).daily : 0; }

// Estimate monthly income from any scheduled paydays.
function estMonthlyIncomeFromPaydays() {
  const per = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, once: 0 };
  return round2(state.recurring.filter(r => r.kind === 'payday')
    .reduce((s, r) => s + r.amount * (per[r.freq] || 0), 0));
}

// "Available to spend today" with continuous rollover; ALL expenses count.
function availableToday() {
  const daily = activeDailyBudget();
  const start = state.plan.startDate;
  if (!daily || !start) return null;
  const today = todayISO();
  let daysElapsed = Math.floor((isoToDate(today) - isoToDate(start)) / 86400000) + 1;
  if (daysElapsed < 1) daysElapsed = 1;
  const expSum = (from, toExclusiveOrInclusive, inclusive) => state.transactions
    .filter(t => t.type === 'expense' && t.date >= from && (inclusive ? t.date <= toExclusiveOrInclusive : t.date < toExclusiveOrInclusive))
    .reduce((s, t) => s + t.amount, 0);
  const spentToDate = expSum(start, today, true);
  const spentBeforeToday = expSum(start, today, false);
  const todaySpent = round2(spentToDate - spentBeforeToday);
  const allowanceToDate = round2(daily * daysElapsed);
  const available = round2(allowanceToDate - spentToDate);
  const carryIn = round2(daily * (daysElapsed - 1) - spentBeforeToday); // net rolled in from prior days
  return { daily, available, todaySpent, carryIn, daysElapsed, start };
}

/* ---------- recurring / schedule engine ---------- */
function isoToDate(s) { return new Date(s + 'T00:00'); }
function dateToISO(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function occurrences(item, startISO, endISO) {
  const start = isoToDate(startISO), end = isoToDate(endISO), out = [];
  if (item.freq === 'monthly') {
    let y = start.getFullYear(), m = start.getMonth();
    while (true) {
      const dim = new Date(y, m + 1, 0).getDate();
      const day = Math.min(item.dayOfMonth || 1, dim);
      const dt = new Date(y, m, day);
      if (dt > end) break;
      if (dt >= start) out.push(dateToISO(dt));
      m++; if (m > 11) { m = 0; y++; }
    }
  } else if (item.freq === 'once') {
    if (item.anchor >= startISO && item.anchor <= endISO) out.push(item.anchor);
  } else {
    const step = item.freq === 'biweekly' ? 14 : 7;
    let dt = isoToDate(item.anchor);
    while (dt < start) dt = addDays(dt, step);
    while (dt <= end) { if (dt >= start) out.push(dateToISO(dt)); dt = addDays(dt, step); }
  }
  return out;
}

function nextOccurrence(item) {
  const t = todayISO();
  const horizon = dateToISO(addDays(new Date(), 400));
  const occ = occurrences(item, t, horizon);
  return occ[0] || null;
}

function dueOccurrences(item) {
  const startFrom = item.lastPosted ? dateToISO(addDays(isoToDate(item.lastPosted), 1)) : item.anchor;
  if (!startFrom) return [];
  return occurrences(item, startFrom, todayISO());
}

function postOccurrence(item, dateISO) {
  if (item.kind === 'payday') {
    const amt = item.amount;
    const fixed = state.rules.reduce((s, r) => s + (r.amount || 0), 0);
    const capped = Math.min(fixed, amt);
    state.rules.filter(r => r.amount > 0).forEach(r => {
      state.transactions.push({ id: uid(), type: 'income', amount: round2(Math.min(r.amount, amt)),
        accountId: r.accountId, category: 'Income', source: item.name, date: dateISO, auto: true });
    });
    const remainder = round2(amt - capped);
    if (remainder > 0)
      state.transactions.push({ id: uid(), type: 'income', amount: remainder,
        accountId: state.remainderId, category: 'Income', source: item.name + ' (remainder)', date: dateISO, auto: true });
  } else {
    state.transactions.push({ id: uid(), type: 'expense', amount: round2(item.amount),
      accountId: item.accountId, category: item.category, note: item.name, date: dateISO, auto: true });
  }
}

function collectDue() {
  return state.recurring
    .map(item => ({ item, dates: dueOccurrences(item) }))
    .filter(x => x.dates.length);
}

/* ---------- toast ---------- */
let _toastT;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.className = 'toast' + (type === 'success' ? ' success' : '');
  el.innerHTML = (type === 'success' ? '<span class="tick">&#10003;</span>' : '') + esc(msg);
  el.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), 2300);
}

/* ---------- escaping / dates ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function escq(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function fmtDate(d) { return isoToDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtDateLong(d) { return isoToDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
