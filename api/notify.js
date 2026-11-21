// 文件路径：项目根目录/api/notify.js（此文件只在 Vercel 服务器运行，浏览器 F12 永远看不到）
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 从 Vercel 环境变量读取不带 VITE_ 前缀的私密密钥
  const secretKey = process.env.SMS_API_SECRET;
  const { phone, message } = req.body || {};

  // 在这里调用短信或机器人接口...
  return res.status(200).json({ ok: true });
}
