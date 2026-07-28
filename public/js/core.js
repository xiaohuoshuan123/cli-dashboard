
// ========== 全局变量 ==========
const charts = {};
let fireAnalysisData = [];
let firstAidData = [];
let maintenanceData = [];
let currentFireTab = 'spec';
let lightAnalysisData = null;
let currentLightTab = 'inspector';

// ========== 饼图/环形图数据标签插件（离线安全，不依赖 CDN）==========
// 在每片扇区中心显示 数值 + 百分比
function getLuminance(hex) {
  if (typeof hex !== 'string') return 0.5;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return 0.5;
  const r = parseInt(c.substr(0, 2), 16) / 255,
        g = parseInt(c.substr(2, 2), 16) / 255,
        b = parseInt(c.substr(4, 2), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const pieLabelPlugin = {
  id: 'pieLabels',
  afterDatasetsDraw(chart) {
    const type = chart.config.type;
    if (type !== 'pie' && type !== 'doughnut') return;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data.length) return;
    const data = chart.data.datasets[0].data;
    const total = data.reduce((a, b) => a + (Number(b) || 0), 0);
    if (!total) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    meta.data.forEach((arc, i) => {
      const val = Number(data[i]) || 0;
      if (val <= 0) return;
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const r = arc.outerRadius * 0.6;
      const x = arc.x + Math.cos(angle) * r;
      const y = arc.y + Math.sin(angle) * r;
      const bg = chart.data.datasets[0].backgroundColor[i] || '#888';
      ctx.fillStyle = getLuminance(bg) > 0.6 ? '#1f2937' : '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(val, x, y - 6);
      ctx.font = '10px sans-serif';
      ctx.fillText((val / total * 100).toFixed(1) + '%', x, y + 7);
    });
    ctx.restore();
  }
};
Chart.register(pieLabelPlugin);

// ========== 柱状图数值标签插件（离线安全，不依赖 CDN）==========
// 在每根柱子顶部居中显示其数值，满足"柱状分析图要体现数值"的需求。
const barLabelPlugin = {
  id: 'barValues',
  afterDatasetsDraw(chart) {
    if (chart.config.type !== 'bar') return;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length) return;
    const data = chart.data.datasets[0].data;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    meta.data.forEach((bar, i) => {
      const v = data[i];
      if (v === null || v === undefined) return;
      const text = (typeof formatNumber === 'function') ? formatNumber(v) : String(v);
      ctx.fillText(text, bar.x, bar.y - 3);
    });
    ctx.restore();
  }
};
Chart.register(barLabelPlugin);

// ========== 访问令牌 / 登录弹窗 ==========
// 令牌保存在 sessionStorage（关闭标签页即失效），避免明文暴露在 URL 中。
function getToken() { return sessionStorage.getItem('dash_token') || ''; }
function setToken(t) { sessionStorage.setItem('dash_token', t); }
function clearToken() { sessionStorage.removeItem('dash_token'); }

async function validateToken(t) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(`/api/auth/verify`, {
      signal: controller.signal,
      headers: { 'x-api-token': t }
    });
    return res.status === 200;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(id);
  }
}

function showLogin() {
  document.body.classList.add('auth-locked');
  const m = document.getElementById('loginModal');
  if (m) m.style.display = 'flex';
}
function hideLogin() {
  document.body.classList.remove('auth-locked');
  const m = document.getElementById('loginModal');
  if (m) m.style.display = 'none';
}

async function attemptLogin() {
  const input = document.getElementById('tokenInput');
  const err = document.getElementById('loginError');
  const t = (input.value || '').trim();
  if (!t) { err.textContent = '请输入访问令牌'; return; }
  const ok = await validateToken(t);
  if (ok) {
    setToken(t);
    err.textContent = '';
    hideLogin();
    if (typeof startDashboard === 'function') startDashboard();
  } else {
    err.textContent = '令牌错误，请重试（默认令牌见部署文档）';
  }
}

function logout() {
  clearToken();
  if (typeof _refreshTimer !== 'undefined' && _refreshTimer) clearInterval(_refreshTimer);
  showLogin();
  const lb = document.getElementById('logoutBtn');
  if (lb) lb.style.display = 'none';
}

// 页面初始化鉴权：URL 带 ?token= 时优先采用并写入会话；否则读会话令牌；都没有则弹登录框。
async function initAuth() {
  const urlTok = new URLSearchParams(location.search).get('token');
  if (urlTok) {
    setToken(urlTok.trim());
    history.replaceState(null, '', location.pathname);
  }
  const tok = getToken();
  if (tok) {
    const ok = await validateToken(tok);
    if (ok) { hideLogin(); if (typeof startDashboard === 'function') startDashboard(); return; }
    clearToken();
  }
  showLogin();
}

async function fetchAPI(endpoint, timeout = 14000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const url = `/api${endpoint}`;
    const tok = getToken();
    const headers = {};
    if (tok) headers['x-api-token'] = tok;
    const res = await fetch(url, { signal: controller.signal, headers });
    if (res.status === 401) {
      showLogin();
      throw new Error('未授权：令牌缺失或已失效，请重新登录');
    }
    if (!res.ok) {
      let msg = `API ${endpoint} 返回 ${res.status}`;
      try {
        const body = await res.json();
        if (body && body.hint) msg += ` —— ${body.hint}`;
      } catch (e) {}
      throw new Error(msg);
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`请求超时（${endpoint}）`);
    throw err;
  } finally {
    clearTimeout(id);
  }
}

function formatNumber(n) {
  return n?.toLocaleString() || '0';
}

// 文本转义：避免单元格内容含 < & > 时破坏 Excel 表格结构（尤其原始库表导出）
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')   // 防止跳出 HTML 属性（value="..." / title="..."）
    .replace(/'/g, '&#39;')    // 防止跳出单引号属性与内联上下文
    .replace(/\r?\n/g, ' '); // 单元格内换行转空格，避免 Excel 行错位
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('zh-CN');
}

function formatDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

// ========== 表格导出 Excel（无依赖，HTML 表格转 .xls）==========
// 导出当前表格（含筛选后）的可见行，中文以 UTF-8 BOM 保证不乱码。
function downloadExcelHtml(tableHtml, fileName) {
  // 确保 <table> 带 border 属性，Excel 渲染表格线更可靠
  const safeHtml = tableHtml.replace(/<table(\s|>)/i, '<table border="1"$1');
  const excel = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td,th{border:1px solid #ddd;}</style></head><body>${safeHtml}</body></html>`;
  const blob = new Blob(['\ufeff' + excel], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (fileName || '导出') + '.xls';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportTable(tableId, fileName) {
  const el = document.getElementById(tableId);
  if (!el) { alert('找不到表格：' + tableId); return; }
  // 关键修复：id 通常挂在 <tbody> 上，必须用 closest('table') 取到真正的 <table> 根节点，
  // 否则 outerHTML 只有 <tbody> 而无 <table> 包裹，Excel 打开会把所有数据塞进 A1 单元格。
  const table = el.closest('table') || el;
  const clone = table.cloneNode(true);
  clone.querySelectorAll('.btn-export').forEach(b => b.remove());
  downloadExcelHtml(clone.outerHTML, fileName);
}

// 导出草料原始批量码信息表（template_codeinfo_d10/d15），不做任何加工
async function exportRawDevice(type, fileName) {
  try {
    const data = await fetchAPI(`/devices/raw?type=${encodeURIComponent(type)}`);
    const cols = data.columns || [];
    const rows = data.rows || [];
    const head = '<tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
    const body = rows.map(r =>
      '<tr>' + cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('') + '</tr>'
    ).join('');
    downloadExcelHtml(`<table border="1"><thead>${head}</thead><tbody>${body}</tbody></table>`, fileName);
  } catch (e) {
    alert('导出失败：' + e.message);
  }
}

// 本地日期字符串（避免 toISOString 在凌晨因 UTC 偏移差一天）
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===== 日期选择器：flatpickr（统一中文「年/月/日」显示，底层值仍为 ISO YYYY-MM-DD）=====
// 原生 <input type="date"> 的显示格式由浏览器/系统区域决定，前端无法强制为中文，
// 故改用 flatpickr 的 altInput：可见框显示 altFormat「Y年m月d日」，隐藏原 input 存 ISO。
// 所有现状读取 getElementById('startDate').value 的代码无需改动（仍拿到 ISO）。
let fpStart = null, fpEnd = null;
if (window.flatpickr) {
  try {
    flatpickr.localize(flatpickr.l10ns.zh);
    fpStart = flatpickr('#startDate', { dateFormat: 'Y-m-d', altInput: true, altFormat: 'Y年m月d日', allowInput: true });
    fpEnd = flatpickr('#endDate', { dateFormat: 'Y-m-d', altInput: true, altFormat: 'Y年m月d日', allowInput: true });
    if (fpStart && fpStart.altInput) fpStart.altInput.placeholder = '年 / 月 / 日';
    if (fpEnd && fpEnd.altInput) fpEnd.altInput.placeholder = '年 / 月 / 日';
  } catch (e) {
    console.warn('flatpickr 初始化失败，回退为原生输入框：', e);
    fpStart = fpEnd = null;
  }
}

// 日期选择器（快捷范围）。所有边界按【北京时间 Asia/Shanghai】计算。
// 关键：用"绝对 instant + 8h"后的 getUTC* 分量作为北京日历分量——
// 因为任意时刻的北京日历 = 其 UTC 分量 + 8h，故 instant+8h 的 UTC 分量即北京日历。
// 绝不能用 getTimezoneOffset() 补偿：浏览器在 UTC+8 时 offset=-480，会把 +8h 抵消，
// 导致 getUTCDate() 取到 UTC 分量（比北京晚一天，如北京 07-29 06:15 → UTC 07-28 22:15 → 返回 28）。
function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

function setQuickDate(kind) {
  const n = new Date();
  // 北京日历分量（与浏览器所在时区无关）
  const bj = new Date(n.getTime() + 8 * 3600000);
  const Y = bj.getUTCFullYear(), M = bj.getUTCMonth(), D = bj.getUTCDate(), dow = bj.getUTCDay();
  let s, e;
  if (kind === 'week') {                 // 本周：周一 00:00 ~ 现在
    const back = (dow + 6) % 7;          // 周一=0
    const sd = new Date(bj.getTime() - back * 86400000);
    s = ymd(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
    e = ymd(Y, M, D);
  } else if (kind === 'month') {         // 本月：1 日 00:00 ~ 现在
    s = ymd(Y, M, 1); e = ymd(Y, M, D);
  } else if (kind === 'lastMonth') {     // 上月：上月 1 日 ~ 上月最后一天
    const lm = M - 1, ly = lm < 0 ? Y - 1 : Y, lmm = (lm + 12) % 12;
    const lastDay = new Date(Date.UTC(ly, lmm + 1, 0)).getUTCDate();
    s = ymd(ly, lmm, 1); e = ymd(ly, lmm, lastDay);
  } else if (kind === 'year') {          // 本年：1 月 1 日 ~ 现在
    s = ymd(Y, 0, 1); e = ymd(Y, M, D);
  } else {                               // 全部
    s = '2020-01-01'; e = ymd(Y, M, D);
  }
  if (fpStart && fpEnd) {
    fpStart.setDate(s, true);
    fpEnd.setDate(e, true);
  } else {
    document.getElementById('startDate').value = s;
    document.getElementById('endDate').value = e;
  }
  loadAllData();
}

function applyDateFilter() {
  loadAllData();
}

function toggleSection(id) {
  const el = document.getElementById(id);
  el.classList.toggle('collapsed');
}

function switchFireTab(tab, el) {
  currentFireTab = tab;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderFireAnalysis();
}

// 更新时间
function updateTime() {
  const now = new Date();
  document.getElementById('currentTime').textContent = now.toLocaleTimeString('zh-CN');
}
setInterval(updateTime, 1000);
updateTime();
