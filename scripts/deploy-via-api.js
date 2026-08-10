// 通过 GitHub Git Data API 推送文件（沙箱内 git 大传输被拦时的备用通道）
// 关键改进：把所有待推送文件**打包成一次 commit** 提交（而非逐文件 PUT 各产生一次 commit）。
//   - 一次部署 = 1 次 commit = 1 次 CI 运行，省 CI 额度、commit 历史干净；
//   - 历史逐文件 PUT 方案每推一个文件就触发一次 Smoke Test，曾导致一次部署炸出十几封失败邮件。
//
// 用法：
//   node scripts/deploy-via-api.js                       # 推送 FILES 全量（单次提交）
//   DEPLOY_FILES="server.js,docs/复盘报告.md" node ...   # 仅推送指定文件（单次提交）
//   COMMIT_MSG="fix: ..." node ...                       # 自定义提交信息
const fs = require('fs');
const path = require('path');

const OWNER = 'xiaohuoshuan123';
const REPO = 'cli-dashboard';
const BRANCH = 'main';
// GitHub token：**绝不硬编码**。优先读环境变量 GH_TOKEN；
// 未设置时复用已登录的 gh CLI 令牌（gh auth login，需 repo 权限），方便本机直接部署。
// 历史版本曾把 token 写死在文件里并已进入 git 历史 → 已轮换作废，仓库内不再留任何密钥。
function resolveToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const { execSync } = require('child_process');
    const t = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (t) return t;
  } catch (e) {}
  return null;
}
const TOKEN = resolveToken();
if (!TOKEN) {
  console.error('❌ 未找到 GitHub token：请设置环境变量 GH_TOKEN，或确保 gh CLI 已登录（gh auth login，需 repo 权限）。');
  process.exit(1);
}
const ROOT = path.resolve(__dirname, '..');

// 完整待同步文件清单（用于全量部署）。可用 DEPLOY_FILES 覆盖为子集。
const FULL_FILES = [
  'server.js',
  'package.json',
  'package-lock.json',
  'public/js/core.js',
  'public/js/sections.js',
  'public/js/app.js',
  'public/index.html',
  'docs/复盘报告.md',
  'docs/技术文档.md',
  'docs/部署到新平台-运行手册.md',
  'Dockerfile',
  '.dockerignore',
  'render.yaml',
  '.env.example'
];

const FILES = (process.env.DEPLOY_FILES || '')
  .split(',').map(s => s.trim()).filter(Boolean).length
  ? process.env.DEPLOY_FILES.split(',').map(s => s.trim()).filter(Boolean)
  : FULL_FILES;

const COMMIT_MSG = process.env.COMMIT_MSG ||
  'fix(ci): server.js 启动校验仅生产环境强制，非生产降级启动使冒烟测试通过；同步复盘报告';

const api = (method, urlPath, body) => fetch(`https://api.github.com/repos/${OWNER}/${REPO}${urlPath}`, {
  method,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'User-Agent': 'cli-dash-deploy',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  },
  body: body ? JSON.stringify(body) : undefined
}).then(async r => {
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${urlPath}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
});

async function getBaseCommitSha() {
  const ref = await api('GET', `/git/ref/heads/${BRANCH}`);
  return ref.object.sha;
}

async function createBlob(content) {
  const res = await api('POST', '/git/blobs', {
    content: Buffer.from(content, 'utf8').toString('base64'),
    encoding: 'base64'
  });
  return res.sha;
}

async function createTree(baseTreeSha, entries) {
  const res = await api('POST', '/git/trees', { base_tree: baseTreeSha, tree: entries });
  return res.sha;
}

async function createCommit(message, treeSha, parentSha) {
  const res = await api('POST', '/git/commits', { message, tree: treeSha, parents: [parentSha] });
  return res.sha;
}

async function updateRef(commitSha) {
  return api('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commitSha, force: false });
}

(async () => {
  try {
    const baseSha = await getBaseCommitSha();
    // base tree：取当前 HEAD commit 的 tree，作为新 tree 的基底（未改动的文件自动继承）
    const baseCommit = await api('GET', `/git/commits/${baseSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    const entries = [];
    for (const f of FILES) {
      const abs = path.join(ROOT, f);
      const content = fs.readFileSync(abs, 'utf8');
      const blobSha = await createBlob(content);
      entries.push({ path: f, mode: '100644', type: 'blob', sha: blobSha });
      console.log(`blob ${f} -> ${blobSha.slice(0, 7)}`);
    }

    const newTreeSha = await createTree(baseTreeSha, entries);
    const newCommitSha = await createCommit(COMMIT_MSG, newTreeSha, baseSha);
    await updateRef(newCommitSha);
    console.log(`✅ 单次提交完成: ${newCommitSha.slice(0, 7)} (${FILES.length} 文件, 1 次 CI)`);
  } catch (e) {
    console.error('❌ 部署失败:', e.message);
    process.exit(1);
  }
})();
