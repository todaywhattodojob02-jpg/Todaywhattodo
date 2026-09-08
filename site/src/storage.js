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
