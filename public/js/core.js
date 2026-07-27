
// ========== 全局变量 ==========
const charts = {};
let fireAnalysisData = [];
let firstAidData = [];
let maintenanceData = [];
let currentFireTab = 'spec';

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

// ========== 工具函数 ==========
const ACCESS_TOKEN = new URLSearchParams(location.search).get('token') || '';
function showAuthBanner() {
  if (document.getElementById('authBanner')) return;
  const b = document.createElement('div');
  b.id = 'authBanner';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1e293b;color:#fff;padding:10px 16px;font-size:13px;text-align:center;';
  b.innerHTML = '🔒 看板已启用访问令牌：请在地址后附加 <code>?token=访问令牌</code> 后重新打开。';
  document.body.appendChild(b);
}

async function fetchAPI(endpoint, timeout = 14000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
        let url = `/api${endpoint}`;
    if (ACCESS_TOKEN) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}token=${encodeURIComponent(ACCESS_TOKEN)}`;
    }
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 401) { showAuthBanner(); throw new Error('未授权：缺少或错误的访问令牌'); }
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

// 日期选择器
function setQuickDate(days) {
  const end = new Date();
  const start = new Date();
  if (days > 0) {
    start.setDate(start.getDate() - days);
  } else {
    start.setFullYear(2020, 0, 1);
  }
  document.getElementById('startDate').value = start.toISOString().split('T')[0];
  document.getElementById('endDate').value = end.toISOString().split('T')[0];
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
