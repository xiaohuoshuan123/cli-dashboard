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

// 创建连接池
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 通用查询函数
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ========== API 路由 ==========

// 健康检查
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', message: '数据库连接正常' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 核心统计
app.get('/api/stats', async (req, res) => {
  try {
    const [codeCount] = await query('SELECT COUNT(*) as count FROM base_codeinfo');
    const [recordCount] = await query('SELECT COUNT(*) as count FROM base_table_data');
    const [taskCount] = await query('SELECT COUNT(*) as count FROM code_task_log');
    const [memberCount] = await query('SELECT COUNT(*) as count FROM base_auth_msg');
    
    // 计划完成率
    const [taskStats] = await query(`
      SELECT 
        SUM(CASE WHEN 状态 = '完成' THEN 1 ELSE 0 END) as completed,
        COUNT(*) as total
      FROM code_task_log
    `);
    
    const completionRate = taskStats.total > 0 
      ? ((taskStats.completed / taskStats.total) * 100).toFixed(1) 
      : 0;

    // 时间范围
    const [timeRange] = await query(`
      SELECT 
        MIN(记录时间) as earliest,
        MAX(记录时间) as latest
      FROM base_table_data
    `);

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

// 月度趋势
app.get('/api/trends/monthly', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM base_table_data
      GROUP BY DATE_FORMAT(记录时间, '%Y-%m')
      ORDER BY month
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 表单分布
app.get('/api/forms/distribution', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 记录单名称 as name, COUNT(*) as count
      FROM base_table_data
      GROUP BY 记录单名称
      ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 计划执行状态
app.get('/api/tasks/status', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 状态 as status, COUNT(*) as count
      FROM code_task_log
      GROUP BY 状态
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器检查趋势
app.get('/api/fire-extinguisher/trend', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d19
      GROUP BY DATE_FORMAT(记录时间, '%Y-%m')
      ORDER BY month
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器检查结果
app.get('/api/fire-extinguisher/results', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 检查结果_3171776 as result, COUNT(*) as count
      FROM table_d19
      WHERE 检查结果_3171776 IS NOT NULL AND 检查结果_3171776 != ''
      GROUP BY 检查结果_3171776
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 消防应急灯趋势
app.get('/api/emergency-lights/trend', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d16
      GROUP BY DATE_FORMAT(记录时间, '%Y-%m')
      ORDER BY month
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 消防应急灯检查结果
app.get('/api/emergency-lights/results', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 检查结果_3170565 as result, COUNT(*) as count
      FROM table_d16
      WHERE 检查结果_3170565 IS NOT NULL AND 检查结果_3170565 != ''
      GROUP BY 检查结果_3170565
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 急救药箱点检趋势
app.get('/api/first-aid/trend', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d22
      GROUP BY DATE_FORMAT(记录时间, '%Y-%m')
      ORDER BY month
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 洗眼器点检趋势
app.get('/api/eye-wash/trend', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        DATE_FORMAT(记录时间, '%Y-%m') as month,
        COUNT(*) as count
      FROM table_d27
      GROUP BY DATE_FORMAT(记录时间, '%Y-%m')
      ORDER BY month
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 压力表状态
app.get('/api/pressure-gauge/status', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 压力表状态_720 as status, COUNT(*) as count
      FROM code_state
      WHERE 压力表状态_720 IS NOT NULL AND 压力表状态_720 != ''
      GROUP BY 压力表状态_720
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
      SELECT 消防气瓶状态_720 as status, COUNT(*) as count
      FROM code_state
      WHERE 消防气瓶状态_720 IS NOT NULL AND 消防气瓶状态_720 != ''
      GROUP BY 消防气瓶状态_720
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 人员排行
app.get('/api/members/ranking', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 记录人 as name, COUNT(*) as count
      FROM base_table_data
      WHERE 记录人 IS NOT NULL AND 记录人 != ''
      GROUP BY 记录人
      ORDER BY count DESC
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器检查人员排行
app.get('/api/fire-extinguisher/ranking', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 记录人 as name, COUNT(*) as count
      FROM table_d19
      WHERE 记录人 IS NOT NULL AND 记录人 != ''
      GROUP BY 记录人
      ORDER BY count DESC
      LIMIT 15
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 计划执行明细
app.get('/api/tasks/details', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        计划名称 as name,
        COUNT(*) as total,
        SUM(CASE WHEN 状态 = '完成' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN 状态 = '超期未完成' THEN 1 ELSE 0 END) as overdue_incomplete,
        SUM(CASE WHEN 状态 = '未完成' THEN 1 ELSE 0 END) as incomplete,
        SUM(CASE WHEN 状态 = '超期完成' THEN 1 ELSE 0 END) as overdue_complete
      FROM code_task_log
      GROUP BY 计划名称
      ORDER BY total DESC
    `);
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
    const rows = await query(`
      SELECT 
        record_id,
        记录单名称,
        记录人,
        记录时间,
        状态
      FROM base_table_data
      ORDER BY 记录时间 DESC
      LIMIT ?
    `, [limit]);
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
