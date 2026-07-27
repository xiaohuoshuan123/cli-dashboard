// ========== 加载核心指标 ==========
async function loadStats() {
  const stats = await fetchAPI('/stats');
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card fade-in">
      <div class="number">${formatNumber(stats.codeCount)}</div>
      <div class="label">二维码总数</div>
    </div>
    <div class="stat-card fade-in">
      <div class="number">${formatNumber(stats.recordCount)}</div>
      <div class="label">表单记录</div>
    </div>
    <div class="stat-card fade-in">
      <div class="number">${formatNumber(stats.taskCount)}</div>
      <div class="label">计划执行</div>
    </div>
    <div class="stat-card fade-in">
      <div class="number">${stats.completionRate}%</div>
      <div class="label">计划完成率</div>
    </div>
    <div class="stat-card fade-in">
      <div class="number">${formatNumber(stats.memberCount)}</div>
      <div class="label">参与人数</div>
    </div>
    <div class="stat-card fade-in">
      <div class="number">${stats.timeRange ? Math.ceil((new Date(stats.timeRange.latest) - new Date(stats.timeRange.earliest)) / 86400000) : '--'}</div>
      <div class="label">覆盖天数</div>
    </div>
  `;
  if (stats.timeRange) {
    document.getElementById('dataTimeRange').textContent = 
      `${formatDate(stats.timeRange.earliest)} ~ ${formatDate(stats.timeRange.latest)}`;
  }
  return stats;
}

// ========== 告警 ==========
async function loadAlerts() {
  const container = document.getElementById('alertsContainer');
  const alerts = [];
  
  // 压力表异常
  const pressure = await fetchAPI('/pressure-gauge/status');
  const pressureBad = pressure.find(p => p.status && p.status.includes('异常'));
  if (pressureBad) {
    alerts.push(`<div class="alert alert-danger">⚠️ 压力表：${pressureBad.status} ${pressureBad.count} 个，需立即处理</div>`);
  }
  
  // 气瓶异常
  const gas = await fetchAPI('/fire-cylinder/status');
  const gasBad = gas.find(g => g.status && (g.status.includes('压力不足') || g.status.includes('库存未检')));
  if (gasBad) {
    alerts.push(`<div class="alert alert-warn">⚠️ 消防气瓶：${gasBad.status} ${gasBad.count} 个</div>`);
  }
  
  // 灭火器异常
  const fireResults = await fetchAPI('/fire-extinguisher/results');
  const fireBad = fireResults.find(f => f.result && f.result.includes('异常'));
  if (fireBad) {
    alerts.push(`<div class="alert alert-warn">⚠️ 灭火器检查异常 ${fireBad.count} 条记录</div>`);
  }
  
  // 超期任务
  const overdue = await fetchAPI('/tasks/overdue');
  if (overdue && overdue.length > 0) {
    alerts.push(`<div class="alert alert-danger">⚠️ 超期/未完成计划任务 ${overdue.length} 条，需跟进</div>`);
  }
  
  if (alerts.length === 0) {
    alerts.push(`<div class="alert alert-ok">✅ 所有设备运行正常，无异常状态</div>`);
  }
  
  container.innerHTML = alerts.join('');
}

// ========== 月度趋势 ==========
async function loadMonthlyTrend() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const data = await fetchAPI(`/trends/monthly?${params}`);
  destroyChart('monthly');
  charts.monthly = new Chart(document.getElementById('monthlyChart'), {
    type: 'line',
    data: {
      labels: data.map(d => d.month.replace('20', '')),
      datasets: [{
        label: '记录数',
        data: data.map(d => d.count),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
    }
  });
}

// ========== 表单分布 ==========
async function loadFormDist() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const data = await fetchAPI(`/forms/distribution?${params}`);
  destroyChart('formDist');
  charts.formDist = new Chart(document.getElementById('formDistChart'), {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#94a3b8','#84cc16','#a855f7','#14b8a6']
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } }
    }
  });
}

// ========== 计划执行状态 ==========
async function loadTaskStatus() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const data = await fetchAPI(`/tasks/status?${params}`);
  const colorMap = { '完成': '#10b981', '超期未完成': '#ef4444', '超期完成': '#f59e0b', '未完成': '#94a3b8' };
  destroyChart('taskStatus');
  charts.taskStatus = new Chart(document.getElementById('taskStatusChart'), {
    type: 'pie',
    data: {
      labels: data.map(d => d.status),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: data.map(d => colorMap[d.status] || '#64748b')
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 12 } } } }
    }
  });
}

// ========== 灭火器趋势 ==========
async function loadFireTrend() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const data = await fetchAPI(`/fire-extinguisher/trend?${params}`);
  destroyChart('fire');
  charts.fire = new Chart(document.getElementById('fireChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.month.replace('20', '')),
      datasets: [{ label: '检查数', data: data.map(d => d.count), backgroundColor: '#3b82f6' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// ========== 应急灯趋势 ==========
async function loadLightTrend() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const data = await fetchAPI(`/emergency-lights/trend?${params}`);
  destroyChart('light');
  charts.light = new Chart(document.getElementById('lightChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.month.replace('20', '')),
      datasets: [{ label: '检查数', data: data.map(d => d.count), backgroundColor: '#10b981' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// ========== 急救药箱趋势 ==========
async function loadAidTrend() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const data = await fetchAPI(`/first-aid/trend?${params}`);
  destroyChart('aid');
  charts.aid = new Chart(document.getElementById('aidChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.month.replace('20', '')),
      datasets: [{ label: '点检数', data: data.map(d => d.count), backgroundColor: '#f59e0b' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// ========== 洗眼器趋势 ==========
async function loadEyeTrend() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const data = await fetchAPI(`/eye-wash/trend?${params}`);
  destroyChart('eye');
  charts.eye = new Chart(document.getElementById('eyeChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.month.replace('20', '')),
      datasets: [{ label: '点检数', data: data.map(d => d.count), backgroundColor: '#8b5cf6' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// ========== 压力表状态 ==========
async function loadPressure() {
  const data = await fetchAPI('/pressure-gauge/status');
  const colorMap = { '正常（检验通过）': '#10b981', '异常（超期未检）': '#ef4444' };
  destroyChart('pressure');
  charts.pressure = new Chart(document.getElementById('pressureChart'), {
    type: 'pie',
    data: {
      labels: data.map(d => d.status),
      datasets: [{ data: data.map(d => d.count), backgroundColor: data.map(d => colorMap[d.status] || '#64748b') }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
  });
}

// ========== 气瓶状态 ==========
async function loadGas() {
  const data = await fetchAPI('/fire-cylinder/status');
  const colorMap = { '正常使用': '#10b981', '库存未检': '#f59e0b', '压力不足': '#ef4444' };
  destroyChart('gas');
  charts.gas = new Chart(document.getElementById('gasChart'), {
    type: 'pie',
    data: {
      labels: data.map(d => d.status),
      datasets: [{ data: data.map(d => d.count), backgroundColor: data.map(d => colorMap[d.status] || '#64748b') }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
  });
}

// ========== 检查结果汇总 ==========
async function loadResults() {
  const fire = await fetchAPI('/fire-extinguisher/results');
  const light = await fetchAPI('/emergency-lights/results');
  const allResults = {};
  fire.forEach(r => { allResults['灭火器-' + r.result] = r.count; });
  light.forEach(r => { allResults['应急灯-' + r.result] = r.count; });
  
  destroyChart('result');
  charts.result = new Chart(document.getElementById('resultChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(allResults),
      datasets: [{
        data: Object.values(allResults),
        backgroundColor: ['#10b981', '#ef4444', '#10b981', '#ef4444']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
  });
}

// ========== 人员排行 ==========
async function loadMemberRanking() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const members = await fetchAPI(`/members/ranking?${params}`);
  const total = members.reduce((s, m) => s + m.count, 0);
  document.getElementById('memberRankTable').innerHTML = members.map((m, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${m.name}</td>
      <td><strong>${formatNumber(m.count)}</strong></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="progress-bar" style="width:80px;"><div class="fill" style="width:${(m.count/members[0].count*100).toFixed(0)}%"></div></div>
          <span style="font-size:11px;color:var(--text2);">${(m.count/total*100).toFixed(1)}%</span>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadFireRanking() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const members = await fetchAPI(`/fire-extinguisher/ranking?${params}`);
  const total = members.reduce((s, m) => s + m.count, 0);
  document.getElementById('fireRankTable').innerHTML = members.map((m, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${m.name}</td>
      <td><strong>${formatNumber(m.count)}</strong></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="progress-bar" style="width:80px;"><div class="fill" style="width:${(m.count/members[0].count*100).toFixed(0)}%"></div></div>
          <span style="font-size:11px;color:var(--text2);">${(m.count/total*100).toFixed(1)}%</span>
        </div>
      </td>
    </tr>
  `).join('');
}

// ========== 计划执行明细 ==========
async function loadTaskDetails() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  const tasks = await fetchAPI(`/tasks/details?${params}`);
  document.getElementById('taskDetailTable').innerHTML = tasks.map(t => {
    const rate = t.total > 0 ? ((t.completed / t.total) * 100).toFixed(1) : 0;
    return `
      <tr>
        <td>${t.name}</td>
        <td>${formatNumber(t.total)}</td>
        <td><span class="badge badge-green">${formatNumber(t.completed)}</span></td>
        <td><span class="badge badge-yellow">${formatNumber(t.overdue_complete)}</span></td>
        <td><span class="badge badge-red">${formatNumber(t.overdue_incomplete)}</span></td>
        <td><span class="badge badge-blue">${formatNumber(t.incomplete)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-bar" style="width:100px;"><div class="fill" style="width:${rate}%"></div></div>
            <span style="font-weight:600;">${rate}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ========== 最新记录 ==========
async function loadLatestRecords() {
  const records = await fetchAPI('/records/latest?limit=15');
  document.getElementById('latestRecordsTable').innerHTML = records.map(r => `
    <tr>
      <td>${r.record_id}</td>
      <td>${r.记录单名称}</td>
      <td>${r.记录人}</td>
      <td>${formatDateTime(r.记录时间)}</td>
      <td><span class="badge badge-green">${r.状态}</span></td>
    </tr>
  `).join('');
}

// ========== 急救药箱药品有效期 ==========
async function loadFirstAidExpiry() {
  firstAidData = await fetchAPI('/first-aid/expiry');
  renderFirstAidExpiry();
}

function renderFirstAidExpiry() {
  const filter = document.getElementById('expiryFilter').value;
  const tbody = document.getElementById('firstAidTable');

  const statusText = s => s === 'expired' ? '已过期' : s === 'expiring' ? '临期' : s === 'valid' ? '有效' : '未知';

  tbody.innerHTML = firstAidData.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'expired') return row.hasExpired;
    if (filter === 'expiring') return row.expiringCount > 0;
    if (filter === 'ok') return !row.hasExpired && row.expiringCount === 0;
    return true;
  }).map(row => {
    const chips = row.drugs.map(d => {
      const cls = d.status === 'expired' ? 'med-chip med-red' : d.status === 'expiring' ? 'med-chip med-yellow' : d.status === 'valid' ? 'med-chip med-green' : 'med-chip med-gray';
      const txt = d.status === 'expired' ? `过期${Math.abs(d.remainingDays)}天` : d.remainingDays !== null ? `剩${d.remainingDays}天` : '无日期';
      return `<span class="${cls}" title="${d.raw}">${d.name}<br><small>${d.expiry||'-'} · ${txt}</small></span>`;
    }).join('');
    const badge = row.hasExpired
      ? `<span class="badge badge-red">过期${row.expiredCount}</span><span class="badge badge-yellow">临期${row.expiringCount}</span>`
      : row.expiringCount > 0
        ? `<span class="badge badge-yellow">临期${row.expiringCount}</span>`
        : `<span class="badge badge-green">全部有效</span>`;
    return `<tr>
      <td style="font-weight:600;">${row.boxName || '未知'}</td>
      <td>${row.location || '-'}</td>
      <td>${row.recorder || '-'}</td>
      <td>${badge}</td>
      <td><div class="med-wrap">${chips}</div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">无匹配药箱</td></tr>';
}

// ========== 灭火器维修充装预警 ==========
async function loadFireMaintenance() {
  const days = document.getElementById('maintenanceDays').value;
  maintenanceData = await fetchAPI(`/fire-extinguisher/maintenance?days=${days}`);
  
  const now = new Date();
  const deptCount = {};
  maintenanceData.forEach(m => {
    const dept = m.dept || '未知';
    const d = new Date(m.next_date);
    const diff = Math.ceil((d - now) / (1000*60*60*24));
    if (!deptCount[dept]) deptCount[dept] = 0;
    deptCount[dept]++;
  });
  
  // 图表
  destroyChart('maintenance');
  charts.maintenance = new Chart(document.getElementById('maintenanceChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(deptCount),
      datasets: [{
        label: '需维修数量',
        data: Object.values(deptCount),
        backgroundColor: '#ef4444'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
  
  // 表格
  document.getElementById('maintenanceTable').innerHTML = maintenanceData.map(m => {
    const d = new Date(m.next_date);
    const diff = Math.ceil((d - now) / (1000*60*60*24));
    const cls = diff < 0 ? 'expired' : diff <= 30 ? 'expiring-soon' : 'valid';
    return `
      <tr>
        <td>${m.code}</td>
        <td>${m.name}</td>
        <td>${m.location}</td>
        <td>${m.inspector}</td>
        <td>${m.dept}</td>
        <td>${m.next_date}</td>
        <td class="${cls}">${diff < 0 ? '已过期' + Math.abs(diff) + '天' : diff + '天'}</td>
      </tr>
    `;
  }).join('');
}

// ========== 灭火器强制报废预警 ==========
async function loadFireScrap() {
  const days = document.getElementById('scrapDays').value;
  const data = await fetchAPI(`/fire-extinguisher/scrap?days=${days}`);
  const now = new Date();
  const deptCount = {};
  data.forEach(m => {
    const dept = m.dept || '未知';
    deptCount[dept] = (deptCount[dept] || 0) + 1;
  });

  destroyChart('scrap');
  charts.scrap = new Chart(document.getElementById('scrapChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(deptCount),
      datasets: [{
        label: '将强制报废数量',
        data: Object.values(deptCount),
        backgroundColor: '#8b5cf6'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  document.getElementById('scrapTable').innerHTML = data.length > 0 ? data.map(m => {
    const d = new Date(m.scrap_date);
    const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    const cls = diff < 0 ? 'expired' : diff <= 180 ? 'expiring-soon' : 'valid';
    return `
      <tr>
        <td>${m.code}</td>
        <td>${m.name}</td>
        <td>${m.location}</td>
        <td>${m.inspector}</td>
        <td>${m.dept}</td>
        <td>${m.manufacturer || '-'}</td>
        <td>${m.scrap_date}</td>
        <td class="${cls}">${diff < 0 ? '已过期' + Math.abs(diff) + '天' : diff + '天'}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">当前筛选范围内无即将强制报废的灭火器</td></tr>';
}

// ========== 灭火器多维度分析 ==========
async function loadFireAnalysis() {
  fireAnalysisData = await fetchAPI('/fire-extinguisher/analysis');
  // 填充筛选下拉
  const depts = [...new Set(fireAnalysisData.map(f => f.dept).filter(Boolean))].sort();
  const mfs = [...new Set(fireAnalysisData.map(f => f.manufacturer).filter(Boolean))].sort();
  document.getElementById('fireDeptFilter').innerHTML =
    '<option value="">全部责任部门</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('fireMfFilter').innerHTML =
    '<option value="">全部生产厂家</option>' + mfs.map(m => `<option value="${m}">${m}</option>`).join('');
  renderFireAnalysis();
  renderFireDetail();
}

function clearFireFilter() {
  document.getElementById('fireSearch').value = '';
  document.getElementById('fireDeptFilter').value = '';
  document.getElementById('fireMfFilter').value = '';
  renderFireDetail();
}

function renderFireDetail() {
  const kw = document.getElementById('fireSearch').value.trim().toLowerCase();
  const dept = document.getElementById('fireDeptFilter').value;
  const mf = document.getElementById('fireMfFilter').value;
  const filtered = fireAnalysisData.filter(f => {
    if (dept && f.dept !== dept) return false;
    if (mf && f.manufacturer !== mf) return false;
    if (kw) {
      const hay = [f.code, f.spec, f.location, f.inspector, f.dept, f.manufacturer]
        .join(' ').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
  document.getElementById('fireDetailCount').textContent = filtered.length;
  document.getElementById('fireDetailTable').innerHTML = filtered.map(f => `
    <tr>
      <td>${f.code}</td>
      <td>${f.spec}</td>
      <td>${f.location}</td>
      <td>${f.inspector}</td>
      <td>${f.dept}</td>
      <td>${f.manufacturer || '-'}</td>
      <td>${f.scrap_date || '-'}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">无匹配记录</td></tr>';
}

function renderFireAnalysis() {
  const tab = currentFireTab;
  const titleMap = { spec: '按规格分布', inspector: '按负责人(点检人)分布', dept: '按责任部门分布', manufacturer: '按生产厂家分布' };
  document.getElementById('fireAnalysisTitle').textContent = `${titleMap[tab]}（共 ${fireAnalysisData.length} 个）`;
  
  const count = {};
  fireAnalysisData.forEach(f => {
    const key = f[tab] || '未知';
    count[key] = (count[key] || 0) + 1;
  });
  
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#94a3b8','#84cc16'];
  
  destroyChart('fireAnalysis');
  charts.fireAnalysis = new Chart(document.getElementById('fireAnalysisChart'), {
    type: 'doughnut',
    data: {
      labels: sorted.map(s => s[0]),
      datasets: [{
        data: sorted.map(s => s[1]),
        backgroundColor: colors
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } }
    }
  });
}

// ========== 计划任务到期分析 ==========
async function loadTaskDeadline() {
  const deadline = await fetchAPI('/tasks/deadline?days=30');
  document.getElementById('deadlineTable').innerHTML = deadline.length > 0 ? deadline.map(t => {
    const statusBadge = t.status === '已逾期' ? 'badge-red' : t.status === '即将到期' ? 'badge-yellow' : 'badge-blue';
    return `
      <tr>
        <td>${t.plan_name || t.plan_id}</td>
        <td>${t.cycle_type || '-'}</td>
        <td>${formatDateTime(t.start_time)}</td>
        <td>${formatDateTime(t.end_time)}</td>
        <td>${t.total_count}</td>
        <td>${t.finish_count}</td>
        <td><span class="badge badge-red">${t.unfinish_count}</span></td>
        <td><span class="badge ${statusBadge}">${t.status}</span></td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">暂无即将到期/超期任务</td></tr>';
  
  const overdue = await fetchAPI('/tasks/overdue');
  document.getElementById('overdueTable').innerHTML = overdue.length > 0 ? overdue.map(t => `
    <tr>
      <td>${t.计划名称}</td>
      <td><span class="badge badge-red">${t.状态}</span></td>
      <td>${formatDateTime(t.截止时间)}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">暂无超期记录</td></tr>';
}
