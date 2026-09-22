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

export async function loadState() {
  if (!supabase) {
    const raw = localStorage.getItem(LS);
    return raw ? revive(JSON.parse(raw)) : null;
  }
  const { data, error } = await supabase.from("app_state").select("data").eq("id", "main").maybeSingle();
  if (error) throw error;
  return data?.data ? revive(data.data) : null;
}

export async function saveState(state) {
  const payload = serialize(state);
  if (!supabase) { localStorage.setItem(LS, JSON.stringify(payload)); return; }
  const { error } = await supabase.from("app_state").upsert({ id: "main", data: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
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
