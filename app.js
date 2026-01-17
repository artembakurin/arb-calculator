// RUB only. Classic.
//
// Working R and F:
// - R: profit distribution rule (in auto calc):
//   - If R on one outcome -> that outcome gets all profit, others get profit 0.
//   - If R on multiple outcomes -> equal profit on those outcomes, others profit 0.
// - F: manual fixed row. When enabled on a row, that row stake is fixed and
//   other non-manual stakes are auto-calculated to satisfy the R rule.
// - No auto-fix: editing any field does NOT set F automatically.
//
// Manual stakes:
// - If you type a stake in a row -> it becomes manual=true and won't be overwritten.
// - If you type Bank -> we recompute auto-stakes from Bank (manual=false for non-fixed rows).
// - If Bank input is not focused -> it shows actual total stakes (fact sum).

const state = {
  n: 2,
  fixedIndex: null, // null or number (manual toggle only)
  bank: 1000,
  rows: [] // { odds, stake, R, manual }
};

function isNum(x){ return Number.isFinite(x) && !Number.isNaN(x); }
function round2(x){ return Math.round((x + Number.EPSILON) * 100) / 100; }
function fmt2(x){ return isNum(x) ? round2(x).toFixed(2) : "-"; }
function fmtInvSum(x){ return isNum(x) ? x.toFixed(6) : "-"; }

function ensureRows(){
  while (state.rows.length < state.n) {
    state.rows.push({ odds: 2.0, stake: 0, R: true, manual: false });
  }
  state.rows = state.rows.slice(0, state.n);
  state.rows.forEach(r => { if (typeof r.manual !== "boolean") r.manual = false; });
  if (state.fixedIndex != null && (state.fixedIndex < 0 || state.fixedIndex >= state.n)) {
    state.fixedIndex = null;
  }
}

function sumStakes(rows){
  return round2(rows.reduce((s,r)=> s + (isNum(r.stake) ? Math.max(0, r.stake) : 0), 0));
}

function invSumOdds(odds){
  return odds.reduce((s,o)=> s + (o > 0 ? 1/o : Infinity), 0);
}

function syncFixedCheckboxesUI(){
  const rowsEl = document.getElementById("rows");
  if (!rowsEl) return;
  const fEls = Array.from(rowsEl.querySelectorAll('input[data-role="F"]'));
  fEls.forEach((el, idx) => { el.checked = (state.fixedIndex === idx); });
}

function setFixedIndex(idxOrNull){
  state.fixedIndex = idxOrNull;
  syncFixedCheckboxesUI();
}

// Auto-calc model (your R rule):
// Let T = total stakes.
// For outcomes WITHOUT R: profit must be 0  -> payout = T -> s_i * o_i = T
// For outcomes WITH R: profit must be K (same K for all R outcomes) -> payout = T + K -> s_i * o_i = T + K
//
// If Bank-driven (no fixed row): T is given by bank.
// Then K = T*(1 - A)/AR, where A = sum_all(1/o), AR = sum_R(1/o)
//
// If Fixed row j (must have R): s_j is fixed.
// Solve: (T+K) = s_j*o_j and sum stakes = T ->
//   T = (s_j*o_j*AR) / (1 - A + AR), K = s_j*o_j - T
function suggestFromBank(bank, rows){
  const odds = rows.map(r => r.odds);
  const isR = rows.map(r => !!r.R);
  const A = invSumOdds(odds);
  const AR = odds.reduce((s,o,i)=> s + (isR[i] ? (o>0 ? 1/o : Infinity) : 0), 0);

  const T = Math.max(0, Number(bank) || 0);
  const K = (AR > 0) ? (T * (1 - A) / AR) : 0;

  let stakes = odds.map((o,i) => {
    if (o <= 0) return 0;
    return isR[i] ? ((T + K) / o) : (T / o);
  });

  // round to cents + keep total close to T by adjusting first R
  stakes = stakes.map(s => round2(Math.max(0, s)));
  const total = round2(stakes.reduce((a,b)=>a+b,0));
  const delta = round2(T - total);
  if (Math.abs(delta) >= 0.01) {
    const k = rows.findIndex(r => r.R);
    if (k >= 0) stakes[k] = round2(Math.max(0, stakes[k] + delta));
  }
  return stakes;
}

function suggestFromFixedRow(fixedIdx, rows){
  const fr = rows[fixedIdx];
  if (!fr || !fr.R) return null; // fixed must be on an R row (your logic)

  const odds = rows.map(r => r.odds);
  const isR = rows.map(r => !!r.R);

  const A = invSumOdds(odds);
  const AR = odds.reduce((s,o,i)=> s + (isR[i] ? (o>0 ? 1/o : Infinity) : 0), 0);

  const sj = Math.max(0, Number(fr.stake) || 0);
  const oj = odds[fixedIdx];

  const denom = (1 - A + AR);
  let T, K;
  if (Math.abs(denom) < 1e-12) {
    T = sj * oj;
    K = 0;
  } else {
    T = (sj * oj * AR) / denom;
    K = (sj * oj) - T;
  }

  let stakes = odds.map((o,i) => {
    if (o <= 0) return 0;
    return isR[i] ? ((T + K) / o) : (T / o);
  });

  stakes = stakes.map(s => round2(Math.max(0, s)));
  // keep fixed stake exact to cents
  stakes[fixedIdx] = round2(sj);

  return stakes;
}

// UI build
function buildRowDOM(i){
  const r = state.rows[i];

  const row = document.createElement("div");
  row.className = "row";
  row.dataset.index = String(i);

  row.innerHTML = `
    <div class="cell">
      <div class="mLabel">Коэффициент</div>
      <input class="input" data-role="odds" type="number" min="1.000001" max="100000" step="0.0001" value="${r.odds}">
      <div class="err" data-role="errOdds" style="display:none"></div>
    </div>

    <div class="cell">
      <div class="mLabel">Ставка (RUB)</div>
      <input class="input" data-role="stake" type="number" min="0" step="0.01" value="${r.stake}" inputmode="decimal">
      <div class="err" data-role="errStake" style="display:none"></div>
    </div>

    <div class="cell center">
      <div class="mLabel">Р</div>
      <input data-role="R" type="checkbox" ${r.R ? "checked" : ""}>
    </div>

    <div class="cell center">
      <div class="mLabel">Ф</div>
      <input data-role="F" type="checkbox">
    </div>

    <div class="cell">
      <div class="mLabel">Доход (RUB)</div>
      <div class="badge">
        <span data-role="profit">-</span>
        <span class="muted">RUB</span>
      </div>
      <div class="muted" style="font-size:12px;margin-top:6px">
        выплата: <span data-role="payout">-</span>
      </div>
    </div>
  `;

  const oddsInp = row.querySelector('input[data-role="odds"]');
  const stakeInp = row.querySelector('input[data-role="stake"]');
  const rChk = row.querySelector('input[data-role="R"]');
  const fChk = row.querySelector('input[data-role="F"]');

  oddsInp.addEventListener("input", () => {
    state.rows[i].odds = Number(oddsInp.value);
    recalcAndPaint();
  });

  stakeInp.addEventListener("input", () => {
    state.rows[i].stake = Number(stakeInp.value);
    state.rows[i].manual = true; // key: manual stake won't be overwritten
    recalcAndPaint();
  });

  rChk.addEventListener("change", () => {
    state.rows[i].R = rChk.checked;

    // if fixed row lost R -> disable fix
    if (!state.rows[i].R && state.fixedIndex === i) {
      setFixedIndex(null);
    }

    // when changing R, it's safer to let auto recalc update non-manual rows
    recalcAndPaint();
  });

  fChk.addEventListener("change", () => {
    if (fChk.checked) {
      // set fixed only here, no auto-fix
      setFixedIndex(i);

      // when user chooses a fixed row, we want other rows to auto-calc unless user explicitly made them manual
      // keep their manual flags as-is; but often user expects recalculation:
      // so we reset manual=false for all rows except fixed (feel free to remove if you hate it)
      state.rows.forEach((r, idx) => { if (idx !== i) r.manual = false; });

    } else {
      if (state.fixedIndex === i) setFixedIndex(null);
    }
    recalcAndPaint();
  });

  return row;
}

function renderRowsOnce(){
  const rowsEl = document.getElementById("rows");
  rowsEl.innerHTML = "";
  for (let i=0;i<state.n;i++){
    rowsEl.appendChild(buildRowDOM(i));
  }
  syncFixedCheckboxesUI();
}

function paintErrors(errors){
  const rowsEl = document.getElementById("rows");
  const rowEls = Array.from(rowsEl.querySelectorAll(".row"));
  rowEls.forEach((rowEl, i) => {
    const e = errors[i];
    const errOdds = rowEl.querySelector('[data-role="errOdds"]');
    const errStake = rowEl.querySelector('[data-role="errStake"]');

    if (e.odds){
      errOdds.style.display = "block";
      errOdds.textContent = e.odds;
    } else {
      errOdds.style.display = "none";
      errOdds.textContent = "";
    }

    if (e.stake){
      errStake.style.display = "block";
      errStake.textContent = e.stake;
    } else {
      errStake.style.display = "none";
      errStake.textContent = "";
    }
  });
}

function validate(){
  const errors = state.rows.map(() => ({odds:"", stake:""}));
  let ok = true;

  if (!isNum(state.bank) || state.bank < 0) ok = false;

  const rCount = state.rows.filter(r => r.R).length;
  if (rCount < 1) ok = false;

  for (let i=0;i<state.n;i++){
    const r = state.rows[i];
    if (!isNum(r.odds) || r.odds <= 1 || r.odds >= 100000) {
      errors[i].odds = "Коэффициент должен быть числом > 1.";
      ok = false;
    }
    if (!isNum(r.stake) || r.stake < 0) {
      errors[i].stake = "Ставка должна быть >= 0.";
      ok = false;
    }
  }

  if (state.fixedIndex != null) {
    const fr = state.rows[state.fixedIndex];
    if (!fr.R) ok = false;
    if (!isNum(fr.stake) || fr.stake <= 0) ok = false;
  }

  return { ok, errors };
}

function recalcAndPaint(){
  ensureRows();

  const bankInp = document.getElementById("bank");
  state.bank = Number(bankInp.value);

  const { ok, errors } = validate();

  // compute suggested stakes (auto)
  let suggested = null;
  if (state.fixedIndex != null) {
    suggested = suggestFromFixedRow(state.fixedIndex, state.rows);
    if (!suggested) suggested = suggestFromBank(state.bank, state.rows);
  } else {
    suggested = suggestFromBank(state.bank, state.rows);
  }

  // apply suggestions only to rows that are:
  // - not fixed
  // - not manual
  // - not focused
  const rowsEl = document.getElementById("rows");
  const rowEls = Array.from(rowsEl.querySelectorAll(".row"));

  rowEls.forEach((rowEl, i) => {
    const stakeInp = rowEl.querySelector('input[data-role="stake"]');
    const rChk = rowEl.querySelector('input[data-role="R"]');
    const fChk = rowEl.querySelector('input[data-role="F"]');

    // sync checkbox UI from state (so clicks persist)
    rChk.checked = !!state.rows[i].R;
    fChk.checked = (state.fixedIndex === i);

    const focused = (document.activeElement === stakeInp);
    const fixed = (state.fixedIndex === i);

    if (!fixed && !state.rows[i].manual && !focused && suggested && isNum(suggested[i])) {
      state.rows[i].stake = suggested[i];
      stakeInp.value = fmt2(suggested[i]);
    }
  });

  // compute actual totals/profits from current stakes
  const odds = state.rows.map(r => r.odds);
  const total = sumStakes(state.rows);

  // show actual total inside bank (when bank is not focused)
  if (document.activeElement !== bankInp) {
    bankInp.value = fmt2(total);
    state.bank = total;
  }

  const payouts = state.rows.map((r,i)=> round2(Math.max(0, r.stake) * odds[i]));
  const profits = payouts.map(p => round2(p - total));

  // arb info
  const sInv = invSumOdds(odds);
  const isArb = sInv < 1;

  // ROI on chosen row: fixed row else first R
  let roiRow = 0;
  if (state.fixedIndex != null) roiRow = state.fixedIndex;
  else {
    const firstR = state.rows.findIndex(r => r.R);
    roiRow = firstR >= 0 ? firstR : 0;
  }
  const win = payouts[roiRow] ?? 0;
  const roi = total > 0 ? ((win - total) / total) : 0;

  // paint payouts/profits
  rowEls.forEach((rowEl, i) => {
    const profitEl = rowEl.querySelector('[data-role="profit"]');
    const payoutEl = rowEl.querySelector('[data-role="payout"]');

    if (!ok) {
      profitEl.textContent = "-";
      payoutEl.textContent = "-";
    } else {
      profitEl.textContent = fmt2(profits[i]);
      payoutEl.textContent = `${fmt2(payouts[i])} RUB`;
    }
  });

  // pills
  const arbEl = document.getElementById("arbStatus");
  const roiEl = document.getElementById("roiStatus");

  if (!ok){
    arbEl.textContent = "Проверь ввод";
    arbEl.className = "pill warn";
    roiEl.textContent = "-";
    roiEl.className = "pill";
  } else {
    arbEl.textContent = isArb
      ? `Вилка: да (∑1/к = ${fmtInvSum(sInv)})`
      : `Вилка: нет (∑1/к = ${fmtInvSum(sInv)})`;
    arbEl.className = isArb ? "pill good" : "pill bad";

    const tag = (state.fixedIndex != null) ? `по Ф (${roiRow+1})` : `по Р (${roiRow+1})`;
    roiEl.textContent = `ROI: ${(roi*100).toFixed(2)}% (${tag})`;
    roiEl.className = roi >= 0 ? "pill good" : "pill bad";
  }

  paintErrors(errors);
}

function setN(n){
  state.n = n;
  ensureRows();
  renderRowsOnce();
  recalcAndPaint();
}

function init(){
  state.rows = [
    { odds: 2.00, stake: 0, R: true, manual: false },
    { odds: 2.00, stake: 0, R: true, manual: false }
  ];
  ensureRows();

  const seg = document.getElementById("outcomesSeg");
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-n]");
    if (!btn) return;
    seg.querySelectorAll(".seg").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    setN(Number(btn.dataset.n));
  });

  // Bank input: user wants classic recompute from bank
  const bankInp = document.getElementById("bank");
  bankInp.addEventListener("input", () => {
    state.bank = Number(bankInp.value);
    // reset non-fixed rows to auto so they recompute from bank
    state.rows.forEach((r, idx) => {
      if (state.fixedIndex !== idx) r.manual = false;
    });
    recalcAndPaint();
  });

  renderRowsOnce();
  recalcAndPaint();
}

document.addEventListener("DOMContentLoaded", init);
