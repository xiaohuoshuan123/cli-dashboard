
// ========== 全局变量 ==========
const charts = {};
let fireAnalysisData = [];
let firstAidData = [];
let maintenanceData = [];
let currentFireTab = 'spec';
let lightAnalysisData = null;
let currentLightTab = 'device';

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
    const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(t)}`, { signal: controller.signal });
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
    let url = `/api${endpoint}`;
    const tok = getToken();
    if (tok) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}token=${encodeURIComponent(tok)}`;
    }
    const res = await fetch(url, { signal: controller.signal });
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

// 本地日期字符串（避免 toISOString 在凌晨因 UTC 偏移差一天）
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 日期选择器
function setQuickDate(days) {
  const end = new Date();
  const start = new Date();
  if (days > 0) {
    start.setDate(start.getDate() - days);
  } else {
    start.setFullYear(2020, 0, 1);
  }
  document.getElementById('startDate').value = toLocalDateStr(start);
  document.getElementById('endDate').value = toLocalDateStr(end);
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
