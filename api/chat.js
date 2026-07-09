// Vercel Serverless Function —— 旅行规划中转
// 作用：把 API Key 藏在服务器（环境变量），前端只调 /api/chat，看不到 Key。
// 需要在 Vercel 项目里配置的环境变量：
//   SILICONFLOW_API_KEY  （必填）你的硅基流动 Key，如 sk-xxxx
//   MODEL                （选填）默认 deepseek-ai/DeepSeek-V3
//   BASE_URL             （选填）默认 https://api.siliconflow.cn/v1
//   ALLOWED_ORIGIN       （选填）只允许你自己的网址调用，如 https://your-app.vercel.app

const SYSTEM_PROMPT = `你是一位资深的旅行规划师和机票优惠专家。用户会提供出发地、目的地、日期、天数、人数、预算和偏好。请用简体中文、Markdown 格式输出一份实用、具体、可执行的旅行方案，严格包含以下四个二级标题板块：

## 一、机票购买策略
- 推荐的航线方案（直飞 vs 中转，列出常见中转城市及其省钱幅度）
- 最佳购买提前量、值得关注的航司/廉航
- 淡旺季与星期几出发的价格差异提示
- 给出往返机票的**大致价格区间**（人民币），并明确标注这是估算、需到比价网站核实
- 3-5 条实用省钱技巧（灵活日期、分段购票、里程、错峰等）

## 二、每日行程路线
- 按天列出（第1天、第2天……），每天包含上午/下午/晚上的安排
- 路线尽量顺路、不折返，考虑用户偏好和体力
- 标注景点之间的大致交通方式和耗时

## 三、预算明细
- 用 Markdown 表格列出各项：机票、住宿、餐饮、市内交通、门票、其他
- 给出人均和总计估算，并与用户预算对比、给出是否够用的判断

## 四、住宿与实用提示
- 推荐 2-3 个适合入住的区域及理由
- 签证、货币、网络、天气、语言、注意事项等实用信息

要求：内容具体到可直接执行，避免空话套话。价格用人民币。只回答旅行规划相关内容，若用户信息与旅行无关则礼貌说明本工具仅用于旅行规划。`;

function buildUserPrompt(d) {
  const s = v => (v == null ? '' : String(v)).slice(0, 200); // 限制每个字段长度
  return `请为以下行程做规划：
- 出发城市：${s(d.origin) || '未填'}
- 目的地：${s(d.dest) || '未填'}
- 出发日期：${s(d.date) || '灵活'}
- 出行天数：${s(d.days) || '未填'}
- 出行人数：${s(d.people) || '1人'}
- 总预算：${d.budget ? s(d.budget) + '元' : '未设定，请给经济与舒适两档参考'}
- 偏好与需求：${s(d.prefs) || '无特别要求'}`;
}

// —— 极简内存限流（尽力而为，冷启动会重置；真正的防线是硅基账户余额上限）——
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const WINDOW = 60 * 1000;   // 1 分钟
  const MAX = 5;              // 每分钟每 IP 最多 5 次
  const rec = hits.get(ip) || { t: now, n: 0 };
  if (now - rec.t > WINDOW) { rec.t = now; rec.n = 0; }
  rec.n++;
  hits.set(ip, rec);
  if (hits.size > 5000) hits.clear(); // 防止内存无限增长
  return rec.n > MAX;
}

export default async function handler(req, res) {
  // CORS（默认同源即可，若跨域用 ALLOWED_ORIGIN 控制）
  const origin = req.headers.origin || '';
  const allow = process.env.ALLOWED_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', allow || origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });

  // 来源校验（若设置了 ALLOWED_ORIGIN，则拒绝其它站点盗用你的接口）
  if (allow && origin && origin !== allow) {
    return res.status(403).json({ error: '来源不被允许' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: '请求太频繁，请过一会儿再试' });
  }

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: '服务器未配置 API Key（请在 Vercel 环境变量里设置 SILICONFLOW_API_KEY）' });
  const BASE_URL = (process.env.BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
  const MODEL = process.env.MODEL || 'deepseek-ai/DeepSeek-V3';

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  d = d || {};
  if (!d.dest) return res.status(400).json({ error: '请至少填写目的地' });

  try {
    const upstream = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,          // 限制单次输出，控制成本
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(d) }
        ]
      })
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => '');
      return res.status(upstream.status || 502).json({ error: '上游接口出错：' + t.slice(0, 300) });
    }

    // 把上游的 SSE 流原样转发给前端
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(dec.decode(value, { stream: true }));
      if (typeof res.flush === 'function') res.flush();
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: '服务器错误：' + String(err && err.message || err) });
  }
}
