// 固定进程时区为北京时间：草料官方库 DATETIME 以北京时间存储，但部署在 Railway(UTC) 时
// mysql2 会把 DATETIME 当成 UTC 解析，序列化后浏览器按中国时区 +8 显示，导致"19:26 实为 11:26"
// 的 8 小时偏差。固定 TZ=Asia/Shanghai 后，mysql2 按北京时间解析，序列化为 03:26Z，浏览器显示 11:26。
process.env.TZ = process.env.TZ || 'Asia/Shanghai';

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 数据库配置（支持环境变量覆盖）
const dbConfig = {
  host: process.env.DB_HOST || 'rm-bp1m4fy8d66u3c6xmbo.mysql.rds.aliyuncs.com',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'cli_44608921',
  user: process.env.DB_USER || 'cli_44608921',
  password: process.env.DB_PASSWORD || '9507fd52fc87d7cfe3f1e756b725a156',
  charset: 'utf8mb4'
};

// 创建连接池（带超时，避免 Railway 等环境连不上 RDS 时永久挂起）
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 8000,
  acquireTimeout: 8000,
  timeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// ========== 查询缓存层（P0） ==========
// 默认对统计类查询缓存 60s，降低 RDS 压力与官方库限流风险。
// 健康检查(SELECT 1)不缓存；可通过 CACHE_TTL 环境变量调整秒数（0=关闭）。
const _cache = new Map();
function _cacheKey(sql, params) {
  return sql.replace(/\s+/g, ' ').trim() + ' ' + JSON.stringify(params);
}
async function query(sql, params = [], ttl = null) {
  const useTtl = ttl === null
    ? (sql.trim().toLowerCase().startsWith('select 1') ? 0 : (parseInt(process.env.CACHE_TTL) || 60))
    : ttl;
  if (useTtl > 0) {
    const k = _cacheKey(sql, params);
    const hit = _cache.get(k);
    if (hit && hit.exp > Date.now()) return hit.val;
    const [rows] = await pool.execute(sql, params);
    _cache.set(k, { val: rows, exp: Date.now() + useTtl * 1000 });
    return rows;
  }
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// 时间切片边界修正：前端日期选择器返回的是日期串(YYYY-MM-DD)。
// SQL `列 <= 'YYYY-MM-DD'` 会被 MySQL 当作当天 00:00:00，导致"选了某天却漏掉当天数据"
//（截止日少算一整天，表现为'最新提交记录没有今天的记录'）。
// 因此日期型 endDate 统一追加 ' 23:59:59'，使切片包含截止日全天；startDate 保持 00:00:00 不变。
function endVal(s) {
  s = String(s == null ? '' : s).trim();
  return s.length === 10 ? s + ' 23:59:59' : s;
}

// ========== 关键查询容错（P0） ==========
// 草料官方库字段可能改名/表结构调整，提前探测实际列，缺失列降级为 NULL 而非整接口 500。
const _colCache = new Map();
async function existingColumns(table) {
  if (_colCache.has(table)) return _colCache.get(table);
  const rows = await query(
    `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
    [dbConfig.database, table], 0
  );
  const set = new Set(rows.map(r => r.COLUMN_NAME));
  _colCache.set(table, set);
  return set;
}
// 构造 SELECT：对不存在的列输出 NULL 别名，保证查询不因字段缺失而整体失败
async function safeSelect(table, aliasMap, extra = '') {
  const cols = await existingColumns(table);
  const list = Object.entries(aliasMap).map(([alias, col]) =>
    cols.has(col) ? `\`${col}\` as ${alias}` : `NULL as ${alias}`
  );
  return `SELECT ${list.join(', ')} FROM \`${table}\` ${extra}`;
}

// ========== API 路由 ==========

// 请求级超时保护：任何 API 最多 15 秒必须返回，避免 Railway 等环境连不上
// 数据库时前端永久 "加载中"。超时后给出明确诊断信息。
app.use((req, res, next) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({
        error: '请求超时：数据库连接或查询耗时过长。',
        hint: '若部署在 Railway 等海外平台，很可能是阿里云 RDS 安全组白名单未放行该平台出口 IP。请检查 RDS 白名单，或改用能直连 RDS 的部署方式（如本地内网穿透）。'
      });
    }
  }, 15000);
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// ========== 基础访问控制（P0） ==========
// 通过地址 ?token= 或请求头 x-api-token / Authorization: Bearer 携带访问令牌。
// 默认令牌 cli-dash-2026，生产环境请通过环境变量 ACCESS_TOKEN 覆盖；
// 可选 IP 白名单：ALLOWED_IPS=1.2.3.4,5.6.7.8（逗号分隔）
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'cli-dash-2026';
function requireAuth(req, res, next) {
  if (req.path === '/health') return next(); // 健康检查免鉴权，便于监控探针
  const urlToken = req.query.token;
  const headerToken = req.get('x-api-token') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (urlToken === ACCESS_TOKEN || headerToken === ACCESS_TOKEN) return next();
  const whitelist = (process.env.ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (whitelist.length && whitelist.includes(req.ip)) return next();
  return res.status(401).json({ error: '未授权：请在访问地址后附加 ?token=访问令牌，或在请求头携带 x-api-token。' });
}
app.use('/api', requireAuth);

// 健康检查
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', message: '数据库连接正常' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 令牌校验（前端登录弹窗用）
// 该路由在 /api 下，requireAuth 已先校验令牌：到达此路由即代表令牌有效，返回 200；
// 令牌错误时 requireAuth 直接返回 401，不会进入本处理。无需连接数据库。
app.get('/api/auth/verify', (req, res) => {
  res.json({ ok: true, valid: true });
});

// 缓存统计与手动清空（均受上面鉴权保护）
app.get('/api/cache/stats', (req, res) => {
  const now = Date.now();
  let expired = 0;
  for (const v of _cache.values()) if (v.exp <= now) expired++;
  res.json({ entries: _cache.size, expired, ttlSeconds: parseInt(process.env.CACHE_TTL) || 60 });
});
app.post('/api/cache/clear', (req, res) => {
  const n = _cache.size;
  _cache.clear();
  res.json({ ok: true, cleared: n });
});

// 核心统计
app.get('/api/stats', async (req, res) => {
  try {
    const codeCount = (await query('SELECT COUNT(*) as count FROM base_codeinfo'))[0];
    const taskCount = (await query('SELECT COUNT(*) as count FROM code_task_log'))[0];
    const memberCount = (await query('SELECT COUNT(*) as count FROM base_auth_msg'))[0];

    // 时间范围筛选（作用于 base_table_data 相关统计，实现"选时间段即按时间段分析"）
    const dp = [];
    let dateWhere = '';
    if (req.query.startDate) { dateWhere += ' AND 记录时间 >= ?'; dp.push(req.query.startDate); }
    if (req.query.endDate) { dateWhere += ' AND 记录时间 <= ?'; dp.push(endVal(req.query.endDate)); }

    const recordCount = (await query(`SELECT COUNT(*) as count FROM base_table_data WHERE 1=1 ${dateWhere}`, dp))[0];

    // 计划完成率（全量，不随点检时间切片）
    const [taskStats] = await query(`
      SELECT 
        SUM(CASE WHEN 状态 = '完成' THEN 1 ELSE 0 END) as completed,
        COUNT(*) as total
      FROM code_task_log
    `);
    const completionRate = taskStats.total > 0 
      ? ((taskStats.completed / taskStats.total) * 100).toFixed(1) 
      : 0;

    // 时间范围：给定起止用给定值，否则用实际 MIN/MAX
    let timeRange;
    if (req.query.startDate || req.query.endDate) {
      timeRange = { earliest: req.query.startDate || null, latest: req.query.endDate || null };
    } else {
      const [tr] = await query(`SELECT MIN(记录时间) as earliest, MAX(记录时间) as latest FROM base_table_data`);
      timeRange = tr;
    }

    res.json({
      codeCount: codeCount.count,
      recordCount: recordCount.count,
      taskCount: taskCount.count,
      memberCount: memberCount.count,
      completionRate,
      timeRange
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 月度趋势（支持日期范围）
app.get('/api/trends/monthly', async (req, res) => {
  try {
    let sql = `
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM base_table_data
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY DATE_FORMAT(记录时间, '%Y-%m') ORDER BY month`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 表单分布
app.get('/api/forms/distribution', async (req, res) => {
  try {
    let sql = `
      SELECT 记录单名称 as name, COUNT(*) as count
      FROM base_table_data
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY 记录单名称 ORDER BY count DESC`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 计划执行状态
app.get('/api/tasks/status', async (req, res) => {
  try {
    let sql = `
      SELECT 状态 as status, COUNT(*) as count
      FROM code_task_log
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 开始时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 开始时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY 状态`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器检查趋势
app.get('/api/fire-extinguisher/trend', async (req, res) => {
  try {
    let sql = `
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d19
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY DATE_FORMAT(记录时间, '%Y-%m') ORDER BY month`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器检查结果
app.get('/api/fire-extinguisher/results', async (req, res) => {
  try {
    let sql = `
      SELECT 检查结果_3171776 as result, COUNT(*) as count
      FROM table_d19
      WHERE 检查结果_3171776 IS NOT NULL AND 检查结果_3171776 != ''
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY 检查结果_3171776`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 消防应急灯趋势
app.get('/api/emergency-lights/trend', async (req, res) => {
  try {
    let sql = `
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d16
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY DATE_FORMAT(记录时间, '%Y-%m') ORDER BY month`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 消防应急灯检查结果
app.get('/api/emergency-lights/results', async (req, res) => {
  try {
    let sql = `
      SELECT 检查结果_3170565 as result, COUNT(*) as count
      FROM table_d16
      WHERE 检查结果_3170565 IS NOT NULL AND 检查结果_3170565 != ''
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY 检查结果_3170565`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 消防应急灯多维度分析（数据源：template_codeinfo_d15 子码主数据，固定 83 个设备）
// 维度：按检查人(点检人) / 按责任部门 / 按生产厂商；附设备台账明细。
// 注意：d15 为设备主数据，不含点检时间字段，故时间切片不适用，固定为全量台账；
//       不再从 table_d16 点检记录做多维分析，也不展示点检异常明细。
app.get('/api/emergency-lights/analysis', async (req, res) => {
  try {
    const norm = (col) => `TRIM(REPLACE(${col}, UNHEX('E38080'), ' '))`;
    const params = [];

    const totalRows = await query(`SELECT COUNT(*) AS c FROM template_codeinfo_d15`);
    const total = totalRows[0] ? totalRows[0].c : 0;

    const byInspector = await query(
      `SELECT ${norm('`点检人_3170560`')} AS inspector, COUNT(*) AS cnt
       FROM template_codeinfo_d15 GROUP BY ${norm('`点检人_3170560`')} ORDER BY cnt DESC`, params);

    const byDepartment = await query(
      `SELECT ${norm('`责任部门_81036793872385`')} AS dept, COUNT(*) AS cnt
       FROM template_codeinfo_d15 GROUP BY ${norm('`责任部门_81036793872385`')} ORDER BY cnt DESC`, params);

    const byVendor = await query(
      `SELECT ${norm('`生产厂家_3170558`')} AS vendor, COUNT(*) AS cnt
       FROM template_codeinfo_d15 GROUP BY ${norm('`生产厂家_3170558`')} ORDER BY cnt DESC`, params);

    const devices = await query(
      `SELECT
        \`编号_3170556\` AS code,
        \`安装位置_3170557\` AS location,
        ${norm('`责任部门_81036793872385`')} AS dept,
        ${norm('`生产厂家_3170558`')} AS vendor,
        ${norm('`点检人_3170560`')} AS inspector,
        \`状态\` AS status,
        \`规格型号_3170645\` AS model,
        \`出厂日期_3170561\` AS prodDate
       FROM template_codeinfo_d15 ORDER BY \`编号_3170556\``, params);

    res.json({ total, byInspector, byDepartment, byVendor, devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 急救药箱点检趋势
app.get('/api/first-aid/trend', async (req, res) => {
  try {
    let sql = `
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d22
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY DATE_FORMAT(记录时间, '%Y-%m') ORDER BY month`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 洗眼器点检趋势
app.get('/api/eye-wash/trend', async (req, res) => {
  try {
    let sql = `
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d27
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY DATE_FORMAT(记录时间, '%Y-%m') ORDER BY month`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 压力表状态
app.get('/api/pressure-gauge/status', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 压力表状态_3947037 as status, COUNT(*) as count
      FROM code_state
      WHERE 压力表状态_3947037 IS NOT NULL AND 压力表状态_3947037 != ''
      GROUP BY 压力表状态_3947037
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 消防气瓶状态
app.get('/api/fire-cylinder/status', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 消防气瓶状态_8880647 as status, COUNT(*) as count
      FROM code_state
      WHERE 消防气瓶状态_8880647 IS NOT NULL AND 消防气瓶状态_8880647 != ''
      GROUP BY 消防气瓶状态_8880647
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 人员排行
app.get('/api/members/ranking', async (req, res) => {
  try {
    let sql = `
      SELECT 记录人 as name, COUNT(*) as count
      FROM base_table_data
      WHERE 记录人 IS NOT NULL AND 记录人 != ''
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY 记录人 ORDER BY count DESC LIMIT 20`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器检查人员排行
app.get('/api/fire-extinguisher/ranking', async (req, res) => {
  try {
    let sql = `
      SELECT 记录人 as name, COUNT(*) as count
      FROM table_d19
      WHERE 记录人 IS NOT NULL AND 记录人 != ''
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 记录时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 记录时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY 记录人 ORDER BY count DESC LIMIT 15`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 计划执行明细
app.get('/api/tasks/details', async (req, res) => {
  try {
    let sql = `
      SELECT 
        计划名称 as name,
        COUNT(*) as total,
        SUM(CASE WHEN 状态 = '完成' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN 状态 = '超期未完成' THEN 1 ELSE 0 END) as overdue_incomplete,
        SUM(CASE WHEN 状态 = '未完成' THEN 1 ELSE 0 END) as incomplete,
        SUM(CASE WHEN 状态 = '超期完成' THEN 1 ELSE 0 END) as overdue_complete
      FROM code_task_log
      WHERE 1=1
    `;
    const params = [];
    
    if (req.query.startDate) {
      sql += ` AND 开始时间 >= ?`;
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      sql += ` AND 开始时间 <= ?`;
      params.push(endVal(req.query.endDate));
    }
    
    sql += ` GROUP BY 计划名称 ORDER BY total DESC`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 码类型分布
app.get('/api/codes/types', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 码类型 as type, COUNT(*) as count
      FROM base_codeinfo
      GROUP BY 码类型
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 码目录分布
app.get('/api/codes/categories', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 目录 as category, COUNT(*) as count
      FROM base_codeinfo
      WHERE 目录 IS NOT NULL AND 目录 != ''
      GROUP BY 目录
      ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 最新记录
app.get('/api/records/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const params = [];
    let dateCond = '';
    if (req.query.startDate) { dateCond += ` AND 记录时间 >= ?`; params.push(req.query.startDate); }
    if (req.query.endDate) { dateCond += ` AND 记录时间 <= ?`; params.push(endVal(req.query.endDate)); }
    params.push(limit);
    const rows = await query(`
      SELECT 
        record_id,
        记录单名称,
        记录人,
        记录时间,
        状态
      FROM base_table_data
      WHERE 1=1 ${dateCond}
      ORDER BY 记录时间 DESC
      LIMIT ?
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 新增 API ==========

// 设备类型归并：把 base_codeinfo.目录 / base_table_data.记录单名称 / code_task_log.计划名称
// 统一归并到相同设备维度，便于"按设备类型总览"跨三张表聚合。
function deviceKey(name) {
  if (!name) return '其他';
  if (name.includes('灭火器')) return '灭火器';
  if (name.includes('应急灯')) return '应急灯';
  if (name.includes('洗眼')) return '洗眼器';
  if (name.includes('急救')) return '急救药箱';
  if (name.includes('压力表')) return '压力表';
  if (name.includes('气瓶')) return '气瓶';
  if (name.includes('喷淋')) return '喷淋泵';
  if (name.includes('应急物资')) return '应急物资';
  return '其他';
}

// 按设备类型总览：基础码（base_codeinfo）+ 检查记录（base_table_data）+ 任务周期（code_task_log）
// 检查记录/任务周期随全局时间切片（记录时间 / 开始时间）；基础码为静态库存，不随日期变化。
app.get('/api/device-type/overview', async (req, res) => {
  try {
    const ip = [];
    let iDate = '';
    if (req.query.startDate) { iDate += ` AND 记录时间 >= ?`; ip.push(req.query.startDate); }
    if (req.query.endDate) { iDate += ` AND 记录时间 <= ?`; ip.push(endVal(req.query.endDate)); }

    const tp = [];
    let tDate = '';
    if (req.query.startDate) { tDate += ` AND 开始时间 >= ?`; tp.push(req.query.startDate); }
    if (req.query.endDate) { tDate += ` AND 开始时间 <= ?`; tp.push(endVal(req.query.endDate)); }

    const codeRows = await query(
      `SELECT 目录, COUNT(*) as c FROM base_codeinfo WHERE 目录 IS NOT NULL AND 目录 != '' GROUP BY 目录`);
    const inspRows = await query(
      `SELECT 记录单名称, COUNT(*) as cnt, MAX(记录时间) as last_time FROM base_table_data WHERE 1=1 ${iDate} GROUP BY 记录单名称`, ip);
    const taskRows = await query(
      `SELECT 计划名称, COUNT(*) as total, SUM(CASE WHEN 状态='完成' OR 状态='超期完成' THEN 1 ELSE 0 END) as completed FROM code_task_log WHERE 1=1 ${tDate} GROUP BY 计划名称`, tp);

    const map = {};
    const ensure = k => map[k] || (map[k] = { type: k, baseCodes: 0, inspections: 0, lastTime: null, taskTotal: 0, taskCompleted: 0 });
    codeRows.forEach(r => { const e = ensure(deviceKey(r.目录)); e.baseCodes += Number(r.c); });
    inspRows.forEach(r => {
      const e = ensure(deviceKey(r.记录单名称));
      e.inspections += Number(r.cnt);
      if (r.last_time && (!e.lastTime || r.last_time > e.lastTime)) e.lastTime = r.last_time;
    });
    taskRows.forEach(r => { const e = ensure(deviceKey(r.计划名称)); e.taskTotal += Number(r.total); e.taskCompleted += Number(r.completed); });

    const list = Object.values(map).map(e => ({
      ...e,
      taskRate: e.taskTotal > 0 ? ((e.taskCompleted / e.taskTotal) * 100).toFixed(1) : null
    }));
    list.sort((a, b) => b.inspections - a.inspections);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 急救药箱药品有效期追踪（计算每种药品是否在有效期内）
// 数据源：template_codeinfo_d25（子码主数据表，草料前台展示的「码」当前字段值）
// 注意：table_d24 只是表单提交历史日志，不能代表当前有效期，故以 template 表为准
app.get('/api/first-aid/expiry', async (req, res) => {
  try {
    const EXPIRING_SOON_DAYS = 30; // 临期阈值
    const sql = await safeSelect('template_codeinfo_d25', {
      code_id: 'code_id',
      boxName: '工段名称_3333285',
      location: '存放位置_3333288',
      recorder: '管理人_3333286',
      subCode: '子码编号',
      创可贴: '创可贴有效期_3397997',
      消毒纱片: '消毒纱片有效期_3397998',
      口罩: '口罩有效期_3397999',
      棉签: '棉签有效期_3398000',
      碘伏: '碘伏有效期_3398001',
      双氧水: '双氧水有效期_3398002',
      烫伤膏: '烫伤膏有效期_3398003',
      藿香正气水: '藿香正气水有效期_3398038'
    });
    const rows = await query(sql + ' ORDER BY code_id', []);
    // 兼容多种日期格式：YYYY年MM月DD日 / YYYY/MM/DD / YYYY-MM-DD
    const parseDate = (s) => {
      if (!s || typeof s !== 'string' || s.trim() === '') return null;
      const t = s.trim();
      let m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      const d = new Date(t);
      return isNaN(d.getTime()) ? null : d;
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const drugFields = ['创可贴', '消毒纱片', '口罩', '棉签', '碘伏', '双氧水', '烫伤膏', '藿香正气水'];
    const result = rows.map(r => {
      const drugs = drugFields.map(name => {
        const raw = r[name];
        const d = parseDate(raw);
        let status = 'unknown', remaining = null, iso = null;
        if (d) {
          d.setHours(0, 0, 0, 0);
          const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
          iso = `${y}-${mo}-${da}`;
          remaining = Math.round((d - today) / 86400000);
          if (remaining < 0) status = 'expired';
          else if (remaining <= EXPIRING_SOON_DAYS) status = 'expiring';
          else status = 'valid';
        }
        return { name, raw: raw || '', expiry: iso, remainingDays: remaining, status };
      }).filter(x => x.raw !== '');
      const expired = drugs.filter(d => d.status === 'expired').length;
      const expiring = drugs.filter(d => d.status === 'expiring').length;
      return {
        recordId: r.code_id,
        boxName: r.boxName ? `急救药箱·${r.boxName}` : '急救药箱',
        location: r.location,
        subCode: r.subCode,
        recorder: r.recorder,
        drugs,
        expiredCount: expired,
        expiringCount: expiring,
        hasExpired: expired > 0
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器维修充装预警（支持按天数筛选）
app.get('/api/fire-extinguisher/maintenance', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const dc = '下次维修再充装日期_3170398';
    const cols = await existingColumns('template_codeinfo_d10');
    let extra = '';
    const params = [];
    if (cols.has(dc)) {
      extra += `WHERE \`${dc}\` IS NOT NULL AND \`${dc}\` != ''`;
      if (days < 9999) {
        extra += ` AND STR_TO_DATE(\`${dc}\`, '%Y/%m/%d') <= DATE_ADD(NOW(), INTERVAL ? DAY)`;
        params.push(days);
      }
      extra += ` ORDER BY STR_TO_DATE(\`${dc}\`, '%Y/%m/%d') ASC`;
    }
    const sql = await safeSelect('template_codeinfo_d10', {
      code_id: 'code_id',
      name: '消防器材名称_3170252',
      code: '编号_3170086',
      location: '所在位置_3170087',
      inspector: '点检人_3170286',
      dept: '责任部门_81035291262977',
      last_date: '上次维修再充装日期_3170253',
      next_date: dc,
      scrap_date: '钢瓶强制报废日期_3170397',
      maintenance_unit: '维修再充装单位_3170288'
    }, extra);
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器强制报废预警（数据源：template_codeinfo_d10 钢瓶强制报废日期）
app.get('/api/fire-extinguisher/scrap', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 365;
    const dc = '钢瓶强制报废日期_3170397';
    const cols = await existingColumns('template_codeinfo_d10');
    let extra = '';
    const params = [];
    if (cols.has(dc)) {
      extra += `WHERE \`${dc}\` IS NOT NULL AND \`${dc}\` != ''`;
      if (days < 9999) {
        extra += ` AND STR_TO_DATE(\`${dc}\`, '%Y/%m/%d') <= DATE_ADD(NOW(), INTERVAL ? DAY)`;
        params.push(days);
      }
      extra += ` ORDER BY STR_TO_DATE(\`${dc}\`, '%Y/%m/%d') ASC`;
    }
    const sql = await safeSelect('template_codeinfo_d10', {
      code_id: 'code_id',
      name: '消防器材名称_3170252',
      code: '编号_3170086',
      location: '所在位置_3170087',
      inspector: '点检人_3170286',
      dept: '责任部门_81035291262977',
      manufacturer: '生产厂家_3170090',
      scrap_date: dc
    }, extra);
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器多维度分析
app.get('/api/fire-extinguisher/analysis', async (req, res) => {
  try {
    const sql = await safeSelect('template_codeinfo_d10', {
      spec: '消防器材名称_3170252',
      inspector: '点检人_3170286',
      manufacturer: '生产厂家_3170090',
      dept: '责任部门_81035291262977',
      location: '所在位置_3170087',
      code: '编号_3170086',
      next_maintenance: '下次维修再充装日期_3170398',
      scrap_date: '钢瓶强制报废日期_3170397'
    });
    const rows = await query(sql, []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 计划任务到期与超期分析（周期任务，实时）
app.get('/api/tasks/deadline', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const rows = await query(`
      SELECT 
        i.id,
        i.plan_id,
        COALESCE(p.记录单名称, CONCAT('周期计划 #', i.plan_id)) as plan_name,
        COALESCE(p.周期类型, t.cycle_type) as cycle_type,
        i.start_time,
        i.end_time,
        i.total_count,
        i.finish_count,
        i.unfinish_count,
        i.in_time_finish_count,
        i.serious_finish_count,
        i.skip_count,
        CASE 
          WHEN i.end_time < NOW() THEN '已逾期'
          WHEN i.end_time <= DATE_ADD(NOW(), INTERVAL ? DAY) THEN '即将到期'
          ELSE '进行中'
        END as status
      FROM cycle_task_instance i
      LEFT JOIN cycle_plan p ON i.plan_id = p.id
      LEFT JOIN cycle_task t ON i.cycle_task_id = t.id
      WHERE i.unfinish_count > 0
        AND i.end_time <= DATE_ADD(NOW(), INTERVAL ? DAY)
        AND (i.plan_id, i.end_time) IN (
          SELECT plan_id, MAX(end_time) FROM cycle_task_instance GROUP BY plan_id
        )
      ORDER BY i.end_time ASC
    `, [days, days]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 超期未完成记录（支持按截止时间切片）
app.get('/api/tasks/overdue', async (req, res) => {
  try {
    const params = [];
    let dateCond = '';
    if (req.query.startDate) { dateCond += ` AND 截止时间 >= ?`; params.push(req.query.startDate); }
    if (req.query.endDate) { dateCond += ` AND 截止时间 <= ?`; params.push(endVal(req.query.endDate)); }
    const rows = await query(`
      SELECT 
        计划名称,
        code_id,
        状态,
        开始时间,
        截止时间,
        执行时间,
        变更方式
      FROM code_task_log
      WHERE 状态 IN ('超期未完成', '未完成') ${dateCond}
        AND (计划名称, 截止时间) IN (
          SELECT 计划名称, MAX(截止时间) FROM code_task_log GROUP BY 计划名称
        )
      ORDER BY 截止时间 DESC
      LIMIT 200
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 草料二维码看板服务已启动: http://localhost:${PORT}`);
});
