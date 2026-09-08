-- รันใน Supabase → SQL Editor ครั้งเดียว
create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table app_state enable row level security;
-- เวอร์ชันแรก: ให้แอปอ่าน/เขียนได้ด้วย anon key (ล็อกหน้าเว็บด้วย PIN)
create policy "app read"  on app_state for select using (true);
create policy "app write" on app_state for insert with check (true);
create policy "app update" on app_state for update using (true);

-- ตารางรับสมัคร (เด็กกรอกเองผ่านลิงก์ /join)
create table if not exists registrations (
  id bigint generated always as identity primary key,
  nick text, first text, last text, phone text, line text, fb text, ig text, note text,
  created_at timestamptz default now(),
  imported boolean default false
);
alter table registrations enable row level security;
create policy "anyone can register" on registrations for insert with check (true);
create policy "app read regs"  on registrations for select using (true);
create policy "app update regs" on registrations for update using (true);
create policy "app delete regs" on registrations for delete using (true);
