// ========== 加载全部 ==========
async function loadAllData() {
  document.getElementById('statsRow').innerHTML = '<div class="loading">正在刷新数据</div>';
  await loadHealth();
  const tasks = [
    loadStats(),
    loadAlerts(),
    loadMonthlyTrend(),
    loadFormDist(),
    loadTaskStatus(),
    loadFireTrend(),
    loadLightTrend(),
    loadAidTrend(),
    loadEyeTrend(),
    loadMemberRanking(),
    loadTaskDetails(),
    loadLatestRecords(),
    loadFirstAidExpiry(),
    loadFireMaintenance(),
    loadFireScrap(),
    loadFireAnalysis(),
    loadLightAnalysis()
  ];
  const results = await Promise.allSettled(tasks);
  const failed = results.filter(r => r.status === 'rejected');
  // 即便部分失败，也要清除主 loading（防止永久 "加载中"）
  const sr = document.getElementById('statsRow');
  if (sr && sr.querySelector('.loading')) {
    if (failed.length > 0) {
      sr.innerHTML = `<div style="color:#ef4444;padding:16px;">⚠️ 部分数据加载失败（${failed.length}/${tasks.length}）。<br>常见原因：部署平台无法连接阿里云 RDS（白名单/网络）。请查看右上角数据库状态。</div>`;
    } else {
      sr.innerHTML = `<div style="color:#94a3b8;padding:16px;">未能获取核心指标，请刷新重试。</div>`;
    }
  }
  if (failed.length > 0) console.warn('部分加载失败:', failed.map(f => f.reason?.message));
}

// ========== 数据库健康状态诊断 ==========
async function loadHealth() {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  try {
    const h = await fetchAPI('/health');
    if (h.status === 'ok') {
      el.innerHTML = '🟢 数据库已连接';
      el.style.color = '#16a34a';
    } else {
      el.innerHTML = '🔴 数据库异常：' + (h.message || '未知');
      el.style.color = '#ef4444';
    }
  } catch (err) {
    el.innerHTML = '🔴 无法连接后端：' + err.message;
    el.style.color = '#ef4444';
  }
}

// ========== 登录后启动看板 ==========
let _refreshTimer = null;
function startDashboard() {
  loadAllData();
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(loadAllData, 5 * 60 * 1000);
  const lb = document.getElementById('logoutBtn');
  if (lb) lb.style.display = '';
}

// 首次加载（在 core.js 的 initAuth 校验通过后调用 startDashboard；此处仅触发鉴权流程）
initAuth();
