// 自动冒烟测试（P1）：推送前/部署前回归闸门
// 1) 对所有 JS 文件做 node --check（语法闸门，防止"整段 JS 失效"类回归）
// 2) 启动服务，校验 /api/auth/verify（200/401）—— 不依赖数据库
// 3) 可选：RUN_DB_SMOKE=1 时，对核心接口断言 200（需能连 RDS）
//
// 用法：node scripts/smoke-test.js   (可选 ACCESS_TOKEN / PORT / RUN_DB_SMOKE 环境变量)

const { execSync } = require('child_process');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NODE = process.env.NODE_BIN || process.execPath;
const PORT = process.env.PORT || 3999;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'cli-dash-2026';
const RUN_DB_SMOKE = process.env.RUN_DB_SMOKE === '1' || process.env.RUN_DB_SMOKE === 'true';
const BASE = `http://localhost:${PORT}`;

let failures = 0;
const log = (...a) => console.log(...a);
function fail(msg) { failures++; log('  ✗ ' + msg); }
function pass(msg) { log('  ✓ ' + msg); }

// ---------- 1) 语法闸门 ----------
log('\n[1/3] 语法检查 (node --check)');
const jsFiles = ['server.js'];
for (const f of fs.readdirSync(path.join(ROOT, 'public', 'js'))) {
  if (f.endsWith('.js')) jsFiles.push(path.join('public', 'js', f));
}
for (const rel of jsFiles) {
  const abs = path.join(ROOT, rel);
  try {
    execSync(`"${NODE}" --check "${abs}"`, { stdio: 'pipe' });
    pass(rel);
  } catch (e) {
    fail(`${rel} 语法错误: ${e.stderr ? e.stderr.toString() : e.message}`);
  }
}

// ---------- 2) 启动服务 + 鉴权校验 ----------
log('\n[2/3] 启动服务 & 鉴权校验');
const server = spawn(NODE, [path.join(ROOT, 'server.js')], {
  env: { ...process.env, PORT: String(PORT), ACCESS_TOKEN, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', d => serverLog += d);
server.stderr.on('data', d => serverLog += d);

function killServer() {
  try { server.kill('SIGKILL'); } catch (e) {}
}

async function waitReady(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/auth/verify?token=${encodeURIComponent(ACCESS_TOKEN)}`);
      if (r.status === 200) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function getToken(t) {
  return encodeURIComponent(t);
}

(async () => {
  const ready = await waitReady();
  if (!ready) {
    fail('服务未在限定时间内就绪（可能端口被占用或 Node 启动失败）');
    log('--- server log ---\n' + serverLog);
    killServer();
    finish();
    return;
  }
  pass('服务已就绪');

  // 正确令牌 -> 200
  let r = await fetch(`${BASE}/api/auth/verify?token=${getToken(ACCESS_TOKEN)}`);
  r.status === 200 ? pass('/api/auth/verify 正确令牌 → 200') : fail(`/api/auth/verify 正确令牌期望 200，实际 ${r.status}`);

  // 错误令牌 -> 401
  r = await fetch(`${BASE}/api/auth/verify?token=${getToken('wrong-token')}`);
  r.status === 401 ? pass('/api/auth/verify 错误令牌 → 401') : fail(`/api/auth/verify 错误令牌期望 401，实际 ${r.status}`);

  // 无令牌 -> 401
  r = await fetch(`${BASE}/api/stats`);
  r.status === 401 ? pass('无令牌访问受保护接口 → 401') : fail(`无令牌访问 /api/stats 期望 401，实际 ${r.status}`);

  // 健康检查免鉴权 -> 200（即使无 token）
  r = await fetch(`${BASE}/api/health`);
  (r.status === 200 || r.status === 500) ? pass(`/api/health 免鉴权 → ${r.status}`) : fail(`/api/health 期望 200/500，实际 ${r.status}`);

  // ---------- 3) 可选：数据库接口 ----------
  if (RUN_DB_SMOKE) {
    log('\n[3/3] 数据库接口冒烟 (RUN_DB_SMOKE=1)');
    const eps = [
      '/api/stats', '/api/first-aid/expiry', '/api/fire-extinguisher/maintenance?days=9999',
      '/api/fire-extinguisher/scrap?days=9999', '/api/fire-extinguisher/analysis',
      '/api/tasks/deadline?days=30', '/api/tasks/overdue'
    ];
    for (const ep of eps) {
      try {
        const sep = ep.includes('?') ? '&' : '?';
        const rr = await fetch(`${BASE}${ep}${sep}token=${getToken(ACCESS_TOKEN)}`);
        rr.status === 200 ? pass(ep + ' → 200') : fail(`${ep} 期望 200，实际 ${rr.status}`);
      } catch (e) {
        fail(`${ep} 请求异常: ${e.message}`);
      }
    }
  } else {
    log('\n[3/3] 数据库接口冒烟 已跳过（未设置 RUN_DB_SMOKE=1）');
  }

  killServer();
  finish();
})();

function finish() {
  log('\n==================== 冒烟结果 ====================');
  if (failures === 0) {
    log(`✅ 全部通过（${jsFiles.length} 个文件语法检查 + 鉴权校验${RUN_DB_SMOKE ? ' + 数据库接口' : ''}）`);
    process.exit(0);
  } else {
    log(`❌ 失败 ${failures} 项`);
    process.exit(1);
  }
}

// 安全兜底：超时强杀
setTimeout(() => {
  log('⚠️ 冒烟脚本超时，强制退出');
  killServer();
  process.exit(1);
}, 90000);
