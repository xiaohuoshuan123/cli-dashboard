// ========== 加载核心指标 ==========
async function loadStats() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const stats = await fetchAPI(`/stats?${params}`);
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
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  
  // 压力表异常
  const pressure = await fetchAPI('/pressure-gauge/status');
  const pressureBad = pressure.find(p => p.status && p.status.includes('异常'));
  if (pressureBad) {
    alerts.push(`<div class="alert alert-danger">⚠️ 压力表：${escapeHtml(pressureBad.status)} ${pressureBad.count} 个，需立即处理</div>`);
  }
  
  // 气瓶异常
  const gas = await fetchAPI('/fire-cylinder/status');
  const gasBad = gas.find(g => g.status && (g.status.includes('压力不足') || g.status.includes('库存未检')));
  if (gasBad) {
    alerts.push(`<div class="alert alert-warn">⚠️ 消防气瓶：${escapeHtml(gasBad.status)} ${gasBad.count} 个</div>`);
  }
  
  // 灭火器异常
  const fireResults = await fetchAPI(`/fire-extinguisher/results?${params}`);
  const fireBad = fireResults.find(f => f.result && f.result.includes('异常'));
  if (fireBad) {
    alerts.push(`<div class="alert alert-warn">⚠️ 灭火器检查异常 ${fireBad.count} 条记录</div>`);
  }
  
  // 超期任务
  const overdue = await fetchAPI(`/tasks/overdue?${params}`);
  if (overdue && overdue.length > 0) {
    alerts.push(`<div class="alert alert-danger">⚠️ 超期/未完成计划任务 ${overdue.length} 条，需跟进</div>`);
  }
  
  if (alerts.length === 0) {
    alerts.push(`<div class="alert alert-ok">✅ 所有设备运行正常，无异常状态</div>`);
  }

  container.innerHTML = `<div class="card" style="border-left:4px solid #3b82f6;margin-bottom:20px;">
    <div class="card-title" style="text-transform:none;letter-spacing:0;color:var(--text);font-size:13px;">🩺 系统健康运行提醒</div>
    <div class="health-alert-list">${alerts.join('')}</div>
  </div>`;
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
  const valLabel = {
    id: 'valLabel',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.fillStyle = '#475569';
      ctx.font = '600 11px sans-serif';
      ctx.textAlign = 'center';
      meta.data.forEach((pt, i) => {
        const v = chart.data.datasets[0].data[i];
        ctx.fillText(v, pt.x, pt.y - 8);
      });
      ctx.restore();
    }
  };
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
    },
    plugins: [valLabel]
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
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
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
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
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
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
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
    options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// ========== 人员排行（枢纽分析：每人 × 每张记录单）==========
// 展示 TOP 20，导出 Excel 时包含全部人员
let memberRankingData = null;

function buildMemberRankRows(members, forms) {
  return members.map((m, i) => {
    const cells = forms.map(f => {
      const c = m.byForm[f] || 0;
      return `<td style="text-align:center;">${c ? formatNumber(c) : '-'}</td>`;
    }).join('');
    return `
    <tr>
      <td>${i + 1}</td>
      <td style="min-width:96px;white-space:nowrap;font-weight:500;">${escapeHtml(m.name)}</td>
      <td style="text-align:center;"><strong>${formatNumber(m.total)}</strong></td>
      ${cells}
    </tr>`;
  }).join('');
}

async function loadMemberRanking() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const data = await fetchAPI(`/members/ranking?${params}`);
  memberRankingData = data;
  const forms = data.forms || [];
  const members = data.members || [];

  // 动态表头：# / 姓名 / 总提交数 / 各记录单一列（含该表总数）
  document.getElementById('memberRankHead').innerHTML = `
    <tr>
      <th>#</th><th style="min-width:96px;white-space:nowrap;">姓名</th><th>总提交数</th>
      ${forms.map(f => `<th style="text-align:center;">${escapeHtml(f)}<br><span style="font-weight:normal;font-size:10px;color:var(--text2);">(共${formatNumber(data.formTotals[f] || 0)})</span></th>`).join('')}
    </tr>`;

  // 只展示 TOP 20
  document.getElementById('memberRankTable').innerHTML = buildMemberRankRows(members.slice(0, 20), forms);
  const countEl = document.getElementById('memberRankCount');
  if (countEl) countEl.textContent = `展示 TOP ${Math.min(20, members.length)} / 共 ${members.length} 人，合计 ${formatNumber(data.grandTotal || 0)} 条`;
}

// 导出全部人员（不止 TOP20）
function exportMemberRanking() {
  if (!memberRankingData) { alert('数据尚未加载完成'); return; }
  const forms = memberRankingData.forms || [];
  const members = memberRankingData.members || [];
  const head = `<tr><th>#</th><th>姓名</th><th>总提交数</th>${forms.map(f => `<th>${escapeHtml(f)}</th>`).join('')}</tr>`;
  const rows = members.map((m, i) =>
    `<tr><td>${i + 1}</td><td>${escapeHtml(m.name)}</td><td>${m.total}</td>${forms.map(f => `<td>${m.byForm[f] || 0}</td>`).join('')}</tr>`
  ).join('');
  const totalRow = `<tr><td></td><td>合计</td><td>${memberRankingData.grandTotal || 0}</td>${forms.map(f => `<td>${memberRankingData.formTotals[f] || 0}</td>`).join('')}</tr>`;
  downloadExcelHtml(`<table><thead>${head}</thead><tbody>${rows}${totalRow}</tbody></table>`, '人员参与度排行-全部人员按表单枢纽分析');
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
    const templates = (t.templates && t.templates !== 'null') ? t.templates : '-';
    const categories = (t.categories && t.categories !== 'null') ? t.categories : '-';
    return `
      <tr>
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(templates)}</td>
        <td>${escapeHtml(categories)}</td>
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
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const records = await fetchAPI(`/records/latest?limit=15&${params}`);
  document.getElementById('latestRecordsTable').innerHTML = records.map(r => `
    <tr>
      <td>${escapeHtml(r.record_id)}</td>
      <td>${escapeHtml(r.记录单名称)}</td>
      <td>${escapeHtml(r.记录人)}</td>
      <td>${formatDateTime(r.记录时间)}</td>
      <td>${escapeHtml(r.码名称 || '-')}</td>
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
      return `<span class="${cls}" title="${escapeHtml(d.raw)}">${escapeHtml(d.name)}<br><small>${escapeHtml(d.expiry || '-')} · ${txt}</small></span>`;
    }).join('');
    const badge = row.hasExpired
      ? `<span class="badge badge-red">过期${row.expiredCount}</span><span class="badge badge-yellow">临期${row.expiringCount}</span>`
      : row.expiringCount > 0
        ? `<span class="badge badge-yellow">临期${row.expiringCount}</span>`
        : `<span class="badge badge-green">全部有效</span>`;
    return `<tr>
      <td style="font-weight:600;">${escapeHtml(row.boxName || '未知')}</td>
      <td>${escapeHtml(row.location || '-')}</td>
      <td>${escapeHtml(row.recorder || '-')}</td>
      <td>${badge}</td>
      <td class="med-cell"><div class="med-wrap">${chips}</div></td>
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
        <td>${escapeHtml(m.code)}</td>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.location)}</td>
        <td>${escapeHtml(m.inspector)}</td>
        <td>${escapeHtml(m.dept)}</td>
        <td>${escapeHtml(m.next_date)}</td>
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
        <td>${escapeHtml(m.code)}</td>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.location)}</td>
        <td>${escapeHtml(m.inspector)}</td>
        <td>${escapeHtml(m.dept)}</td>
        <td>${escapeHtml(m.manufacturer || '-')}</td>
        <td>${escapeHtml(m.scrap_date)}</td>
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
  const inspectors = [...new Set(fireAnalysisData.map(f => f.inspector).filter(Boolean))].sort();
  const specs = [...new Set(fireAnalysisData.map(f => f.spec).filter(Boolean))].sort();
  document.getElementById('fireDeptFilter').innerHTML =
    '<option value="">全部责任部门</option>' + depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  document.getElementById('fireInspectorFilter').innerHTML =
    '<option value="">全部点检人</option>' + inspectors.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  document.getElementById('fireSpecFilter').innerHTML =
    '<option value="">全部规格</option>' + specs.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  renderFireAnalysis();
  renderFireDetail();
}

function clearFireFilter() {
  document.getElementById('fireSearch').value = '';
  document.getElementById('fireDeptFilter').value = '';
  document.getElementById('fireInspectorFilter').value = '';
  document.getElementById('fireSpecFilter').value = '';
  renderFireDetail();
}

function renderFireDetail() {
  const kw = document.getElementById('fireSearch').value.trim().toLowerCase();
  const dept = document.getElementById('fireDeptFilter').value;
  const inspector = document.getElementById('fireInspectorFilter').value;
  const spec = document.getElementById('fireSpecFilter').value;
  const filtered = fireAnalysisData.filter(f => {
    if (dept && f.dept !== dept) return false;
    if (inspector && f.inspector !== inspector) return false;
    if (spec && f.spec !== spec) return false;
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
      <td>${escapeHtml(f.code)}</td>
      <td>${escapeHtml(f.spec)}</td>
      <td>${escapeHtml(f.location)}</td>
      <td>${escapeHtml(f.inspector)}</td>
      <td>${escapeHtml(f.dept)}</td>
      <td>${escapeHtml(f.manufacturer || '-')}</td>
      <td>${escapeHtml(f.scrap_date || '-')}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">无匹配记录</td></tr>';
}

function renderFireAnalysis() {
  const tab = currentFireTab;
  const titleMap = { spec: '按规格分布', inspector: '按负责人(点检人)分布', dept: '按责任部门分布', manufacturer: '按生产厂家分布' };
  document.getElementById('fireAnalysisTitle').textContent = `${titleMap[tab]}（共 ${fireAnalysisData.length} 个 · 来源 template_codeinfo_d10）`;
  
  const count = {};
  fireAnalysisData.forEach(f => {
    const key = f[tab] || '未知';
    count[key] = (count[key] || 0) + 1;
  });
  
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#94a3b8','#84cc16'];
  
  const labels = sorted.map(s => s[0]);
  const data = sorted.map(s => s[1]);
  const useDoughnut = labels.length <= 6;
  destroyChart('fireAnalysis');
  charts.fireAnalysis = new Chart(document.getElementById('fireAnalysisChart'), {
    type: useDoughnut ? 'doughnut' : 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: useDoughnut, position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: { enabled: true }
      },
      ...(useDoughnut ? {} : {
        indexAxis: 'y',
        scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' } }, y: { ticks: { font: { size: 11 } } } },
        layout: { padding: { left: 8 } }
      })
    }
  });
}

// ========== 消防应急灯多维度分析 ==========
async function loadLightAnalysis() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  lightAnalysisData = await fetchAPI(`/emergency-lights/analysis?${params}`);
  // 填充明细筛选下拉
  const devices = lightAnalysisData.devices || [];
  const depts = [...new Set(devices.map(d => d.dept).filter(Boolean))].sort();
  const inspectors = [...new Set(devices.map(d => d.inspector).filter(Boolean))].sort();
  document.getElementById('lightDeptFilter').innerHTML =
    '<option value="">全部责任部门</option>' + depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  document.getElementById('lightInspectorFilter').innerHTML =
    '<option value="">全部点检人</option>' + inspectors.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  document.getElementById('lightDetailCount').textContent = formatNumber(devices.length);
  renderLightAnalysis();
  renderLightDetail();
}

function switchLightTab(tab, el) {
  currentLightTab = tab;
  document.querySelectorAll('#lightAnalysis .tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderLightAnalysis();
}

function renderLightAnalysis() {
  const tab = currentLightTab;
  const titleMap = { inspector: '按检查人分布', department: '按责任部门分布', vendor: '按生产厂商分布' };
  document.getElementById('lightAnalysisTitle').textContent =
    `${titleMap[tab]}（共 ${formatNumber(lightAnalysisData.total)} 个设备 · 来源 template_codeinfo_d15）`;

  let labels = [], data = [], colors = null;
  if (tab === 'inspector') {
    labels = lightAnalysisData.byInspector.map(d => d.inspector || '未知');
    data = lightAnalysisData.byInspector.map(d => d.cnt);
  } else if (tab === 'department') {
    const rows = (lightAnalysisData.byDepartment || []).map(d => ({ dept: d.dept || '（未填）', cnt: d.cnt }));
    labels = rows.map(d => d.dept);
    data = rows.map(d => d.cnt);
  } else {
    const rows = (lightAnalysisData.byVendor || []).map(d => ({ vendor: d.vendor || '（未填）', cnt: d.cnt }));
    labels = rows.map(d => d.vendor);
    data = rows.map(d => d.cnt);
  }

  const palette = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#94a3b8','#84cc16','#a855f7','#14b8a6'];
  const useDoughnut = labels.length <= 6;
  destroyChart('lightAnalysis');
  charts.lightAnalysis = new Chart(document.getElementById('lightAnalysisChart'), {
    type: useDoughnut ? 'doughnut' : 'bar',
    data: { labels, datasets: [{ label: '数量', data, backgroundColor: palette }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: useDoughnut, position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } },
      ...(useDoughnut ? {} : {
        indexAxis: 'y',
        layout: { padding: { left: 8 } },
        scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' } }, y: { ticks: { font: { size: 10 } } } }
      })
    }
  });
}

function renderLightDetail() {
  const kw = (document.getElementById('lightSearch').value || '').trim().toLowerCase();
  const dept = document.getElementById('lightDeptFilter').value;
  const inspector = document.getElementById('lightInspectorFilter').value;
  const rows = (lightAnalysisData.devices || []).filter(d => {
    if (dept && d.dept !== dept) return false;
    if (inspector && d.inspector !== inspector) return false;
    if (kw) {
      const hay = `${d.code || ''} ${d.location || ''} ${d.dept || ''} ${d.vendor || ''} ${d.inspector || ''}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
  document.getElementById('lightDetailCount').textContent = rows.length;
  document.getElementById('lightDetailTable').innerHTML = rows.map(d => `
    <tr>
      <td style="font-weight:600;">${escapeHtml(d.code || '-')}</td>
      <td>${escapeHtml(d.location || '-')}</td>
      <td>${escapeHtml(d.dept || '（未填）')}</td>
      <td>${escapeHtml(d.vendor || '-')}</td>
      <td>${escapeHtml(d.inspector || '（未填）')}</td>
      <td>${d.status
        ? `<span class="badge ${d.status.includes('异常') ? 'badge-red' : 'badge-green'}">${escapeHtml(d.status)}</span>`
        : '-'}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">无匹配设备</td></tr>';
}

