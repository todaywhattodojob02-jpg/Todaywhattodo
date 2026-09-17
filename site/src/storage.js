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
