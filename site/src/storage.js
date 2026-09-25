import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const mode = supabase ? "supabase" : "local";
const LS = "twt-state-v1";

// แปลง Date <-> string ตอนเก็บ
export const serialize = (state) => ({
  ...state,
  sessions: state.sessions.map((s) => ({ ...s, at: s.at.toISOString() })),
});
export const revive = (state) => ({
  ...state,
  sessions: state.sessions.map((s) => ({ ...s, at: new Date(s.at) })),
});

// ─── เก็บแบบแยกรายการ: students/sessions เป็นแถวๆ, config อยู่ใน app_state ───
const serSession = (x) => ({ ...x, at: x.at instanceof Date ? x.at.toISOString() : x.at });
const revSession = (x) => ({ ...x, at: new Date(x.at) });
const _cache = { students: new Map(), sessions: new Map() }; // id -> JSON string (รูปแบบที่เก็บ) ไว้ diff
const _chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
async function _fetchAll(table) {
  const size = 1000; let from = 0; let out = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select("id,data").range(from, from + size - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

async function seedRows(students, sessions) {
  for (const c of _chunk(students.map((x) => ({ id: x.id, data: x })), 300)) { const { error } = await supabase.from("students").upsert(c); if (error) throw error; }
  for (const c of _chunk(sessions.map((x) => ({ id: x.id, data: serSession(x) })), 300)) { const { error } = await supabase.from("sessions").upsert(c); if (error) throw error; }
}

export async function loadState() {
  if (!supabase) {
    const raw = localStorage.getItem(LS);
    const st = raw ? revive(JSON.parse(raw)) : null;
    if (st) { _cache.students = new Map((st.students || []).map((x) => [x.id, JSON.stringify(x)])); _cache.sessions = new Map((st.sessions || []).map((x) => [x.id, JSON.stringify(serSession(x))])); }
    return st;
  }
  const { data: cfgRow, error: e1 } = await supabase.from("app_state").select("data").eq("id", "main").maybeSingle();
  if (e1) throw e1;
  const cfg = cfgRow?.data || null;
  const stuRows = await _fetchAll("students");   // ดึงครบทุกแถว (>1000 ก็ได้)
  const sesRows = await _fetchAll("sessions");

  const rowsEmpty = (!stuRows || stuRows.length === 0) && (!sesRows || sesRows.length === 0);
  let students, sessions;
  if (rowsEmpty && cfg && Array.isArray(cfg.students) && cfg.students.length) {
    // ย้ายข้อมูลเดิม (ก้อนเดียว) เข้าตารางแยก ครั้งแรกครั้งเดียว
    students = cfg.students;
    sessions = cfg.sessions || [];
    await seedRows(students, sessions);
  } else {
    students = (stuRows || []).map((r) => r.data);
    sessions = (sesRows || []).map((r) => r.data);
  }
  _cache.students = new Map(students.map((x) => [x.id, JSON.stringify(x)]));
  _cache.sessions = new Map(sessions.map((x) => [x.id, JSON.stringify(x)])); // เก็บในรูปแบบ serialized (at เป็น iso)

  if (!cfg && rowsEmpty) return null; // ว่างจริง (เครื่องใหม่)

  return {
    students,
    sessions: sessions.map(revSession),
    courses: cfg?.courses, teachers: cfg?.teachers, rule: cfg?.rule,
    biz: cfg?.biz, groups: cfg?.groups, layout: cfg?.layout, usage: cfg?.usage,
  };
}

export async function saveState(state) {
  if (!supabase) {
    localStorage.setItem(LS, JSON.stringify(serialize(state)));
    _cache.students = new Map(state.students.map((x) => [x.id, JSON.stringify(x)]));
    _cache.sessions = new Map(state.sessions.map((x) => [x.id, JSON.stringify(serSession(x))]));
    return;
  }
  // config (เล็ก) เก็บก้อนเดียว — ไม่รวม students/sessions แล้ว
  const cfg = { courses: state.courses, teachers: state.teachers, rule: state.rule, biz: state.biz, groups: state.groups, layout: state.layout, usage: state.usage };
  const { error: ec } = await supabase.from("app_state").upsert({ id: "main", data: cfg, updated_at: new Date().toISOString() });
  if (ec) throw ec;

  // เซฟเฉพาะ "แถวที่เปลี่ยน" (คนอื่นแก้คนละแถวจะไม่ทับกัน)
  const curStu = new Map(state.students.map((x) => [x.id, JSON.stringify(x)]));
  const stuUp = []; for (const [id, js] of curStu) if (_cache.students.get(id) !== js) stuUp.push({ id, data: JSON.parse(js) });
  const stuDel = []; for (const id of _cache.students.keys()) if (!curStu.has(id)) stuDel.push(id);

  const curSes = new Map(state.sessions.map((x) => { const ss = serSession(x); return [x.id, JSON.stringify(ss)]; }));
  const sesUp = []; for (const [id, js] of curSes) if (_cache.sessions.get(id) !== js) sesUp.push({ id, data: JSON.parse(js) });
  const sesDel = []; for (const id of _cache.sessions.keys()) if (!curSes.has(id)) sesDel.push(id);

  // 🛡️ กันชน: ห้ามลบทีละมากผิดปกติ (กันข้อมูลหายยกชุดจากแคชไม่ครบ/บั๊ก)
  if (sesDel.length > 25) { console.warn("[safety] ยกเลิกการลบคาบจำนวนมากผิดปกติ:", sesDel.length); for (const id of sesDel) curSes.set(id, _cache.sessions.get(id)); sesDel.length = 0; }
  if (stuDel.length > 15) { console.warn("[safety] ยกเลิกการลบนักเรียนจำนวนมากผิดปกติ:", stuDel.length); for (const id of stuDel) curStu.set(id, _cache.students.get(id)); stuDel.length = 0; }

  for (const c of _chunk(stuUp, 300)) { const { error } = await supabase.from("students").upsert(c); if (error) throw error; }
  for (const c of _chunk(sesUp, 300)) { const { error } = await supabase.from("sessions").upsert(c); if (error) throw error; }
  for (const c of _chunk(stuDel, 200)) { const { error } = await supabase.from("students").delete().in("id", c); if (error) throw error; }
  for (const c of _chunk(sesDel, 200)) { const { error } = await supabase.from("sessions").delete().in("id", c); if (error) throw error; }

  _cache.students = curStu;
  _cache.sessions = curSes;
}

// ─── ฟอร์มสมัคร (เด็กกรอกเอง) ────────────────────────────────
const LS_REG = "twt-registrations";
export async function submitRegistration(form) {
  const row = { nick: form.nick, first: form.first, last: form.last, phone: form.phone, line: form.line, fb: form.fb, ig: form.ig, note: form.note || "" };
  if (!supabase) {
    const list = JSON.parse(localStorage.getItem(LS_REG) || "[]");
    list.push({ ...row, id: Date.now(), created_at: new Date().toISOString(), imported: false });
    localStorage.setItem(LS_REG, JSON.stringify(list));
    return;
  }
  const { error } = await supabase.from("registrations").insert(row);
  if (error) throw error;
}
export async function loadRegistrations() {
  if (!supabase) return JSON.parse(localStorage.getItem(LS_REG) || "[]").filter((r) => !r.imported);
  const { data, error } = await supabase.from("registrations").select("*").eq("imported", false).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function removeRegistration(id) {
  if (!supabase) {
    const list = JSON.parse(localStorage.getItem(LS_REG) || "[]").filter((r) => r.id !== id);
    localStorage.setItem(LS_REG, JSON.stringify(list));
    return;
  }
  const { error } = await supabase.from("registrations").delete().eq("id", id);
  if (error) throw error;
}

// ─── ฟอร์มลงทะเบียนข้อมูลครู (ครูกรอกเอง /teacher) ────────────
const LS_TREG = "twt-teacher-regs";
export async function submitTeacherReg(form) {
  const row = { name: form.name, phone: form.phone || "", line_id: form.lineId || "", bank: form.bank || "", acct_no: form.acctNo || "", acct_name: form.acctName || "", promptpay: form.promptpay || "" };
  if (!supabase) {
    const list = JSON.parse(localStorage.getItem(LS_TREG) || "[]");
    list.push({ ...row, id: Date.now(), created_at: new Date().toISOString() });
    localStorage.setItem(LS_TREG, JSON.stringify(list));
    return;
  }
  const { error } = await supabase.from("teacher_registrations").insert(row);
  if (error) throw error;
}
export async function loadTeacherRegs() {
  if (!supabase) return JSON.parse(localStorage.getItem(LS_TREG) || "[]");
  const { data, error } = await supabase.from("teacher_registrations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function removeTeacherReg(id) {
  if (!supabase) {
    const list = JSON.parse(localStorage.getItem(LS_TREG) || "[]").filter((r) => r.id !== id);
    localStorage.setItem(LS_TREG, JSON.stringify(list));
    return;
  }
  const { error } = await supabase.from("teacher_registrations").delete().eq("id", id);
  if (error) throw error;
}

// ─── ระบบจ่ายเงิน: อัปสลิป (Supabase Storage) + บันทึกการจ่าย ─────
const LS_PAY = "twt-payments";
export async function uploadSlip(file) {
  if (!supabase) { return await new Promise((res) => { const r = new FileReader(); r.onload = () => res({ url: r.result, path: "local" }); r.readAsDataURL(file); }); }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("slips").upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("slips").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
export async function submitPayment(rec) {
  const row = { student_name: rec.studentName || "", student_id: rec.studentId || "", amount: Number(rec.amount) || 0, month: rec.month || new Date().toISOString().slice(0, 7), slip_url: rec.slipUrl || "", slip_path: rec.slipPath || "", note: rec.note || "", status: "pending" };
  if (!supabase) { const list = JSON.parse(localStorage.getItem(LS_PAY) || "[]"); list.push({ ...row, id: Date.now(), created_at: new Date().toISOString() }); localStorage.setItem(LS_PAY, JSON.stringify(list)); return; }
  const { error } = await supabase.from("payments").insert(row);
  if (error) throw error;
}
export async function loadPayments() {
  if (!supabase) return JSON.parse(localStorage.getItem(LS_PAY) || "[]");
  const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function updatePayment(id, patch) {
  if (!supabase) { const list = JSON.parse(localStorage.getItem(LS_PAY) || "[]").map((p) => (p.id === id ? { ...p, ...patch } : p)); localStorage.setItem(LS_PAY, JSON.stringify(list)); return; }
  const { error } = await supabase.from("payments").update(patch).eq("id", id);
  if (error) throw error;
}
export async function removePayment(id) {
  if (!supabase) { const list = JSON.parse(localStorage.getItem(LS_PAY) || "[]").filter((p) => p.id !== id); localStorage.setItem(LS_PAY, JSON.stringify(list)); return; }
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) throw error;
}

// ─── ตั้งค่าหน้าจ่ายเงิน (public /pay ดึงไปโชว์ QR + เลขบัญชี) ─────
export async function savePayConfig(cfg) {
  const row = { id: "main", qr_url: cfg.qrUrl || "", promptpay: cfg.promptpay || "", bank_info: cfg.bankInfo || "", updated_at: new Date().toISOString() };
  if (!supabase) { localStorage.setItem("twt-payconfig", JSON.stringify(row)); return; }
  const { error } = await supabase.from("pay_config").upsert(row);
  if (error) throw error;
}
export async function loadPayConfig() {
  if (!supabase) { try { return JSON.parse(localStorage.getItem("twt-payconfig") || "null"); } catch (e) { return null; } }
  const { data, error } = await supabase.from("pay_config").select("*").eq("id", "main").maybeSingle();
  if (error) return null;
  return data;
}

// ─── Realtime: เครื่องอื่นแก้แล้วเห็นทันที (กันข้อมูลชนกัน) ──────────
let _rtChannel = null;
export function subscribeRealtime(onStudent, onSession) {
  if (!supabase) return () => {};
  try {
    if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
    _rtChannel = supabase.channel("twt-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, (p) => {
        if (p.eventType === "DELETE") { const id = p.old?.id; if (id != null) { _cache.students.delete(id); onStudent({ type: "delete", id }); } }
        else { const row = p.new; if (row?.data) { _cache.students.set(row.id, JSON.stringify(row.data)); onStudent({ type: "upsert", student: row.data }); } }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, (p) => {
        if (p.eventType === "DELETE") { const id = p.old?.id; if (id != null) { _cache.sessions.delete(id); onSession({ type: "delete", id }); } }
        else { const row = p.new; if (row?.data) { _cache.sessions.set(row.id, JSON.stringify(row.data)); onSession({ type: "upsert", session: revSession(row.data) }); } }
      })
      .subscribe();
  } catch (e) { console.error("realtime error", e); return () => {}; }
  return () => { try { if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; } } catch (e) {} };
}

// ─── สำรองอัตโนมัติบนคลาวด์ (เก็บวันละ 1 สแนปช็อต กู้ย้อนหลังได้) ──────
export async function pushSnapshot(state) {
  if (!supabase) return;
  const day = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("backups").upsert({ id: day, data: serialize(state), created_at: new Date().toISOString() });
  if (error) throw error;
}
export async function listSnapshots() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("backups").select("id,created_at").order("id", { ascending: false }).limit(30);
  if (error) return [];
  return data || [];
}
export async function loadSnapshot(id) {
  if (!supabase) return null;
  const { data, error } = await supabase.from("backups").select("data").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.data ? revive(data.data) : null;
}
