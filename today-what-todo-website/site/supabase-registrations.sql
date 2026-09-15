-- รันเพิ่มใน Supabase → SQL Editor (สำหรับฟอร์มสมัครที่เด็กกรอกเอง)
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
