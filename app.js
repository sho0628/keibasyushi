(() => {
  'use strict';

  const STORAGE_KEY = 'keibasyushi.records.v1';
  const BET_TYPES = ['単勝', '複勝', '枠連', '馬連', '馬単', 'ワイド', '3連複', '3連単', 'WIN5'];

  let records = load();
  let editingId = null;

  // ===== Storage =====
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to load records', e);
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  // ===== Utilities =====
  const yen = (n) => {
    const r = Math.round(n);
    return (r < 0 ? '-¥' : '¥') + Math.abs(r).toLocaleString('ja-JP');
  };
  const yenSigned = (n) => (n > 0 ? '+' : '') + yen(n);
  const pct = (n) => (n == null || !isFinite(n)) ? '-' : n.toFixed(1) + '%';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.className = 'toast ' + type; }, 2200);
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function calcStats(items) {
    const invest = items.reduce((s, r) => s + (r.invest || 0), 0);
    const ret = items.reduce((s, r) => s + (r.returnAmount || 0), 0);
    const profit = ret - invest;
    const rate = invest > 0 ? (ret / invest) * 100 : null;
    const hits = items.filter(r => (r.returnAmount || 0) > 0).length;
    const hitRate = items.length > 0 ? (hits / items.length) * 100 : null;
    return { invest, ret, profit, rate, hits, total: items.length, hitRate };
  }

  // ===== Tab switching =====
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach(s => {
        s.classList.toggle('active', s.id === `tab-${target}`);
      });
      if (target === 'stats') renderStats();
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    });
  });

  // ===== Bet-type filter options =====
  function populateBetTypeFilter() {
    const select = document.getElementById('filterBetType');
    select.innerHTML = '<option value="">すべての馬券種別</option>' +
      BET_TYPES.map(t => `<option>${t}</option>`).join('');
  }

  // ===== Summary =====
  function renderSummary() {
    const s = calcStats(records);
    document.getElementById('totalInvest').textContent = yen(s.invest);
    document.getElementById('totalReturn').textContent = yen(s.ret);
    const profitEl = document.getElementById('totalProfit');
    profitEl.textContent = yenSigned(s.profit);
    profitEl.classList.toggle('positive', s.profit > 0);
    profitEl.classList.toggle('negative', s.profit < 0);
    const rateEl = document.getElementById('totalRate');
    rateEl.textContent = pct(s.rate);
    rateEl.classList.toggle('positive', s.rate != null && s.rate >= 100);
    rateEl.classList.toggle('negative', s.rate != null && s.rate < 100);
    document.getElementById('totalHitRate').textContent =
      s.hitRate == null ? '-' : `${pct(s.hitRate)} (${s.hits}/${s.total})`;
  }

  // ===== Records list =====
  function renderRecords() {
    const container = document.getElementById('records');
    const text = document.getElementById('filterText').value.trim().toLowerCase();
    const betType = document.getElementById('filterBetType').value;
    const month = document.getElementById('filterMonth').value;

    let filtered = records.slice();
    if (text) {
      filtered = filtered.filter(r =>
        (r.venue || '').toLowerCase().includes(text) ||
        (r.raceName || '').toLowerCase().includes(text) ||
        (r.memo || '').toLowerCase().includes(text) ||
        (r.selection || '').toLowerCase().includes(text)
      );
    }
    if (betType) filtered = filtered.filter(r => r.betType === betType);
    if (month) filtered = filtered.filter(r => (r.date || '').startsWith(month));

    filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                            (b.createdAt || 0) - (a.createdAt || 0));

    document.getElementById('recordCount').textContent =
      `${filtered.length} 件 / 全 ${records.length} 件`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>📋 記録がありません</p>
          <p style="font-size:0.85rem">「新規追加」タブから記録を追加してください</p>
        </div>`;
      return;
    }

    container.innerHTML = filtered.map(r => {
      const profit = (r.returnAmount || 0) - (r.invest || 0);
      const rate = r.invest > 0 ? (r.returnAmount || 0) / r.invest * 100 : null;
      const isWin = (r.returnAmount || 0) > 0;
      const profitClass = profit > 0 ? 'positive' : (profit < 0 ? 'negative' : '');
      return `
        <div class="record-card ${isWin ? 'win' : (r.invest > 0 ? 'lose' : '')}">
          <div class="record-header">
            <div>
              <strong>${escapeHtml(r.date || '')}</strong>
              <span class="record-meta">
                ${escapeHtml(r.venue || '')}${r.raceNo ? ` ${r.raceNo}R` : ''}${r.raceName ? ` ・ ${escapeHtml(r.raceName)}` : ''}
              </span>
            </div>
            <div class="record-tags">
              <span class="record-tag">${escapeHtml(r.betType || '')}</span>
              ${r.selection ? `<span class="record-tag">${escapeHtml(r.selection)}</span>` : ''}
            </div>
          </div>
          <div class="record-body">
            <div class="record-stat">
              <span class="label">投資</span>
              <span class="value">${yen(r.invest || 0)}</span>
            </div>
            <div class="record-stat">
              <span class="label">払戻</span>
              <span class="value">${yen(r.returnAmount || 0)}</span>
            </div>
            <div class="record-stat">
              <span class="label">収支</span>
              <span class="value ${profitClass}">${yenSigned(profit)}</span>
            </div>
            <div class="record-stat">
              <span class="label">回収率</span>
              <span class="value ${rate != null && rate >= 100 ? 'positive' : (rate != null ? 'negative' : '')}">${pct(rate)}</span>
            </div>
          </div>
          ${r.memo ? `<div class="record-memo">${escapeHtml(r.memo)}</div>` : ''}
          <div class="record-actions">
            <button data-action="edit" data-id="${r.id}">編集</button>
            <button data-action="delete" data-id="${r.id}" class="btn-delete">削除</button>
          </div>
        </div>`;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Event delegation for record actions
  document.getElementById('records').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') startEdit(id);
    else if (btn.dataset.action === 'delete') deleteRecord(id);
  });

  // Filter listeners
  ['filterText', 'filterBetType', 'filterMonth'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderRecords);
    document.getElementById(id).addEventListener('change', renderRecords);
  });
  document.getElementById('clearFilter').addEventListener('click', () => {
    document.getElementById('filterText').value = '';
    document.getElementById('filterBetType').value = '';
    document.getElementById('filterMonth').value = '';
    renderRecords();
  });

  // ===== Form (multi-bet) =====
  function createBetRow(data = {}) {
    const div = document.createElement('div');
    div.className = 'bet-row';
    div.innerHTML = `
      <button type="button" class="bet-remove" aria-label="この馬券を削除">×</button>
      <div class="bet-row-grid">
        <div class="form-field">
          <label>馬券種別 <span class="required">*</span></label>
          <select class="bet-type" required>
            <option value="">選択</option>
            ${BET_TYPES.map(t => `<option${t === data.betType ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>買い目</label>
          <input type="text" class="bet-selection" value="${escapeHtml(data.selection || '')}" placeholder="例: 5-7" autocomplete="off">
        </div>
        <div class="form-field">
          <label>投資額 (円) <span class="required">*</span></label>
          <input type="number" class="bet-invest" value="${data.invest || ''}" min="0" step="100" required placeholder="例: 1000" inputmode="numeric" pattern="[0-9]*">
        </div>
        <div class="form-field">
          <label>払戻金 (円)</label>
          <input type="number" class="bet-return" value="${data.returnAmount || ''}" min="0" step="10" placeholder="外れは0/空欄" inputmode="numeric" pattern="[0-9]*">
        </div>
      </div>
    `;
    div.querySelector('.bet-remove').addEventListener('click', () => {
      const rows = document.querySelectorAll('.bet-row');
      if (rows.length <= 1) return;
      div.remove();
      updateBetRowsState();
    });
    return div;
  }

  function addBetRow(data) {
    const row = createBetRow(data);
    document.getElementById('betRows').appendChild(row);
    updateBetRowsState();
    return row;
  }

  function clearBetRows() {
    document.getElementById('betRows').innerHTML = '';
  }

  function updateBetRowsState() {
    const rows = document.querySelectorAll('.bet-row');
    rows.forEach((row, i) => {
      const removeBtn = row.querySelector('.bet-remove');
      removeBtn.disabled = rows.length <= 1;
    });
    const count = rows.length;
    const submitBtn = document.getElementById('submitBtn');
    if (editingId) {
      submitBtn.textContent = '更新する';
      document.getElementById('addBetBtn').style.display = 'none';
      document.getElementById('betsCount').textContent = '';
    } else {
      submitBtn.textContent = count > 1 ? `${count} 件まとめて登録` : '登録する';
      document.getElementById('addBetBtn').style.display = '';
      document.getElementById('betsCount').textContent = `${count} 件`;
    }
  }

  function resetForm() {
    document.getElementById('recordForm').reset();
    document.getElementById('recordId').value = '';
    document.getElementById('date').value = todayISO();
    document.getElementById('cancelEditBtn').style.display = 'none';
    editingId = null;
    clearBetRows();
    addBetRow();
  }

  function startEdit(id) {
    const r = records.find(x => x.id === id);
    if (!r) return;
    editingId = id;
    document.getElementById('recordId').value = r.id;
    document.getElementById('date').value = r.date || '';
    document.getElementById('venue').value = r.venue || '';
    document.getElementById('raceNo').value = r.raceNo || '';
    document.getElementById('raceName').value = r.raceName || '';
    document.getElementById('memo').value = r.memo || '';
    clearBetRows();
    addBetRow({
      betType: r.betType,
      selection: r.selection,
      invest: r.invest,
      returnAmount: r.returnAmount,
    });
    document.getElementById('cancelEditBtn').style.display = '';
    document.querySelector('[data-tab="add"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteRecord(id) {
    if (!confirm('この記録を削除しますか？')) return;
    records = records.filter(r => r.id !== id);
    save();
    renderAll();
    showToast('削除しました', 'success');
  }

  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    resetForm();
    document.querySelector('[data-tab="list"]').click();
  });

  document.getElementById('addBetBtn').addEventListener('click', () => {
    const row = addBetRow();
    row.querySelector('.bet-type').focus();
  });

  document.getElementById('recordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const raceInfo = {
      date: document.getElementById('date').value,
      venue: document.getElementById('venue').value,
      raceNo: document.getElementById('raceNo').value
        ? Number(document.getElementById('raceNo').value) : null,
      raceName: document.getElementById('raceName').value.trim(),
      memo: document.getElementById('memo').value.trim(),
    };

    if (!raceInfo.date || !raceInfo.venue) {
      showToast('日付と競馬場を入力してください', 'error');
      return;
    }

    const betRows = [...document.querySelectorAll('.bet-row')];
    const bets = betRows.map(row => ({
      betType: row.querySelector('.bet-type').value,
      selection: row.querySelector('.bet-selection').value.trim(),
      invest: Number(row.querySelector('.bet-invest').value) || 0,
      returnAmount: Number(row.querySelector('.bet-return').value) || 0,
    }));

    for (let i = 0; i < bets.length; i++) {
      const b = bets[i];
      if (!b.betType || b.invest <= 0) {
        showToast(`${i + 1}件目の馬券種別と投資額を入力してください`, 'error');
        return;
      }
    }

    if (editingId) {
      const idx = records.findIndex(r => r.id === editingId);
      if (idx >= 0) {
        records[idx] = {
          ...records[idx],
          ...raceInfo,
          ...bets[0],
          updatedAt: Date.now(),
        };
      }
      showToast('更新しました', 'success');
    } else {
      const now = Date.now();
      bets.forEach((bet, i) => {
        records.push({
          id: uid(),
          createdAt: now + i,
          ...raceInfo,
          ...bet,
        });
      });
      showToast(bets.length > 1 ? `${bets.length} 件登録しました` : '登録しました', 'success');
    }
    save();
    resetForm();
    renderAll();
    document.querySelector('[data-tab="list"]').click();
  });

  // ===== Stats =====
  function renderStats() {
    renderGroupStats('monthlyStats', '月', r => (r.date || '').slice(0, 7), { sortDesc: true });
    renderDailyStats();
    renderGroupStats('betTypeStats', '馬券種別', r => r.betType || '(未設定)');
    renderGroupStats('venueStats', '競馬場', r => r.venue || '(未設定)');
  }

  function renderGroupStats(tableId, label, keyFn, opts = {}) {
    const table = document.getElementById(tableId);
    if (records.length === 0) {
      table.innerHTML = `<tbody><tr><td colspan="6" style="text-align:center;color:var(--color-muted)">記録がありません</td></tr></tbody>`;
      return;
    }
    const groups = new Map();
    for (const r of records) {
      const key = keyFn(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    let entries = [...groups.entries()].map(([k, items]) => [k, calcStats(items)]);
    if (opts.sortDesc) entries.sort((a, b) => b[0].localeCompare(a[0]));
    else entries.sort((a, b) => b[1].profit - a[1].profit);

    const total = calcStats(records);
    table.innerHTML = `
      <thead>
        <tr>
          <th>${label}</th>
          <th>件数</th>
          <th>投資</th>
          <th>払戻</th>
          <th>収支</th>
          <th>回収率</th>
          <th>的中率</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(([k, s]) => `
          <tr>
            <td>${escapeHtml(k)}</td>
            <td>${s.total}</td>
            <td>${yen(s.invest)}</td>
            <td>${yen(s.ret)}</td>
            <td class="${s.profit >= 0 ? 'positive' : 'negative'}">${yenSigned(s.profit)}</td>
            <td class="${s.rate != null && s.rate >= 100 ? 'positive' : 'negative'}">${pct(s.rate)}</td>
            <td>${pct(s.hitRate)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>合計</td>
          <td>${total.total}</td>
          <td>${yen(total.invest)}</td>
          <td>${yen(total.ret)}</td>
          <td class="${total.profit >= 0 ? 'positive' : 'negative'}">${yenSigned(total.profit)}</td>
          <td class="${total.rate != null && total.rate >= 100 ? 'positive' : 'negative'}">${pct(total.rate)}</td>
          <td>${pct(total.hitRate)}</td>
        </tr>
      </tfoot>`;
  }

  function renderDailyStats() {
    const table = document.getElementById('dailyStats');
    if (records.length === 0) {
      table.innerHTML = `<tbody><tr><td colspan="6" style="text-align:center;color:var(--color-muted)">記録がありません</td></tr></tbody>`;
      return;
    }
    const groups = new Map();
    for (const r of records) {
      const key = r.date || '(不明)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const entries = [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([k, items]) => [k, calcStats(items)]);

    table.innerHTML = `
      <thead>
        <tr>
          <th>日付</th>
          <th>件数</th>
          <th>投資</th>
          <th>払戻</th>
          <th>収支</th>
          <th>回収率</th>
          <th>的中率</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(([k, s]) => `
          <tr>
            <td>${escapeHtml(k)}</td>
            <td>${s.total}</td>
            <td>${yen(s.invest)}</td>
            <td>${yen(s.ret)}</td>
            <td class="${s.profit >= 0 ? 'positive' : 'negative'}">${yenSigned(s.profit)}</td>
            <td class="${s.rate != null && s.rate >= 100 ? 'positive' : 'negative'}">${pct(s.rate)}</td>
            <td>${pct(s.hitRate)}</td>
          </tr>`).join('')}
      </tbody>`;
  }

  // ===== Data management =====
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `keibasyushi_${todayISO()}.json`);
    showToast('エクスポートしました', 'success');
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const headers = ['date', 'venue', 'raceNo', 'raceName', 'betType', 'selection', 'invest', 'returnAmount', 'memo'];
    const rows = [headers.join(',')];
    for (const r of records) {
      rows.push(headers.map(h => csvEscape(r[h] ?? '')).join(','));
    }
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `keibasyushi_${todayISO()}.csv`);
    showToast('CSVをエクスポートしました', 'success');
  });

  function csvEscape(v) {
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById('importBtn').addEventListener('click', () => {
    const file = document.getElementById('importFile').files[0];
    if (!file) {
      showToast('ファイルを選択してください', 'error');
      return;
    }
    if (!confirm('既存データを上書きします。よろしいですか？')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error('Invalid format');
        records = parsed.map(r => ({ id: r.id || uid(), createdAt: r.createdAt || Date.now(), ...r }));
        save();
        renderAll();
        showToast(`${records.length} 件をインポートしました`, 'success');
      } catch (err) {
        showToast('インポートに失敗しました: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('全ての記録を削除します。本当によろしいですか？')) return;
    if (!confirm('この操作は取り消せません。最終確認です。よろしいですか？')) return;
    records = [];
    save();
    renderAll();
    showToast('全データを削除しました', 'success');
  });

  // ===== Init =====
  function renderAll() {
    renderSummary();
    renderRecords();
    if (document.getElementById('tab-stats').classList.contains('active')) {
      renderStats();
    }
  }

  populateBetTypeFilter();
  resetForm();
  renderAll();
})();
