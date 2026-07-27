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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
    }
    
    sql += ` GROUP BY 检查结果_3170565`;
    const rows = await query(sql, params);
    res.json(rows);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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
      params.push(req.query.endDate);
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

// ========== 新增 API ==========

// 急救药箱药品有效期追踪（计算每种药品是否在有效期内）
app.get('/api/first-aid/expiry', async (req, res) => {
  try {
    const EXPIRING_SOON_DAYS = 30; // 临期阈值
    const rows = await query(`
      SELECT 
        record_id,
        码名称,
        工段_3333406 as location,
        记录时间,
        记录人,
        药品有效期_创可贴_3333393 as 创可贴,
        药品有效期_消毒纱布片_3333393 as 消毒纱布片,
        药品有效期_棉签_3333393 as 棉签,
        药品有效期_碘伏_3333393 as 碘伏,
        药品有效期_双氧水_3333393 as 双氧水,
        药品有效期_烫伤膏_3333393 as 烫伤膏,
        药品有效期_藿香正气水_3333393 as 藿香正气水
      FROM table_d24
      ORDER BY record_id DESC
    `);
    // 解析 "YYYY年MM月DD日" -> Date，并计算状态
    const parseCN = (s) => {
      if (!s || typeof s !== 'string' || s.trim() === '') return null;
      const m = s.trim().match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (!m) return null;
      return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const drugFields = ['创可贴', '消毒纱布片', '棉签', '碘伏', '双氧水', '烫伤膏', '藿香正气水'];
    const result = rows.map(r => {
      const drugs = drugFields.map(name => {
        const raw = r[name];
        const d = parseCN(raw);
        let status = 'unknown', remaining = null, iso = null;
        if (d) {
          iso = d.toISOString().split('T')[0];
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
        recordId: r.record_id,
        boxName: r.码名称,
        location: r.location,
        recordTime: r.记录时间,
        recorder: r.记录人,
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
    let sql = `
      SELECT 
        code_id,
        消防器材名称_3170252 as name,
        编号_3170086 as code,
        所在位置_3170087 as location,
        点检人_3170286 as inspector,
        责任部门_81035291262977 as dept,
        上次维修再充装日期_3170253 as last_date,
        下次维修再充装日期_3170398 as next_date,
        钢瓶强制报废日期_3170397 as scrap_date,
        维修再充装单位_3170288 as maintenance_unit
      FROM template_codeinfo_d10
      WHERE 下次维修再充装日期_3170398 IS NOT NULL 
        AND 下次维修再充装日期_3170398 != ''
    `;
    const params = [];
    if (days < 9999) {
      sql += ` AND STR_TO_DATE(下次维修再充装日期_3170398, '%Y/%m/%d') <= DATE_ADD(NOW(), INTERVAL ? DAY)`;
      params.push(days);
    }
    sql += ` ORDER BY STR_TO_DATE(下次维修再充装日期_3170398, '%Y/%m/%d') ASC`;
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 灭火器多维度分析
app.get('/api/fire-extinguisher/analysis', async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        消防器材名称_3170252 as spec,
        点检人_3170286 as inspector,
        责任部门_81035291262977 as dept,
        所在位置_3170087 as location,
        编号_3170086 as code,
        下次维修再充装日期_3170398 as next_maintenance,
        钢瓶强制报废日期_3170397 as scrap_date
      FROM template_codeinfo_d10
    `);
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
      ORDER BY i.end_time ASC
    `, [days, days]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 超期未完成记录
app.get('/api/tasks/overdue', async (req, res) => {
  try {
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
      WHERE 状态 IN ('超期未完成', '未完成')
      ORDER BY 截止时间 DESC
      LIMIT 100
    `);
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
