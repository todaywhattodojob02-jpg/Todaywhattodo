# Today What Todo · หลังบ้านโรงเรียนสอนทำเพลง

เว็บแอปจัดตารางสอน นักเรียน เงินเดือนครู (React + Vite) · เก็บข้อมูลบน Supabase · ขึ้นเว็บด้วย Vercel · เปิดจากมือถือได้ (เพิ่มไอคอนหน้าจอโฮมได้)

## ขั้นตอนขึ้นเว็บ (ทำครั้งเดียว ประมาณ 30 นาที)

### 1. สมัคร 3 บัญชีนี้ (ฟรีทั้งหมด)
- **GitHub** https://github.com — ที่เก็บโค้ด
- **Supabase** https://supabase.com — ฐานข้อมูล
- **Vercel** https://vercel.com — โฮสต์เว็บ (สมัครด้วยบัญชี GitHub)

### 2. สร้างฐานข้อมูลใน Supabase
1. New project → ตั้งชื่อ `today-what-todo` ตั้งรหัสฐานข้อมูล เลือก region **Singapore**
2. เมนูซ้าย **SQL Editor** → New query → วางเนื้อหาไฟล์ `supabase.sql` ทั้งหมด → Run
3. เมนู **Project Settings → API** จด 2 ค่านี้ไว้
   - Project URL (เช่น `https://abcd1234.supabase.co`)
   - anon public key (ขึ้นต้น `eyJ...`)

### 3. อัปโหลดโค้ดขึ้น GitHub
1. GitHub → New repository → ชื่อ `today-what-todo` → Create
2. กด **uploading an existing file** → ลากไฟล์และโฟลเดอร์ทั้งหมดในโปรเจกต์นี้ใส่ (ยกเว้น `node_modules` กับ `dist` ถ้ามี) → Commit changes

### 4. ขึ้นเว็บด้วย Vercel
1. Vercel → **Add New → Project** → เลือก repo `today-what-todo` → Import
2. Framework จะเด้งเป็น **Vite** อัตโนมัติ
3. เปิดหัวข้อ **Environment Variables** ใส่ 3 ตัวนี้
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL จากข้อ 2 |
   | `VITE_SUPABASE_ANON_KEY` | anon key จากข้อ 2 |
   | `VITE_ADMIN_PIN` | รหัสเข้าหลังบ้านที่ต้องการ เช่น `2468` |
4. กด **Deploy** รอ 1–2 นาที จะได้ลิงก์ `https://today-what-todo-xxxx.vercel.app`

### 5. เปิดใช้งาน
- เปิดลิงก์ → ใส่ PIN → ครั้งแรกระบบจะใช้ข้อมูลจาก Excel ที่ฝังไว้ พอแก้อะไรก็ตามจะบันทึกขึ้น Supabase ทันที (มุมขวาบนเขียนว่า "บันทึกบนคลาวด์แล้ว")
- มือถือ: เปิดใน Safari/Chrome → Share → **Add to Home Screen** จะได้ไอคอนเหมือนแอป

## ถ้าต้องการโดเมนของตัวเอง
Vercel → Project → Settings → Domains → ใส่โดเมน แล้วตั้งค่า DNS ตามที่ Vercel บอก (ซื้อโดเมนได้ที่ Namecheap / GoDaddy / Cloudflare ปีละ ~400–600 บาท)

## ทดสอบในเครื่องตัวเอง (ไม่บังคับ)
ต้องมี Node.js 18+ (https://nodejs.org)
```bash
npm install
cp .env.example .env   # แล้วแก้ค่าใน .env
npm run dev            # เปิด http://localhost:5173
```
ถ้าไม่ใส่ค่า Supabase ใน .env แอปจะเก็บข้อมูลไว้ในเบราว์เซอร์เครื่องนั้นแทน

## โครงสร้างไฟล์
- `src/App.jsx` — ตัวแอปทั้งหมด (ตาราง นักเรียน หลังบ้าน) + ข้อมูลตั้งต้นจาก Excel
- `src/storage.js` — โหลด/บันทึกข้อมูล (Supabase หรือ localStorage)
- `supabase.sql` — สร้างตารางในฐานข้อมูล
- `public/` — ไอคอนและ manifest สำหรับติดหน้าจอมือถือ

## หมายเหตุด้านความปลอดภัย
เวอร์ชันนี้ล็อกด้วย PIN ที่หน้าเว็บ และ Supabase เปิดให้ anon key อ่าน/เขียนได้ เหมาะกับใช้งานภายในทีมเล็กๆ
ถ้าอยากให้แน่นขึ้น (ล็อกอินด้วยอีเมล แยกสิทธิ์ครูแต่ละคน) ทำเพิ่มได้ในขั้นถัดไป
