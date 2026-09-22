// Vercel Serverless Function — Webhook รับ event จาก LINE
// ใช้หา ID ของกลุ่ม/ผู้ใช้ (พิมพ์อะไรก็ได้หา OA แล้วบอทจะตอบ ID กลับมา)
// ตั้งค่า ENV: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET (ไม่บังคับ)
import crypto from "node:crypto";
export const config = { api: { bodyParser: false } };
async function raw(req) { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const secret = process.env.LINE_CHANNEL_SECRET;
  const buf = await raw(req);
  if (secret) {
    const sig = crypto.createHmac("sha256", secret).update(buf).digest("base64");
    if (sig !== req.headers["x-line-signature"]) return res.status(401).send("bad signature");
  }
  let data = {}; try { data = JSON.parse(buf.toString()); } catch (e) {}
  for (const ev of data.events || []) {
    const src = ev.source || {};
    const id = src.groupId || src.roomId || src.userId || "?";
    const kind = src.groupId ? "กลุ่มนี้ (groupId)" : src.roomId ? "ห้องนี้ (roomId)" : "ผู้ใช้นี้ (userId)";
    if (ev.type === "message" && ev.replyToken && token) {
      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ replyToken: ev.replyToken, messages: [{ type: "text", text: `ID ของ${kind}:\n${id}\n\nนำ ID นี้ไปวางเป็น LINE_TARGET_ID ใน Vercel เพื่อให้ระบบส่งแจ้งเตือนมาที่นี่ครับ` }] }),
      }).catch(() => {});
    }
  }
  return res.status(200).send("ok");
}
