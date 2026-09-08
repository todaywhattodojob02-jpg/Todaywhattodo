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
