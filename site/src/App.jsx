import { useState, useMemo, useEffect, useRef } from "react";
import { loadState, saveState, mode, submitRegistration, loadRegistrations, removeRegistration, serialize, revive, submitTeacherReg, loadTeacherRegs, removeTeacherReg, uploadSlip, submitPayment, loadPayments, updatePayment, removePayment, savePayConfig, loadPayConfig, subscribeRealtime, pushSnapshot, listSnapshots, loadSnapshot } from "./storage.js";
import { QRCodeSVG } from "qrcode.react";
import {
  Volume2, SlidersVertical, Phone, MessageCircle, Facebook, Instagram,
  CalendarDays, Users, Wallet, Link2, ChevronRight, X, Award, Copy, Check, Lock, Cloud, CloudOff, DoorOpen, Sun, Moon, Settings,
} from "lucide-react";

// ─── ธีมสีตามโลโก้ ───────────────────────────────────────────
const BLUE = "var(--blue)";
// ── พร้อมเพย์ QR (มาตรฐาน EMVCo/PromptPay) ──
const ppTlv = (tag, v) => tag + String(v.length).padStart(2, "0") + v;
const ppCrc = (str) => { let c = 0xffff; for (let i = 0; i < str.length; i++) { c ^= str.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, "0"); };
const promptpayPayload = (target, amount) => {
  const id = String(target || "").replace(/[^0-9]/g, ""); if (!id) return "";
  const acc = id.length >= 13 ? ppTlv("02", id) : ppTlv("01", ("0000000000000" + id.replace(/^0/, "66")).slice(-13));
  const merchant = ppTlv("00", "A000000677010111") + acc;
  let pl = ppTlv("00", "01") + ppTlv("01", amount ? "12" : "11") + ppTlv("29", merchant) + ppTlv("53", "764") + (amount ? ppTlv("54", Number(amount).toFixed(2)) : "") + ppTlv("58", "TH") + "6304";
  return pl + ppCrc(pl);
};
const BLUE_DARK = "var(--blue-dark)";
const BLUE_SOFT = "var(--blue-soft)";
const INK = "var(--ink)";

const font = { fontFamily: "'Prompt', 'Kanit', 'Sarabun', system-ui, sans-serif" };

// ─── ธีม Light / Dark ───────────────────────────────────────────
const THEME_CSS = `
:root{--bg:#F4F7FD;--card:#ffffff;--ink:#10254F;--muted:#7A8296;--line:#D7E0F3;--line-soft:#EEF2FA;--blue:#1656D6;--blue-dark:#0F44B0;--blue-soft:#E9F0FE;}
[data-theme="dark"]{--bg:#0F1420;--card:#182233;--ink:#E6ECF7;--muted:#94A2B8;--line:#2A3750;--line-soft:#222E44;--blue:#4F8BFF;--blue-dark:#3B6FD6;--blue-soft:#1E2A44;}
body{background:var(--bg);}
[data-theme="dark"] .bg-white{background-color:var(--card)!important;}
[data-theme="dark"] .bg-slate-50,[data-theme="dark"] .bg-slate-100{background-color:#1E2A3E!important;}
[data-theme="dark"] .text-slate-300{color:#6B7688!important;}
[data-theme="dark"] .text-slate-400{color:#8A97AD!important;}
[data-theme="dark"] .text-slate-500{color:var(--muted)!important;}
[data-theme="dark"] .text-slate-600{color:#AEB9CC!important;}
[data-theme="dark"] .text-slate-700{color:#C3CCDC!important;}
[data-theme="dark"] input,[data-theme="dark"] select,[data-theme="dark"] textarea{background:var(--card);color:var(--ink);}
`;
if (typeof document !== "undefined" && !document.getElementById("twt-theme")) {
  const st = document.createElement("style"); st.id = "twt-theme"; st.textContent = THEME_CSS; document.head.appendChild(st);
  try { const saved = localStorage.getItem("twt-theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); } catch (e) {}
}
const applyTheme = (t) => { try { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("twt-theme", t); } catch (e) {} };

// ─── ข้อมูลจริงจากไฟล์ Excel (ทุกแท็บ) ────────────────────────────
// students: [id, ชื่อเล่น, ชื่อจริง, นามสกุล, tel, line, fb, ig]
// courses:  [ชื่อคอร์ส, ราคา, จำนวนครั้ง, ค่าสอนต่อคาบ]
// purchases:[id, วันที่ซื้อ, คอร์ส, ราคา, สถานะโอน, วันเริ่ม, ครู, รวมครั้ง, เวลา]
// sessions: [id, วันที่, เวลา, ครู, คอร์ส, ครั้งที่, รวม, สถานะ, คลาส, คะแนน, หมายเหตุ]

// ใบเซอร์: ค่าตั้งต้นนับคอร์ส "ทำเพลง" กับ "Mix & Mastering" (คอร์สติวไม่นับ) — แก้เองได้ในหลังบ้าน
const certEligible = (name = "") => !name.includes("ติว") && (name.includes("ทำเพลง") || name.toLowerCase().includes("mix"));
const CERT_TARGET = 3;
const COURSES = [
  ["ติวเทคโนโลยี",8500,10,300],["ทำเพลง 1",8900,8,400],["ทำเพลง half",3950,4,400],
  ["ติวเทคโนโลยี กลุ่ม",7500,10,400],["ติวเทคโนโลยี กลุ่ม ลด 5%",7125,10,400],["ติวเทคโนโลยี 2 ชม.",8500,5,500],
  ["ทำเพลง",7900,10,400],["Mix & Mastering",7900,10,400],["ติวทำเพลง",7900,10,400],
  ["ติวทำเพลง กลุ่ม",5900,10,500],["ติวเทคโนโลยี ใหม่",4500,5,300],["ติวเทคโนโลยี รวมพิเศษ",0,0,400],
  ["Mix & Mastering ใหม่",3500,4,400],["ทำเพลง ใหม่",3500,4,400],["ทำเพลง Advance",3900,4,500],
].map(([name, price, sessions, rate]) => ({ id: name, name, price, sessions, rate, cost: 0, cert: certEligible(name), discount: 0 }));
const TEACHERS = [["Aoujai","Active"],["Jingle","Active"],["Peem","Active"],["Miu","Active"],["Guy","Active"],["Japan","Active"]].map(([name, status]) => ({ id: name, name, status }));

const today = new Date(); today.setHours(0, 0, 0, 0);
const d = (offset, h) => { const x = new Date(today); x.setDate(x.getDate() + offset); x.setHours(h, 0, 0, 0); return x; };
const mkDate = (ymd, hm) => { const [y, m, dd] = ymd.split("-").map(Number); const [h, mi] = (hm || "0:00").split(":").map(Number); return new Date(y, m - 1, dd, h, mi, 0, 0); };

let seq = 10000 + Math.floor(Date.now() % 1e7);
const INITIAL_SESSIONS = []; // ข้อมูลจริงอยู่บนคลาวด์


const INITIAL_STUDENTS = [];

const thDate = (x) => x.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const thTime = (x) => x.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น.";
const baht = (n) => "฿" + n.toLocaleString("th-TH");

// ─── โลโก้ ─────────────────────────────────────────────────────
function Logo({ size = 22 }) {
  const O = ({ Icon }) => (
    <span className="inline-flex items-center justify-center rounded-full bg-white align-middle"
      style={{ width: size * 1.05, height: size * 1.05, color: BLUE, margin: "0 1px" }}>
      <Icon size={size * 0.6} strokeWidth={2.6} />
    </span>
  );
  return (
    <div className="font-black leading-none text-white select-none" style={{ fontSize: size, letterSpacing: "-0.02em" }}>
      <div>T<O Icon={Volume2} />DAY</div>
      <div>WHAT</div>
      <div>T<O Icon={Volume2} />D<O Icon={SlidersVertical} /></div>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────
const PIN = import.meta.env.VITE_ADMIN_PIN || "";

export default function App() {
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/join") return <JoinPage />;
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/teacher") return <TeacherJoinPage />;
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/pay") return <PaySlipPage />;
  return <AdminApp />;
}

// ─── หน้าสมัครสำหรับเด็ก (ไม่ต้องใส่ PIN) ─────────────────────────
function JoinPage() {
  const [f, setF] = useState({ nick: "", first: "", last: "", phone: "", line: "", fb: "", ig: "", note: "" });
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    if (!f.nick.trim() || !f.phone.trim()) { setState("missing"); return; }
    setState("sending");
    try { await submitRegistration(f); setState("done"); } catch (e) { console.error(e); setState("error"); }
  };
  const inp = (k, label, ph, extra = {}) => (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <input value={f[k]} onChange={set(k)} placeholder={ph} className="w-full rounded-lg px-3 py-2 text-sm" style={{ ...font, border: "1px solid var(--line)", background: "#FAFBFF" }} {...extra} />
    </label>
  );
  return (
    <div className="min-h-screen" style={{ ...font, background: BLUE, color: INK }}>
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="text-white"><Logo size={18} /></div>
        <div className="mt-4 overflow-hidden rounded-3xl bg-white">
          <div className="px-5 pt-5 text-white" style={{ background: BLUE }}>
            <div className="text-lg font-bold">ยินดีต้อนรับ 🎧</div>
            <div className="pb-5 text-sm text-white/80">กรอกข้อมูลนิดหน่อยแล้วเจอกันในคลาสครับ</div>
          </div>
          {state === "done" ? (
            <div className="p-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#E6F6EA", color: "#1B7A3A" }}><Check size={28} /></div>
              <div className="text-lg font-bold">ส่งข้อมูลเรียบร้อย</div>
              <div className="mt-1 text-sm text-slate-500">ขอบคุณครับ {f.nick} เดี๋ยวทางโรงเรียนจะติดต่อกลับเพื่อนัดวันเวลาเรียน</div>
            </div>
          ) : (
            <div className="space-y-3 p-5">
              {inp("nick", "ชื่อเล่น *", "เช่น ซี")}
              <div className="grid grid-cols-2 gap-2">{inp("first", "ชื่อจริง", "")}{inp("last", "นามสกุล", "")}</div>
              {inp("phone", "เบอร์โทร *", "08x-xxx-xxxx", { inputMode: "tel" })}
              {inp("line", "LINE ID", "")}
              {inp("fb", "Facebook", "ชื่อหรือลิงก์")}
              {inp("ig", "Instagram", "@")}
              {inp("note", "อยากเรียนอะไร / วันเวลาที่สะดวก", "เช่น ทำเพลง เสาร์บ่าย")}
              {state === "missing" && <div className="text-xs" style={{ color: "#B42318" }}>กรอกชื่อเล่นและเบอร์โทรด้วยนะครับ</div>}
              {state === "error" && <div className="text-xs" style={{ color: "#B42318" }}>ส่งไม่สำเร็จ ลองใหม่อีกครั้ง หรือทักไลน์โรงเรียนได้เลยครับ</div>}
              <button onClick={submit} disabled={state === "sending"} className="mt-1 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60" style={{ background: BLUE }}>
                {state === "sending" ? "กำลังส่ง…" : "ส่งข้อมูล"}
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 text-center text-xs text-white/70">Today What Todo · Sound With Today</div>
      </div>
    </div>
  );
}

function AdminApp() {
  const [ok, setOk] = useState(() => !PIN || sessionStorage.getItem("twt-ok") === "1");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [initial, setInitial] = useState(undefined); // undefined = กำลังโหลด, null = ยังไม่มีข้อมูลบนคลาวด์
  const [loadErr, setLoadErr] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ok) return;
    setFailed(false);
    loadState().then((st) => setInitial(st)).catch((e) => { console.error(e); setLoadErr(String(e.message || e)); setFailed(true); });
  }, [ok]);

  if (!ok) return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ ...font, background: BLUE }}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center" style={{ color: INK }}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: BLUE_SOFT, color: BLUE }}><Lock size={22} /></div>
        <div className="text-lg font-bold">Today What Todo</div>
        <div className="mb-4 text-sm text-slate-500">ใส่รหัสเพื่อเข้าหลังบ้าน</div>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => { setPin(e.target.value); setErr(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { if (pin === PIN) { sessionStorage.setItem("twt-ok", "1"); setOk(true); } else setErr(true); } }}
          className="w-full rounded-xl px-3 py-2 text-center text-lg tracking-widest" style={{ border: `2px solid ${err ? "#B42318" : "var(--line)"}` }} autoFocus />
        <button onClick={() => { if (pin === PIN) { sessionStorage.setItem("twt-ok", "1"); setOk(true); } else setErr(true); }}
          className="mt-3 w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: BLUE }}>เข้าใช้งาน</button>
        {err && <div className="mt-2 text-xs" style={{ color: "#B42318" }}>รหัสไม่ถูกต้อง</div>}
      </div>
    </div>
  );

  if (failed) return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ ...font, background: "var(--bg)", color: INK }}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center" style={{ border: "1px solid var(--line)" }}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#FDE8E8", color: "#B42318" }}><CloudOff size={22} /></div>
        <div className="text-base font-bold" style={{ color: "#B42318" }}>โหลดข้อมูลไม่สำเร็จ</div>
        <div className="mb-1 mt-1 text-sm text-slate-500">อาจเป็นเพราะเน็ตสะดุด — ยังไม่ได้เปิดข้อมูล จึงไม่มีการทับของจริง</div>
        <div className="mb-4 text-xs text-slate-400 break-all">{loadErr}</div>
        <button onClick={() => { setFailed(false); setInitial(undefined); loadState().then((st) => setInitial(st)).catch((e) => { console.error(e); setLoadErr(String(e.message || e)); setFailed(true); }); }}
          className="w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: BLUE }}>ลองโหลดใหม่</button>
      </div>
    </div>
  );

  if (initial === undefined) return (
    <div className="flex min-h-screen items-center justify-center" style={{ ...font, background: "var(--bg)", color: INK }}>
      <div className="text-sm text-slate-500">กำลังโหลดข้อมูล…</div>
    </div>
  );

  return <Dashboard initial={initial} loadErr={loadErr} />;
}

function Dashboard({ initial, loadErr }) {
  const [tab, setTab] = useState("schedule");
  const [rawStudents, setStudents] = useState(initial?.students || INITIAL_STUDENTS);
  const [sessions, setSessions] = useState(initial?.sessions || INITIAL_SESSIONS);
  const [courses, setCourses] = useState(initial?.courses || COURSES);
  const [teachers, setTeachers] = useState(initial?.teachers || TEACHERS);
  const [biz, setBiz] = useState(initial?.biz || { name: "Today What Todo (Sound With Today)", phone: "", address: "", taxId: "", promptpay: "" });
  const [groups, setGroups] = useState(initial?.groups || []);
  const [layout, setLayout] = useState(initial?.layout || { floors: [{ id: "f1", name: "ชั้น 1", rooms: [] }, { id: "f2", name: "ชั้น 2", rooms: [] }, { id: "f3", name: "ชั้น 3", rooms: [] }] });
  const [usage, setUsage] = useState(initial?.usage || []);
  const [receipt, setReceipt] = useState(null); // ใบเสร็จที่กำลังเปิด
  const [payQR, setPayQR] = useState(null); // { student, amount }
  const [dark, setDark] = useState(() => (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"));
  const toggleTheme = () => { const next = dark ? "light" : "dark"; setDark(!dark); applyTheme(next); };
  const [saveStatus, setSaveStatus] = useState(loadErr ? "error" : "saved"); // saved | saving | error
  const firstRun = useRef(true);

  const updateTeacher = (id, patch) => setTeachers((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const addTeacher = (name) => {
    const n = name.trim();
    if (!n) return;
    if (teachers.some((t) => t.id.toLowerCase() === n.toLowerCase())) { say("มีครูชื่อนี้อยู่แล้ว"); return; }
    setTeachers((all) => [...all, { id: n, name: n, status: "Active" }]);
    say(`เพิ่มครู ${n} แล้ว`);
  };
  const removeTeacher = (id) => {
    const used = sessions.some((x) => x.teacher === id);
    if (used) {
      setTeachers((all) => all.map((t) => (t.id === id ? { ...t, status: t.status === "Active" ? "Inactive" : "Active" } : t)));
      say("ครูคนนี้มีประวัติสอนอยู่ ลบไม่ได้ จึงสลับสถานะใช้งาน/พักไว้แทน");
    } else {
      setTeachers((all) => all.filter((t) => t.id !== id));
      say("ลบครูแล้ว");
    }
  };
  const removeStudent = (id) => {
    setSessions((all) => all.filter((x) => x.studentId !== id));
    setStudents((all) => all.filter((x) => x.id !== id));
    setOpen(null);
    say("ลบนักเรียนและคาบเรียนทั้งหมดของเขาแล้ว");
  };
  const addStudent = (f, openAfter = false) => {
    const nums = rawStudents.map((x) => Number(x.id)).filter((n) => !isNaN(n));
    const id = String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0");
    setStudents((all) => [{ id, nick: f.nick || "-", first: f.first || "", last: f.last || "", phone: f.phone || "", line: f.line || "", fb: f.fb || "", ig: f.ig || "", teacher: "", course: "", cls: "", purchases: [] }, ...all]);
    say(`เพิ่มนักเรียน ${f.nick} (#${id}) แล้ว`);
    if (openAfter) { setTab("students"); setOpen(id); }
    return id;
  };
  const certOf = (courseId) => !!courses.find((c) => c.id === courseId)?.cert;
  // นับต่อคอร์ส/ใบเซอร์จากประวัติซื้อ + ตั้งค่าคอร์สปัจจุบัน (เปลี่ยนติ๊กในหลังบ้านแล้วอัปเดตทันที)
  const students = useMemo(() => rawStudents.map((st) => ({
    ...st,
    renewCount: Math.max(0, (st.purchases?.length || 0) - 1),
    certCount: (st.purchases || []).filter((b) => certOf(b.course)).length,
  })), [rawStudents, courses]);

  // เปลี่ยนครูสอนแทนเฉพาะคาบเดียว (จำครูเดิมไว้ใน origTeacher)
  const setSessionTeacher = (sessionId, teacher) => {
    setSessions((all) => all.map((x) => {
      if (x.id !== sessionId) return x;
      const orig = x.origTeacher ?? x.teacher;
      return { ...x, teacher, origTeacher: teacher === orig ? undefined : orig };
    }));
    say(`เปลี่ยนครูสอนคาบนี้เป็น ${teacher}`);
  };
  const setSessionRoom = (sessionId, room) => setSessions((all) => all.map((x) => (x.id === sessionId ? { ...x, room: room || undefined } : x)));
  const roomNameById = useMemo(() => { const m = {}; (layout.floors || []).forEach((f) => f.rooms.forEach((r) => { m[r.id] = r.name; })); return m; }, [layout]);
  const roomLabelOf = (room) => room === "online" ? "ออนไลน์" : (room && roomNameById[room]) ? roomNameById[room] : "";
  const setSessionNote = (sessionId, note) => setSessions((all) => all.map((x) => (x.id === sessionId ? { ...x, note } : x)));
  const setSessionScore = (sessionId, score) => setSessions((all) => all.map((x) => (x.id === sessionId ? { ...x, score } : x)));
  const [conflict, setConflict] = useState(null); // { list, run }
  const [open, setOpen] = useState(null); // student id
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [jumpTo, setJumpTo] = useState(null); // วันที่ให้ตารางกระโดดไป

  const [schedOpen, setSchedOpen] = useState(false);
  const openWithSchedule = (id) => { setSchedOpen(true); setOpen(id); };

  // ตรวจคาบชน: ครูคนเดียวกัน เวลาเดียวกัน แต่คนละคน
  const conflictsFor = (cands, teacher, excludeStudentId) => {
    const res = [];
    cands.forEach((at) => {
      sessions.forEach((sx) => {
        if (sx.studentId === excludeStudentId || sx.teacher !== teacher || sx.done) return;
        if (sx.at.getTime() === at.getTime()) {
          const st = students.find((x) => x.id === sx.studentId);
          res.push({ name: st ? `${st.nick}${st.first ? "-" + st.first : ""}` : sx.studentId, at, course: sx.course });
        }
      });
    });
    return res;
  };

  // จัดคาบเรียนใหม่ให้เด็ก: สร้างคาบสัปดาห์ละครั้งตามจำนวนที่เลือก (เตือนถ้าชนกับคนอื่น)
  const scheduleCourse = (id, { course, teacher, date, time, count }) => {
    const [h, m] = time.split(":").map(Number);
    const start = new Date(date + "T00:00:00");
    const cands = Array.from({ length: count }, (_, i) => { const at = new Date(start); at.setDate(at.getDate() + 7 * i); at.setHours(h, m, 0, 0); return at; });
    const run = () => {
      const already = sessions.filter((x) => x.studentId === id && x.course === course).length;
      const added = cands.map((at, i) => ({ id: "x" + seq++, studentId: id, at, done: false, teacher, course, n: already + i + 1, total: already + count, cls: "เดี่ยว" }));
      setSessions((all) => [...all, ...added]);
      setStudents((all) => all.map((x) => (x.id === id ? { ...x, course, teacher } : x)));
      setSchedOpen(false);
      say(`จัดคาบ ${course} ให้แล้ว ${count} คาบ เริ่ม ${thDate(start)} ${time} น.`);
    };
    const cl = conflictsFor(cands, teacher, id);
    if (cl.length) { setConflict({ list: cl, run: () => { setConflict(null); run(); } }); return; }
    run();
  };

  const showStudentSchedule = (id) => {
    const own = sessions.filter((x) => x.studentId === id).sort((a, b) => a.at - b.at);
    const next = own.find((x) => !x.done && x.at >= today) || own.at(-1);
    setStudentFilter(id); setTeacherFilter("all"); setJumpTo(next ? next.at : today); setTab("schedule"); setOpen(null);
  };
  // รับเด็กสมัครใหม่ + บังคับจัดคาบทันที (จัดคาบไม่ได้ = ยังไม่รับเข้าระบบ)
  const acceptRegistration = (reg, form) => {
    const id = addStudent(reg, false);
    scheduleCourse(id, form);
    setTab("students"); setOpen(id);
    return id;
  };
  const [toast, setToast] = useState("");
  // กติกาส่วนกลาง: ไม่มาเรียนเกิน N เดือน → คาบที่เหลือถูกยกเข้าส่วนกลาง คาบละ 400
  const [rule, setRule] = useState(initial?.rule || { months: 3, perSession: 400 });

  // สำรอง/กู้คืนไฟล์ + สำรองอัตโนมัติวันละครั้ง
  const exportBackup = () => {
    try {
      const payload = JSON.stringify(serialize({ students: rawStudents, sessions, courses, teachers, rule, biz, groups, layout, usage }));
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `today-what-todo-backup-${toInput(new Date())}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      return true;
    } catch (e) { console.error(e); return false; }
  };
  const importBackup = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = revive(JSON.parse(reader.result));
        if (!Array.isArray(parsed.students) || !Array.isArray(parsed.sessions)) throw new Error("โครงสร้างไฟล์ไม่ถูกต้อง");
        if (!window.confirm(`กู้คืนข้อมูล: นักเรียน ${parsed.students.length} คน · คาบ ${parsed.sessions.length} คาบ\nจะทับข้อมูลปัจจุบันทั้งหมด ยืนยันไหม?`)) return;
        setStudents(parsed.students); setSessions(parsed.sessions);
        if (parsed.courses) setCourses(parsed.courses);
        if (parsed.teachers) setTeachers(parsed.teachers);
        if (parsed.rule) setRule(parsed.rule);
        if (parsed.biz) setBiz(parsed.biz);
        if (parsed.groups) setGroups(parsed.groups);
        if (parsed.layout) setLayout(parsed.layout);
        if (parsed.usage) setUsage(parsed.usage);
        say("กู้คืนข้อมูลจากไฟล์แล้ว");
      } catch (e) { say("ไฟล์สำรองไม่ถูกต้อง: " + (e.message || e)); }
    };
    reader.readAsText(file);
  };
  // สำรองอัตโนมัติวันละครั้ง (ดาวน์โหลดไฟล์เก็บไว้ใน Google Drive/เครื่องได้)
  useEffect(() => {
    try {
      const k = "twt-last-backup";
      const t = toInput(new Date());
      if (localStorage.getItem(k) !== t && (rawStudents.length || sessions.length)) {
        if (exportBackup()) localStorage.setItem(k, t);
      }
    } catch (e) { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // นำสถานะที่โหลดมา (จากไฟล์/สแนปช็อต) มาใส่ทั้งชุด
  const applyLoadedState = (parsed) => {
    if (!parsed || !Array.isArray(parsed.students) || !Array.isArray(parsed.sessions)) { say("ข้อมูลกู้คืนไม่ถูกต้อง"); return; }
    setStudents(parsed.students); setSessions(parsed.sessions);
    if (parsed.courses) setCourses(parsed.courses);
    if (parsed.teachers) setTeachers(parsed.teachers);
    if (parsed.rule) setRule(parsed.rule);
    if (parsed.biz) setBiz(parsed.biz);
    if (parsed.groups) setGroups(parsed.groups);
    if (parsed.layout) setLayout(parsed.layout);
    if (parsed.usage) setUsage(parsed.usage);
  };

  // Realtime: เครื่องอื่นแก้แล้วเห็นทันที (กันข้อมูลชนกัน)
  useEffect(() => {
    const unsub = subscribeRealtime(
      (e) => { if (e.type === "delete") setStudents((a) => a.filter((s) => s.id !== e.id)); else setStudents((a) => { const i = a.findIndex((s) => s.id === e.student.id); if (i < 0) return [e.student, ...a]; const n = [...a]; n[i] = e.student; return n; }); },
      (e) => { if (e.type === "delete") setSessions((a) => a.filter((s) => s.id !== e.id)); else setSessions((a) => { const i = a.findIndex((s) => s.id === e.session.id); if (i < 0) return [...a, e.session]; const n = [...a]; n[i] = e.session; return n; }); }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // สำรองบนคลาวด์วันละ 1 ครั้ง (กู้ย้อนหลังได้ในแอป)
  useEffect(() => {
    try {
      const k = "twt-last-snapshot";
      const t = toInput(new Date());
      if (localStorage.getItem(k) !== t && (rawStudents.length || sessions.length)) {
        pushSnapshot({ students: rawStudents, sessions, courses, teachers, rule, biz, groups, layout, usage })
          .then(() => localStorage.setItem(k, t)).catch(() => {});
      }
    } catch (e) { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStudents.length]);

  // เตือนก่อนปิดถ้ายังบันทึกไม่เสร็จ
  useEffect(() => {
    const h = (e) => { if (saveStatus === "saving" || saveStatus === "error") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saveStatus]);

  // บันทึกอัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยน (หน่วง 0.8 วิ)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSaveStatus("saving");
    const t = setTimeout(() => {
      saveState({ students: rawStudents, sessions, courses, teachers, rule, biz, groups, layout, usage })
        .then(() => setSaveStatus("saved"))
        .catch((e) => { console.error(e); setSaveStatus("error"); });
      savePayConfig({ qrUrl: biz.qrImgUrl || "", promptpay: biz.promptpay || "", bankInfo: biz.bankInfo || "" }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [rawStudents, sessions, courses, teachers, rule, biz, groups, layout, usage]);

  const pool = useMemo(() => {
    const m = new Map();
    students.forEach((st) => {
      const own = sessions.filter((x) => x.studentId === st.id);
      const doneList = own.filter((x) => x.done);
      const lastDone = doneList.length ? new Date(Math.max(...doneList.map((x) => x.at))) : null;
      const remaining = own.filter((x) => !x.done);
      const monthsIdle = lastDone ? (today - lastDone) / (1000 * 60 * 60 * 24 * 30.44) : 0;
      const auto = lastDone && monthsIdle >= rule.months && remaining.length > 0;
      const forfeited = !st.exempt && (st.forced || auto) ? remaining : [];
      m.set(st.id, { lastDone, monthsIdle: Math.floor(monthsIdle), remaining: remaining.length, forfeited, auto,
        amount: forfeited.length * rule.perSession });
    });
    return m;
  }, [students, sessions, rule]);
  // เด็กที่ยังไม่มีคาบล่วงหน้า แต่ยังถือว่าเรียนอยู่ (ซื้อคอร์ส/เรียนล่าสุดภายใน 3 เดือน)
  const needSchedule = useMemo(() => {
    const cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffStr = toInput(cutoff);
    return students.filter((st) => {
      if (st.forced || pool.get(st.id)?.forfeited.length > 0) return false; // ยกเข้าส่วนกลางแล้ว = ไม่ต้องจัดคาบ
      const own = sessions.filter((x) => x.studentId === st.id);
      if (own.some((x) => !x.done && x.at >= today)) return false;
      const doneList = own.filter((x) => x.done);
      const lastDone = doneList.length ? new Date(Math.max(...doneList.map((x) => x.at))) : null;
      const recentBuy = st.purchases?.some((b) => b.date >= cutoffStr);
      const recentBuyUnfinished = st.purchases?.some((b) => b.date >= cutoffStr && own.filter((x) => x.course === b.course && x.done).length < (b.total || 0));
      return recentBuyUnfinished || (lastDone && lastDone >= cutoff && own.some((x) => !x.done));
    });
  }, [students, sessions, pool]);

  const forfeitedIds = useMemo(() => new Set([...pool.values()].flatMap((v) => v.forfeited.map((x) => x.id))), [pool]);
  const setFlag = (id, patch) => setStudents((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const say = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const student = students.find((s) => s.id === open);
  const byStudent = (id) => sessions.filter((s) => s.studentId === id).sort((a, b) => a.at - b.at);

  // ส่งข้อความเข้า LINE (ผ่านฟังก์ชันหลังบ้าน /api/notify — เงียบถ้ายังไม่ได้ตั้งค่า)
  const notifyLine = (text) => { try { fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => {}); } catch (e) {} };

  // ปุ่มลา: เลื่อนคาบที่เหลือทั้งหมด (คาบถัดไป + คาบหลังจากนั้น) ไปอีก 7 วัน + จดหมายเหตุการลาได้
  const leave = (id, course, note = "") => {
    const mine = byStudent(id).filter((s) => !s.done && (!course || s.course === course)).sort((a, b) => a.at - b.at);
    if (!mine.length) return;
    const stu = students.find((x) => x.id === id);
    const nx = mine[0];
    notifyLine(`🔔 แจ้งลา — ${stu ? stu.nick + (stu.first ? " " + stu.first : "") : "#" + id} (#${id})\nคอร์ส: ${course || nx.course || "-"}\nคาบเดิม: ${thDate(nx.at)} ${nx.noTime ? "" : thTime(nx.at)}\nเลื่อนคาบที่เหลือ ${mine.length} คาบ ไปอีก 1 สัปดาห์${note ? "\nหมายเหตุ: " + note : ""}`);
    const ids = new Set(mine.map((s) => s.id));
    const firstId = mine[0].id;
    setSessions((all) => all.map((s) => {
      if (!ids.has(s.id)) return s;
      const at = new Date(s.at); at.setDate(at.getDate() + 7);
      return { ...s, at, note: (s.id === firstId && note) ? ("ลา: " + note + (s.note ? " · " + s.note : "")) : s.note };
    }));
    say(`ลาแล้ว เลื่อนคาบที่เหลือ ${mine.length} คาบ ไปอีก 1 สัปดาห์`);
  };

  const changeDate = (sessionId, dateValue, timeValue) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;
    const at = dateValue ? new Date(dateValue + "T00:00:00") : new Date(target.at);
    const [h, m] = (timeValue || `${target.at.getHours()}:${target.at.getMinutes()}`).split(":").map(Number);
    at.setHours(h, m, 0, 0);
    const run = () => { setSessions((all) => all.map((s) => (s.id === sessionId ? { ...s, at, noTime: false } : s))); say("เปลี่ยนวัน/เวลาแล้ว"); };
    const cl = conflictsFor([at], target.teacher, target.studentId);
    if (cl.length) { setConflict({ list: cl, run: () => { setConflict(null); run(); } }); return; }
    run();
  };

  const deleteSession = (sessionId) => { setSessions((all) => all.filter((x) => x.id !== sessionId)); say("ลบคาบแล้ว"); };
  // เลื่อนคาบนี้ไปวัน/เวลาใหม่ แล้วรันคาบที่เหลือ (คอร์สเดียวกัน ยังไม่เรียน) ต่อรายสัปดาห์จากวันนั้น
  const rescheduleFrom = (sessionId, dateValue, timeValue) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;
    const [h, m] = (timeValue || `${target.at.getHours()}:${target.at.getMinutes()}`).split(":").map(Number);
    const start = dateValue ? new Date(dateValue + "T00:00:00") : new Date(target.at);
    start.setHours(h, m, 0, 0);
    const chain = sessions.filter((s) => s.studentId === target.studentId && s.course === target.course && s.cls === target.cls && !s.done && s.at >= target.at).sort((a, b) => a.at - b.at);
    const ids = chain.map((s) => s.id);
    const dates = chain.map((_, i) => { const at = new Date(start); at.setDate(at.getDate() + 7 * i); at.setHours(h, m, 0, 0); return at; });
    const run = () => {
      setSessions((all) => all.map((s) => { const i = ids.indexOf(s.id); return i === -1 ? s : { ...s, at: dates[i], noTime: false }; }));
      say(`เลื่อน ${chain.length} คาบ รันรายสัปดาห์ เริ่ม ${thDate(start)} ${timeValue || thTime(start)}`);
    };
    const cl = conflictsFor(dates, target.teacher, target.studentId);
    if (cl.length) { setConflict({ list: cl, run: () => { setConflict(null); run(); } }); return; }
    run();
  };
  const deleteUnusedPast = () => {
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30);
    const stale = sessions.filter((x) => !x.done && !x.absent && x.at < cutoff);
    if (!stale.length) { say("ไม่มีคาบค้างที่เก่าเกิน 30 วัน"); return; }
    const names = [...new Set(stale.map((x) => { const st = rawStudents.find((s) => s.id === x.studentId); return st ? `${st.nick}` : "#" + x.studentId; }))];
    const preview = names.slice(0, 15).join(", ") + (names.length > 15 ? ` …และอีก ${names.length - 15} คน` : "");
    if (!window.confirm(`จะลบคาบที่เลยกำหนดเกิน 30 วัน และยังไม่ได้ติ๊กว่าเรียน/ขาด รวม ${stale.length} คาบ ของ ${names.length} คน:\n\n${preview}\n\n⚠️ ถ้าเด็กเรียนจบแล้วแต่ไม่ได้ติ๊กว่าเรียน คาบจะถูกลบด้วย — แนะนำติ๊ก "เรียนแล้ว" ให้เรียบร้อยก่อน\n\nยืนยันลบไหม?`)) return;
    if (!window.confirm(`ยืนยันอีกครั้ง — ลบ ${stale.length} คาบถาวร? (กู้คืนได้จากไฟล์สำรองเท่านั้น)`)) return;
    const ids = new Set(stale.map((x) => x.id));
    setSessions((all) => all.filter((x) => !ids.has(x.id)));
    say(`ลบคาบค้างเก่า ${stale.length} คาบแล้ว`);
  };
  const deleteRemaining = (id, course) => {
    const n = sessions.filter((x) => x.studentId === id && x.course === course && !x.done).length;
    setSessions((all) => all.filter((x) => !(x.studentId === id && x.course === course && !x.done)));
    say(`ลบคาบที่ยังไม่เรียนของ ${course} แล้ว ${n} คาบ`);
  };
  const deletePurchase = (id, index) => {
    setStudents((all) => all.map((x) => (x.id === id ? { ...x, purchases: x.purchases.filter((_, i) => i !== index) } : x)));
    say("ลบรายการซื้อคอร์สแล้ว");
  };
  const markDone = (sessionId) =>
    setSessions((all) => all.map((s) => (s.id === sessionId ? { ...s, done: !s.done } : s)));

  // ── คลาสกลุ่ม ──────────────────────────────────────────────
  const createGroup = ({ name, course, teacher, startDate, time, count, costPerSession }) => {
    const id = "g" + (seq++);
    const gname = (name && name.trim()) || `กลุ่ม ${groups.length + 1}`;
    setGroups((all) => [...all, { id, name: gname, course, teacher, startDate, time, count: Number(count) || 0, costPerSession: Number(costPerSession) || 0, members: [] }]);
    say(`สร้างคลาสกลุ่ม "${gname}" แล้ว — เพิ่มนักเรียนเข้ากลุ่มได้เลย`);
    return id;
  };
  const addGroupMember = (groupId, studentId) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g || g.members.includes(studentId)) return;
    const [h, m] = (g.time || "18:00").split(":").map(Number);
    const start = new Date(g.startDate + "T00:00:00"); start.setHours(h, m, 0, 0);
    const added = Array.from({ length: g.count }, (_, i) => { const at = new Date(start); at.setDate(at.getDate() + 7 * i); at.setHours(h, m, 0, 0); return { id: "x" + seq++, studentId, at, done: false, teacher: g.teacher, course: g.course, n: i + 1, total: g.count, cls: g.name, rate: g.costPerSession }; });
    setSessions((all) => [...all, ...added]);
    setGroups((all) => all.map((x) => (x.id === groupId ? { ...x, members: [...x.members, studentId] } : x)));
    setStudents((all) => all.map((x) => (x.id === studentId ? { ...x, course: g.course, teacher: g.teacher } : x)));
    const st = students.find((x) => x.id === studentId);
    say(`เพิ่ม ${st ? st.nick : studentId} เข้ากลุ่ม "${g.name}" (${g.count} คาบ)`);
  };
  const removeGroupMember = (groupId, studentId) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    setSessions((all) => all.filter((x) => !(x.studentId === studentId && x.cls === g.name && !x.done)));
    setGroups((all) => all.map((x) => (x.id === groupId ? { ...x, members: x.members.filter((mid) => mid !== studentId) } : x)));
    say("นำออกจากกลุ่มแล้ว (ลบเฉพาะคาบที่ยังไม่เรียน)");
  };
  const deleteGroup = (groupId) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    if (!window.confirm(`ลบคลาสกลุ่ม "${g.name}"? คาบที่ยังไม่เรียนของสมาชิกจะถูกลบ`)) return;
    setSessions((all) => all.filter((x) => !(x.cls === g.name && !x.done)));
    setGroups((all) => all.filter((x) => x.id !== groupId));
    say(`ลบกลุ่ม "${g.name}" แล้ว`);
  };

  // ต่อคอร์ส: สร้างคาบใหม่ต่อจากคาบสุดท้าย สัปดาห์ละครั้ง
  const renew = (id, courseId, discountPct = 0) => {
    const course = courses.find((c) => c.id === courseId);
    const price = Math.round((course.price || 0) * (1 - discountPct / 100));
    const last = byStudent(id).at(-1);
    const base = last ? last.at : today;
    const added = Array.from({ length: course.sessions }, (_, i) => {
      const at = new Date(base); at.setDate(at.getDate() + 7 * (i + 1));
      const st = students.find((x) => x.id === id);
      return { id: "x" + seq++, studentId: id, at, done: false, teacher: st.teacher, course: courseId, n: i + 1, total: course.sessions };
    });
    setSessions((all) => [...all, ...added]);
    setStudents((all) => all.map((s) => (s.id === id ? {
      ...s, course: courseId,
      purchases: [...(s.purchases || []), { studentId: id, date: toInput(today), course: courseId, price, status: "Confirmed", start: toInput(added[0].at), teacher: s.teacher, total: course.sessions, time: "", discount: discountPct }],
    } : s)));
    say(`ต่อคอร์ส ${course.name} ${discountPct ? `ลด ${discountPct}% ` : ""}= ${baht(price)} เพิ่ม ${course.sessions} คาบแล้ว`);
  };

  return (
    <div className="min-h-screen" style={{ ...font, background: "var(--bg)", color: INK }}>
      <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <header className="px-4 pt-5 pb-4" style={{ background: BLUE }}>
        <div className="mx-auto flex max-w-6xl items-end justify-between">
          <Logo />
          <div className="text-right text-white/80 text-sm">
            <button onClick={toggleTheme} title="สลับธีม" className="mb-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>{dark ? <><Sun size={13} /> สว่าง</> : <><Moon size={13} /> มืด</>}</button>
            <div className="font-semibold text-white">Sound With Today</div>
            <div>สอนทำเพลง · นักเรียนทั้งหมด {students.length} คน</div>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-xs">
              {saveStatus === "error" ? <><CloudOff size={12} /> บันทึกไม่สำเร็จ</> : saveStatus === "saving" ? <><Cloud size={12} /> กำลังบันทึก…</> : <><Cloud size={12} /> {mode === "supabase" ? "บันทึกบนคลาวด์แล้ว" : "บันทึกในเครื่องนี้"}</>}
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="sticky top-0 z-10 px-4" style={{ background: BLUE_DARK }}>
        <div className="mx-auto flex max-w-6xl">
          {[
            ["schedule", CalendarDays, "ตารางสอน"],
            ["students", Users, "นักเรียน"],
            ["rooms", DoorOpen, "ห้องเรียน"],
            ["admin", Wallet, "หลังบ้าน"],
            ["form", Link2, "ลิงก์สมัคร"],
          ].map(([k, Icon, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium text-white/70"
              style={tab === k ? { color: "#fff", boxShadow: "inset 0 -3px 0 #fff" } : {}}>
              <Icon size={18} />{label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-24">
        {tab === "schedule" && (
          <WeekGrid sessions={sessions} students={students} forfeitedIds={forfeitedIds}
            teacherFilter={teacherFilter} setTeacherFilter={setTeacherFilter}
            studentFilter={studentFilter} setStudentFilter={setStudentFilter}
            jumpTo={jumpTo} onPick={setOpen} needSchedule={needSchedule} onSchedule={openWithSchedule} teachers={teachers.filter((t) => t.status === "Active")} roomLabelOf={roomLabelOf} />
        )}

        {tab === "students" && (
          <StudentsTab students={students} sessions={sessions} pool={pool} onPick={setOpen} onAdd={(f, open) => addStudent(f, open)} />
        )}

        {tab === "admin" && <Admin students={students} sessions={sessions} courses={courses} setCourses={setCourses} teachers={teachers} onAddTeacher={addTeacher} onRemoveTeacher={removeTeacher} onUpdateTeacher={updateTeacher} pool={pool} rule={rule} setRule={setRule} onPick={setOpen} say={say} onCleanup={deleteUnusedPast} onBackup={exportBackup} onRestore={importBackup} biz={biz} setBiz={setBiz} groups={groups} onCreateGroup={createGroup} onAddMember={addGroupMember} onRemoveMember={removeGroupMember} onDeleteGroup={deleteGroup} onReceipt={setReceipt} onPayQR={(student, amount) => setPayQR({ student, amount })} onApplyState={applyLoadedState} />}
        {tab === "rooms" && <RoomsTab layout={layout} setLayout={setLayout} usage={usage} setUsage={setUsage} sessions={sessions} students={students} onSetRoom={setSessionRoom} onPick={setOpen} say={say} />}
        {tab === "form" && <FormPreview say={say} courses={courses} teachers={teachers.filter((t) => t.status === "Active")} onAccept={acceptRegistration} />}
      </main>

      {student && (
        <Profile student={student} sessions={byStudent(student.id)} info={pool.get(student.id)} rule={rule} courses={courses} teachers={teachers}
          onRemove={() => removeStudent(student.id)}
          needsSchedule={needSchedule.some((x) => x.id === student.id)} schedOpen={schedOpen} setSchedOpen={setSchedOpen}
          onSchedule={(form) => scheduleCourse(student.id, form)}
          onTeacher={setSessionTeacher} onShowSchedule={() => showStudentSchedule(student.id)}
          onDeleteSession={deleteSession} onDeleteRemaining={(c) => deleteRemaining(student.id, c)} onDeletePurchase={(i) => deletePurchase(student.id, i)}
          onExempt={() => { setFlag(student.id, { exempt: !student.exempt, forced: false }); say(student.exempt ? "กลับมาใช้กติกาส่วนกลางตามปกติ" : "คืนคาบให้แล้ว ไม่หักเข้าส่วนกลาง"); }}
          onForce={() => { setFlag(student.id, { forced: !student.forced, exempt: false }); say(student.forced ? "ยกเลิกการยกเข้าส่วนกลาง" : "ยกคาบที่เหลือเข้าส่วนกลางแล้ว"); }}
          onClose={() => { setOpen(null); setSchedOpen(false); }}
          onLeave={(course, note) => leave(student.id, course, note)} onChangeDate={changeDate} onDone={markDone} onRenew={(c, disc) => renew(student.id, c, disc)}
          onNote={setSessionNote} onScore={setSessionScore} onReschedule={rescheduleFrom} layout={layout} onSetRoom={setSessionRoom} roomLabelOf={roomLabelOf}
          onReceipt={(b) => setReceipt({ kind: "in", no: `RC-${(b.date || toInput(today)).replace(/-/g, "")}-${student.id}`, date: b.date || toInput(today), party: `${student.nick} ${student.first || ""} ${student.last || ""}`.trim(), items: [{ label: `${b.course} (${b.total} คาบ)${b.discount ? ` · ลด ${b.discount}%` : ""}`, amount: b.price || 0 }], total: b.price || 0, note: b.teacher ? `ครูผู้สอน: ${b.teacher}` : "" })}
          biz={biz} onPayQR={(amount) => setPayQR({ student, amount })} />
      )}

      {receipt && <Receipt data={receipt} biz={biz} onClose={() => setReceipt(null)} />}
      {payQR && <PayQR biz={biz} student={payQR.student} defaultAmount={payQR.amount} onClose={() => setPayQR(null)} />}
      {conflict && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setConflict(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4" style={{ color: INK }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-base font-bold" style={{ color: "#B42318" }}>⚠️ คาบชนกับคนอื่น</div>
            <div className="mb-2 text-sm text-slate-600">เวลานี้ครูคนเดียวกันมีคาบอยู่แล้วกับ:</div>
            <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto text-sm">
              {conflict.list.map((c, i) => (
                <li key={i} className="rounded-lg px-2 py-1" style={{ background: "#FDE8E8", color: "#B42318" }}>{c.name} · {thDate(c.at)} {thTime(c.at)}{c.course ? ` · ${c.course}` : ""}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => setConflict(null)} className="flex-1 rounded-lg py-2 text-sm font-semibold" style={{ background: "var(--card)", border: "1px solid var(--line)", color: INK }}>ยกเลิก</button>
              <button onClick={conflict.run} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: "#B42318" }}>ยืนยันจัดต่อ</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg" style={{ background: INK }}>
          {toast}
        </div>
      )}
    </div>
  );
}


// ─── ตารางสอนรายสัปดาห์ ─────────────────────────────────────────
const DAY_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
// สีประจำวันแบบไทย: หัวคอลัมน์ / ตัวหนังสือบนหัว / สีพื้นจางในช่อง
const DAY_COLORS = [
  { head: "#F7C948", text: "#3D2E00", tint: "#FFFBEB" }, // จันทร์ เหลือง
  { head: "#F48FB1", text: "#4A0F2A", tint: "#FFF1F6" }, // อังคาร ชมพู
  { head: "#5CB85C", text: "#0B3A0B", tint: "#EEF9EE" }, // พุธ เขียว
  { head: "#F5923E", text: "#3F1E00", tint: "#FFF4EA" }, // พฤหัส ส้ม
  { head: "#4FB3E8", text: "#032B44", tint: "#EDF7FD" }, // ศุกร์ ฟ้า
  { head: "#9C6ADE", text: "#26074A", tint: "#F4EEFC" }, // เสาร์ ม่วง
  { head: "#E5533D", text: "#3F0A03", tint: "#FDEEEC" }, // อาทิตย์ แดง
];
const mondayOf = (x) => { const m = new Date(x); const wd = (m.getDay() + 6) % 7; m.setDate(m.getDate() - wd); m.setHours(0, 0, 0, 0); return m; };
const toInput = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const slotKey = (x) => `${x.getHours()}:${x.getMinutes() < 30 ? "00" : "30"}`;

function WeekGrid({ sessions, students, forfeitedIds, teacherFilter, setTeacherFilter, studentFilter, setStudentFilter, jumpTo, onPick, needSchedule, onSchedule, teachers, roomLabelOf }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [q, setQ] = useState("");
  useEffect(() => { if (jumpTo) setWeekStart(mondayOf(jumpTo)); }, [jumpTo]);
  const focus = students.find((x) => x.id === studentFilter);
  const focusSessions = useMemo(() => focus ? sessions.filter((x) => x.studentId === focus.id).sort((a, b) => a.at - b.at) : [], [sessions, focus]);
  const byTeacher = useMemo(() => { const m = {}; focusSessions.forEach((x) => { m[x.teacher || "-"] = (m[x.teacher || "-"] || 0) + 1; }); return m; }, [focusSessions]);
  const jumpSession = (dir) => {
    const list = dir > 0 ? focusSessions.filter((x) => x.at >= weekEnd) : [...focusSessions].reverse().filter((x) => x.at < weekStart);
    if (list[0]) setWeekStart(mondayOf(list[0].at));
  };
  const options = students.filter((x) => !q || `${x.id} ${x.nick} ${x.first}`.toLowerCase().includes(q.toLowerCase()));
  const [range, setRange] = useState("full"); // full | evening
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(x.getDate() + i); return x; });
  const weekEnd = new Date(days[6]); weekEnd.setDate(weekEnd.getDate() + 1);

  const startHour = range === "evening" ? 16 : 8;
  const slots = [];
  for (let h = startHour; h <= 22; h++) { slots.push(`${h}:00`); slots.push(`${h}:30`); }

  const cell = useMemo(() => {
    const m = new Map();
    sessions.forEach((s) => {
      if (s.at < weekStart || s.at >= weekEnd) return;
      const st = students.find((x) => x.id === s.studentId);
      if (!st || s.noTime || (teacherFilter !== "all" && (s.teacher || st.teacher) !== teacherFilter)) return;
      if (studentFilter !== "all" && s.studentId !== studentFilter) return;
      const k = `${(s.at.getDay() + 6) % 7}|${slotKey(s.at)}`; // ครูที่ใช้กรองคือครูของคาบนั้น (รวมสอนแทน)
      m.set(k, [...(m.get(k) || []), { ...s, student: st }]);
    });
    return m;
  }, [sessions, students, teacherFilter, studentFilter, weekStart]);

  const shift = (n) => setWeekStart((w) => { const x = new Date(w); x.setDate(x.getDate() + 7 * n); return x; });
  const isToday = (x) => x.toDateString() === today.toDateString();
  const fmt = (x) => x.toLocaleDateString("th-TH", { day: "numeric", month: "short" });

  return (
    <div>
      {needSchedule.length > 0 && (
        <div className="mb-3 rounded-2xl px-3 py-2.5" style={{ background: "#FFF3D6", border: "1px solid #F5D488" }}>
          <div className="text-sm font-semibold" style={{ color: "#7A4B00" }}>ยังไม่ได้จัดคาบเรียน {needSchedule.length} คน — แตะชื่อเพื่อเลือกคอร์ส วัน เวลา</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {needSchedule.map((st) => (
              <button key={st.id} onClick={() => onSchedule(st.id)} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium" style={{ border: "1px solid #F5D488", color: "#7A4B00" }}>
                {st.nick} {st.first} <span className="opacity-60">#{st.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* แถบควบคุม */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-xl bg-white" style={{ border: "1px solid var(--line)" }}>
          <button onClick={() => shift(-1)} className="px-3 py-2 text-sm font-semibold" style={{ color: BLUE }}>‹</button>
          <input type="date" value={toInput(weekStart)} onChange={(e) => e.target.value && setWeekStart(mondayOf(new Date(e.target.value)))}
            className="px-2 py-1.5 text-sm outline-none" style={{ ...font, borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)" }} />
          <button onClick={() => shift(1)} className="px-3 py-2 text-sm font-semibold" style={{ color: BLUE }}>›</button>
        </div>
        <button onClick={() => setWeekStart(mondayOf(today))} className="rounded-xl bg-white px-3 py-2 text-sm font-medium" style={{ border: "1px solid var(--line)", color: BLUE }}>สัปดาห์นี้</button>
        <button onClick={() => { const last = [...sessions].sort((a, b) => b.at - a.at)[0]; if (last) setWeekStart(mondayOf(last.at)); }}
          className="rounded-xl bg-white px-3 py-2 text-sm font-medium" style={{ border: "1px solid var(--line)", color: BLUE }}>คาบล่าสุดในชีต</button>

        <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}
          className="rounded-xl bg-white px-3 py-2 text-sm font-medium" style={{ ...font, border: "1px solid var(--line)" }}>
          <option value="all">ครูทุกคน</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select value={range} onChange={(e) => setRange(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm font-medium" style={{ ...font, background: "#E6F6EA", color: "#1B7A3A", border: "1px solid #BFE6C9" }}>
          <option value="full">เต็มวัน 08:00–22:30</option>
          <option value="evening">ช่วงเย็น 16:00–22:30</option>
        </select>

        <div className="ml-auto text-sm text-slate-500">{fmt(days[0])} – {fmt(days[6])}</div>
      </div>

      {/* ดูตารางรายคน */}
      <div className="mb-3 rounded-2xl bg-white p-3" style={{ border: "1px solid var(--line)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: BLUE }}>ตารางของเด็ก</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อ/รหัส" className="rounded-full px-3 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)", width: 140 }} />
          <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ ...font, border: "1px solid var(--line)", maxWidth: 220 }}>
            <option value="all">ทุกคน (ตารางครู)</option>
            {options.map((x) => <option key={x.id} value={x.id}>{x.nick}-{x.first} #{x.id}</option>)}
          </select>
          {focus && <button onClick={() => { setStudentFilter("all"); setQ(""); }} className="rounded-full px-3 py-1.5 text-sm" style={{ background: "var(--line-soft)", color: INK }}>ล้าง</button>}
        </div>
        {focus && (
          <div className="mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{focus.nick}-{focus.first}</span>
              <span className="text-slate-500">{focusSessions.length} คาบ · เรียนแล้ว {focusSessions.filter((x) => x.done).length}</span>
              {Object.entries(byTeacher).map(([t, n]) => <span key={t} className="rounded-full px-2 py-0.5 text-xs" style={{ background: BLUE_SOFT, color: BLUE }}>{t} {n} คาบ</span>)}
              <span className="ml-auto flex gap-1">
                <button onClick={() => jumpSession(-1)} className="rounded-lg px-2 py-1 text-xs" style={{ background: "var(--line-soft)" }}>‹ คาบก่อน</button>
                <button onClick={() => jumpSession(1)} className="rounded-lg px-2 py-1 text-xs" style={{ background: "var(--line-soft)" }}>คาบถัดไป ›</button>
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {focusSessions.filter((x) => !x.done && x.at >= today).slice(0, 12).map((x) => {
                const di = (x.at.getDay() + 6) % 7;
                return (
                  <button key={x.id} onClick={() => setWeekStart(mondayOf(x.at))} className="shrink-0 rounded-lg px-2 py-1 text-left text-xs" style={{ background: DAY_COLORS[di].tint, borderLeft: `3px solid ${DAY_COLORS[di].head}` }}>
                    <div className="font-semibold">{DAY_TH[di]} {fmt(x.at)}</div>
                    <div className="text-slate-600">{x.noTime ? "" : thTime(x.at)} · {x.teacher || "-"}</div>
                  </button>
                );
              })}
              {focusSessions.filter((x) => !x.done && x.at >= today).length === 0 && <span className="text-xs text-slate-500">ไม่มีคาบล่วงหน้า</span>}
            </div>
          </div>
        )}
      </div>

      {/* ตาราง */}
      <div className="overflow-auto rounded-2xl bg-white" style={{ border: "1px solid var(--line)", maxHeight: "72vh" }}>
        <table className="border-collapse text-sm" style={{ minWidth: 980 }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-16 px-2 py-2 text-left font-semibold" style={{ background: BLUE, color: "#fff" }}>เวลา</th>
              {days.map((x, i) => (
                <th key={i} className="px-2 py-2 text-center font-semibold"
                  style={{ background: DAY_COLORS[i].head, color: DAY_COLORS[i].text, borderLeft: "1px solid rgba(255,255,255,.5)", minWidth: 128, boxShadow: isToday(x) ? `inset 0 -4px 0 ${DAY_COLORS[i].text}` : "none" }}>
                  <div>{DAY_TH[i]}{isToday(x) ? " · วันนี้" : ""}</div>
                  <div className="text-xs font-normal opacity-80">{fmt(x)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => {
              const half = slot.endsWith(":30");
              return (
                <tr key={slot} style={{ borderTop: half ? "1px dashed #E5EBF7" : "1px solid var(--line)" }}>
                  <td className="sticky left-0 z-10 px-2 py-1 font-semibold" style={{ background: "var(--bg)", color: half ? "#94A3B8" : INK, fontSize: 12 }}>
                    {slot.padStart(5, "0")}
                  </td>
                  {days.map((x, di) => {
                    const items = cell.get(`${di}|${slot}`) || [];
                    return (
                      <td key={di} className="px-1 py-0.5 align-top" style={{ borderLeft: "1px solid var(--line-soft)", background: DAY_COLORS[di].tint, height: 34 }}>
                        {items.length === 0 ? <span className="block text-center text-slate-300">-</span> : items.map((s) => (
                          <button key={s.id} onClick={() => onPick(s.studentId)}
                            className="mb-0.5 block w-full rounded-lg px-2 py-1 text-left leading-tight"
                            style={forfeitedIds.has(s.id)
                              ? { background: "#FDE8E8", color: "#B42318", borderLeft: "3px solid #B42318" }
                              : { background: s.done ? "var(--line-soft)" : "#fff", color: s.done ? "#64748B" : INK, borderLeft: `3px solid ${s.done ? "#94A3B8" : DAY_COLORS[di].head}`, boxShadow: "0 1px 0 rgba(0,0,0,.04)" }}>
                            <div className="font-semibold">{s.student.nick}-{s.student.first}{forfeitedIds.has(s.id) ? " · ส่วนกลาง" : ""}{s.origTeacher ? <span className="ml-1 rounded px-1 text-xs font-normal" style={{ background: "#FFF3D6", color: "#7A4B00" }}>แทน</span> : null}</div>
                            <div className="text-xs opacity-80">{s.course || s.student.course}{s.total ? ` (${s.n}/${s.total})` : ""}{teacherFilter === "all" || studentFilter !== "all" ? ` · ${s.teacher || s.student.teacher}` : ""}</div>
                            {roomLabelOf && roomLabelOf(s.room) ? <div className="text-xs font-medium" style={{ color: s.room === "online" ? "#7C3AED" : "#1656D6" }}>{s.room === "online" ? "🌐 " : "📍 "}{roomLabelOf(s.room)}</div> : null}
                          </button>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">แตะชื่อนักเรียนเพื่อดูโปรไฟล์ · ลา · เปลี่ยนวัน · ต่อคอร์ส</p>
    </div>
  );
}

// ─── โปรไฟล์นักเรียน ────────────────────────────────────────────
function Profile({ student, sessions, info, rule, courses, teachers, onRemove, onDeleteSession, onDeleteRemaining, onDeletePurchase, needsSchedule, schedOpen, setSchedOpen, onSchedule, onTeacher, onShowSchedule, onExempt, onForce, onClose, onLeave, onChangeDate, onDone, onRenew, onNote, onScore, onReschedule, onReceipt, layout, onSetRoom, roomLabelOf, biz, onPayQR }) {
  const [renewOpen, setRenewOpen] = useState(false);
  const [disc, setDisc] = useState(0);
  const [pickDate, setPickDate] = useState(null);
  const [cascade, setCascade] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [doneModal, setDoneModal] = useState(null); // { id, note } — บันทึกการสอนตอนเช็กว่าเรียนแล้ว
  const [leaveNote, setLeaveNote] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  // คอร์สทั้งหมดที่เด็กคนนี้มี (เด็กคนเดียวอาจเรียน 2–3 คอร์สพร้อมกัน)
  const courseList = useMemo(() => {
    const seen = [];
    sessions.forEach((x) => { if (x.course && !seen.includes(x.course)) seen.push(x.course); });
    if (student.course && !seen.includes(student.course)) seen.push(student.course);
    return seen;
  }, [sessions, student.course]);
  const defaultCourse = sessions.find((x) => !x.done && x.at >= today)?.course || sessions.at(-1)?.course || courseList[0] || "";
  const [activeCourse, setActiveCourse] = useState(defaultCourse);
  const cur = courseList.includes(activeCourse) ? activeCourse : courseList[0] || "";

  const inCourse = sessions.filter((x) => !cur || x.course === cur);
  const done = inCourse.filter((s) => s.done).length;
  const next = inCourse.find((s) => !s.done);
  const course = courses.find((c) => c.id === cur) || { name: cur || "ยังไม่มีคอร์ส" };
  const TIMES = []; for (let h = 8; h <= 22; h++) { TIMES.push(`${String(h).padStart(2, "0")}:00`); TIMES.push(`${String(h).padStart(2, "0")}:30`); }
  const openPicker = () => {
    if (!next) return;
    setNewDate(toInput(next.at));
    setNewTime(`${String(next.at.getHours()).padStart(2, "0")}:${next.at.getMinutes() < 30 ? "00" : "30"}`);
    setPickDate(next.id);
  };
  const teacher = teachers.find((t) => t.id === student.teacher) || { name: student.teacher || "-" };

  const links = [
    student.phone && { Icon: Phone, label: student.phone, href: "tel:" + student.phone.replace(/-/g, "") },
    student.line && { Icon: MessageCircle, label: "LINE: " + student.line, href: "https://line.me/ti/p/~" + student.line },
    student.fb && { Icon: Facebook, label: student.fb, href: "https://facebook.com/" + student.fb },
    student.ig && { Icon: Instagram, label: "@" + student.ig, href: "https://instagram.com/" + student.ig },
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      {doneModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { e.stopPropagation(); setDoneModal(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" style={{ color: INK }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold">บันทึกการสอน</div>
            <div className="mb-2 text-xs text-slate-500">คาบนี้สอนอะไรไปบ้าง / การบ้านที่สั่ง (ไม่บังคับ)</div>
            <textarea value={doneModal.note} onChange={(e) => setDoneModal({ ...doneModal, note: e.target.value })} rows={3} autoFocus
              placeholder="เช่น สอนเขียนกลอง 8 ห้อง · การบ้าน: ทำ loop มาส่ง"
              className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)" }} />
            <div className="mt-2 flex gap-2">
              <button onClick={() => { onNote(doneModal.id, doneModal.note.trim()); onDone(doneModal.id); setDoneModal(null); }}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>บันทึก · เช็กว่าเรียนแล้ว</button>
              <button onClick={() => { onDone(doneModal.id); setDoneModal(null); }}
                className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>ข้าม</button>
            </div>
            <button onClick={() => setDoneModal(null)} className="mt-2 w-full text-center text-xs text-slate-400">ยกเลิก (ยังไม่เช็กว่าเรียน)</button>
          </div>
        </div>
      )}
      <div className="w-full max-w-md overflow-y-auto rounded-t-2xl bg-white text-sm sm:rounded-2xl" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-3 pb-3 text-white" style={{ background: BLUE }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-extrabold leading-tight">{student.nick} <span className="text-sm font-normal text-white/85">{student.first} {student.last}</span></div>
              <div className="text-xs text-white/75">{teacher.name} · {student.cls || "เดี่ยว"} · {courseList.length} คอร์ส</div>
            </div>
            <button onClick={onClose} className="rounded-full bg-white/15 p-1.5"><X size={16} /></button>
          </div>

          {courseList.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {courseList.map((c) => {
                const own = sessions.filter((x) => x.course === c);
                const dn = own.filter((x) => x.done).length;
                const on = c === cur;
                return (
                  <button key={c} onClick={() => setActiveCourse(c)} className="shrink-0 rounded-lg px-2.5 py-1 text-left text-xs leading-tight"
                    style={on ? { background: "var(--card)", color: BLUE } : { background: "rgba(255,255,255,.15)", color: "#fff" }}>
                    <div className="font-semibold">{c}</div>
                    <div style={{ opacity: .8 }}>เหลือ {own.length - dn}/{own.length}</div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            {[[done, "เรียนแล้ว"], [inCourse.length - done, "เหลือ"], [`${student.certCount}/${CERT_TARGET}`, "คอร์สนับใบเซอร์"]].map(([n, l]) => (
              <div key={l} className="rounded-lg bg-white/15 py-1"><div className="text-base font-bold leading-tight">{n}</div><div className="text-xs text-white/80">{l}</div></div>
            ))}
          </div>
          {info?.forfeited.length > 0 && (
            <div className="mt-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>
              <div className="font-semibold">ไม่มาเรียน {info.monthsIdle} เดือน (ล่าสุด {info.lastDone ? thDate(info.lastDone) : "-"})</div>
              <div>ยก {info.forfeited.length} คาบที่เหลือเข้าส่วนกลาง = {baht(info.amount)}</div>
            </div>
          )}
          {student.certCount >= CERT_TARGET && (
            <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "#FFE8B8", color: "#7A4B00" }}>
              <Award size={16} /> เรียนคอร์สทำเพลง/Mix & Mastering ครบ {CERT_TARGET} คอร์สแล้ว ส่งใบเซอร์ให้น้องได้เลย
            </div>
          )}
          {needsSchedule && (
            <button onClick={() => setSchedOpen(true)} className="mt-2 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "#FFF3D6", color: "#7A4B00" }}>
              <span>ยังไม่มีคาบเรียนล่วงหน้า</span><span className="font-semibold">จัดคาบเลย ›</span>
            </button>
          )}
        </div>

        <div className="px-4 py-3">
          {links.length === 0 && (
            <div className="rounded-xl px-3 py-2.5 text-sm text-slate-500" style={{ background: BLUE_SOFT }}>ยังไม่มีข้อมูลติดต่อ ส่งลิงก์สมัครให้น้องกรอกได้เลย</div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {links.map(({ Icon, label, href }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: BLUE_SOFT, color: BLUE }}>
                <Icon size={14} /> <span className="truncate">{label}</span>
              </a>
            ))}
          </div>

          <button onClick={onShowSchedule} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold" style={{ background: BLUE_SOFT, color: BLUE }}>
            <CalendarDays size={14} /> ดูตารางเรียนของ {student.nick} ทั้งสัปดาห์
          </button>
          {!needsSchedule && !schedOpen && (
            <button onClick={() => setSchedOpen(true)} className="mt-1.5 w-full rounded-lg py-1.5 text-xs" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>+ จัดคาบเรียนเพิ่ม (คอร์สใหม่ / วันเวลาใหม่)</button>
          )}

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button onClick={() => { setLeaveOpen((v) => !v); setPickDate(null); }} disabled={!next} className="rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: leaveOpen ? BLUE_DARK : BLUE }}>ลา</button>
            <button onClick={openPicker} disabled={!next} className="rounded-lg py-2 text-sm font-semibold disabled:opacity-40" style={{ background: "var(--card)", color: BLUE, border: `2px solid ${BLUE}` }}>เปลี่ยนวัน/เวลา</button>
            <button onClick={() => setRenewOpen((v) => !v)} className="rounded-lg py-2 text-sm font-semibold text-white" style={{ background: INK }}>ต่อคอร์ส</button>
          </div>
          {leaveOpen && next && (
            <div className="mt-2 rounded-xl p-3" style={{ background: BLUE_SOFT }}>
              <div className="text-sm font-semibold">ลาคาบ {thDate(next.at)} {next.noTime ? "" : thTime(next.at)}</div>
              <div className="mb-2 text-xs text-slate-500">คาบนี้และคาบที่เหลือทั้งหมดจะเลื่อนไปอีก 1 สัปดาห์อัตโนมัติ</div>
              <input value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} placeholder="หมายเหตุการลา (ไม่บังคับ เช่น ติดสอบ)"
                className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)" }} />
              <div className="mt-2 flex gap-2">
                <button onClick={() => { onLeave(cur, leaveNote.trim()); setLeaveOpen(false); setLeaveNote(""); }} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>ยืนยันลา · เลื่อนทั้งพวง</button>
                <button onClick={() => { setLeaveOpen(false); setLeaveNote(""); }} className="rounded-lg px-4 py-2 text-sm" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>ยกเลิก</button>
              </div>
            </div>
          )}
          {next && <p className="mt-1 text-center text-xs text-slate-500">ถัดไป: {thDate(next.at)} {next.noTime ? "" : thTime(next.at)} · เปลี่ยนวัน = เฉพาะคาบถัดไป · ลา = เลื่อนคาบที่เหลือทั้งหมด</p>}

          {info?.remaining > 0 && (
            <div className="mt-2 flex gap-2">
              {info.forfeited.length > 0 ? (
                <button onClick={onExempt} className="flex-1 rounded-lg py-1.5 text-xs font-medium" style={{ background: "var(--card)", color: "#B42318", border: "1.5px solid #B42318" }}>
                  คืนคาบให้ (ไม่หักส่วนกลาง)
                </button>
              ) : (
                <button onClick={onForce} className="flex-1 rounded-lg py-1.5 text-xs font-medium" style={{ background: "var(--card)", color: "#64748B", border: "1.5px solid #CBD5E1" }}>
                  ยก {info.remaining} คาบเข้าส่วนกลางเลย
                </button>
              )}
              {student.exempt && (
                <button onClick={onExempt} className="rounded-xl px-3 py-2 text-xs" style={{ background: BLUE_SOFT, color: BLUE }}>ยกเลิกยกเว้น</button>
              )}
            </div>
          )}

          {pickDate && (
            <div className="mt-3 rounded-xl p-3" style={{ background: BLUE_SOFT }}>
              <div className="mb-2 text-sm font-semibold">เลื่อนคาบไปวัน / เวลาใหม่</div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)", minWidth: 140 }} />
                <select value={newTime} onChange={(e) => setNewTime(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)" }}>
                  {TIMES.map((t) => <option key={t} value={t}>{t} น.</option>)}
                </select>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} className="h-4 w-4" />
                รันคาบที่เหลือใหม่รายสัปดาห์ นับจากวันนี้ (คาบถัดๆ ไปจะเลื่อนตามอัตโนมัติ)
              </label>
              <div className="mt-2 flex gap-2">
                <button onClick={() => { (cascade ? onReschedule : onChangeDate)(pickDate, newDate, newTime); setPickDate(null); }} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>บันทึก</button>
                <button onClick={() => setPickDate(null)} className="rounded-lg px-4 py-2 text-sm" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>ยกเลิก</button>
              </div>
            </div>
          )}

          {renewOpen && (
            <div className="mt-2 rounded-lg p-2.5" style={{ background: BLUE_SOFT }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1 text-xs font-semibold">
                <span className="mr-1">ส่วนลด</span>
                {[0, 5, 10, 15, 20].map((v) => (
                  <button key={v} onClick={() => setDisc(v)} className="rounded-full px-2 py-0.5 font-medium"
                    style={disc === v ? { background: BLUE, color: "#fff" } : { background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>{v ? `${v}%` : "ไม่ลด"}</button>
                ))}
                <input type="number" min="0" max="100" value={disc} onChange={(e) => setDisc(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-14 rounded-md px-1.5 py-0.5 text-right font-normal" style={{ ...font, border: "1px solid var(--line)" }} /> %
              </div>
              <div className="mb-1 text-xs font-semibold">เลือกคอร์ส</div>
              {courses.map((c) => {
                const p = Math.round((c.price || 0) * (1 - disc / 100));
                return (
                  <button key={c.id} onClick={() => { onRenew(c.id, disc); setRenewOpen(false); }}
                    className="mb-1 flex w-full items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-left text-xs">
                    <span className="font-medium">{c.name}{c.cert ? " ★" : ""}</span>
                    <span className="text-slate-500">{c.sessions} คาบ · {disc ? <><s className="opacity-60">{baht(c.price)}</s> {baht(p)}</> : baht(c.price)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {schedOpen && <SchedulePanel student={student} sessions={sessions} courses={courses} teachers={teachers.filter((t) => t.status === "Active")} onSubmit={onSchedule} onClose={() => setSchedOpen(false)} />}

          {student.purchases?.length > 0 && (
            <>
              <h3 className="mb-1 mt-3 text-xs font-semibold text-slate-600">คอร์สที่ซื้อ ({student.purchases.length} ครั้ง)</h3>
              <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)" }}>
                {student.purchases.map((b, i) => (
                  <div key={i} className="flex items-center px-2.5 py-1 text-xs" style={i ? { borderTop: "1px solid var(--line-soft)" } : {}}>
                    <div className="flex-1"><span className="font-medium">{b.course}</span><span className="text-slate-500"> · {b.date} · {b.teacher} · {b.total} คาบ{b.time ? ` · ${b.time}` : ""}{b.discount ? ` · ลด ${b.discount}%` : ""}</span></div>
                    <div className="font-semibold">{b.price ? baht(b.price) : "-"}</div>
                    <button onClick={() => onPayQR(b.price)} className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: "#E9F9F0", color: "#1E8E5A" }} title="สร้าง QR รับเงิน">QR</button>
                    <button onClick={() => onReceipt(b)} className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: BLUE_SOFT, color: BLUE }} title="ออกใบเสร็จรับเงิน">ใบเสร็จ</button>
                    <button onClick={() => onDeletePurchase(i)} className="ml-1 text-slate-300 hover:text-red-600" title="ลบรายการซื้อนี้"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="mb-1 mt-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-600">ประวัติคาบเรียน · {cur || "ทุกคอร์ส"} ({inCourse.length} คาบ)</h3>
            {inCourse.some((x) => !x.done) && (
              <button onClick={() => { if (window.confirm(`ลบคาบที่ยังไม่เรียนของ ${cur} ทั้งหมด ${inCourse.filter((x) => !x.done).length} คาบ?`)) onDeleteRemaining(cur); }}
                className="text-xs" style={{ color: "#B42318" }}>ลบคาบที่ยังไม่เรียนทั้งหมด</button>
            )}
          </div>
          <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)" }}>
            {inCourse.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 px-2.5 py-1 text-xs" style={i ? { borderTop: "1px solid var(--line-soft)" } : {}}>
                <input type="checkbox" checked={s.done} onChange={() => { if (!s.done) setDoneModal({ id: s.id, note: s.note || "" }); else onDone(s.id); }} className="h-3.5 w-3.5 shrink-0" />
                <span className={"flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 " + (s.done ? "text-slate-400" : "")}>
                  <span className="whitespace-nowrap">{s.n || i + 1}{s.total ? `/${s.total}` : ""} · {thDate(s.at)} {s.noTime ? "" : thTime(s.at)}</span>
                  <span className="flex items-center gap-1 text-xs">
                    <select value={s.teacher || ""} onChange={(e) => onTeacher(s.id, e.target.value)}
                      className="rounded px-1 py-0" style={{ ...font, border: "1px solid var(--line)", background: s.origTeacher ? "#FFF3D6" : "#fff", color: INK }}>
                      <option value="">— ครู —</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {s.origTeacher && <span className="rounded px-1" style={{ background: "#FFF3D6", color: "#7A4B00" }}>สอนแทน {s.origTeacher}</span>}
                    <select value={s.room || ""} onChange={(e) => onSetRoom(s.id, e.target.value)} title="ห้องเรียน"
                      className="rounded px-1 py-0" style={{ ...font, border: "1px solid var(--line)", background: s.room === "online" ? "#F3EEFF" : s.room ? "#EAF0FF" : "#fff", color: INK }}>
                      <option value="">— ห้อง —</option>
                      <option value="online">🌐 ออนไลน์</option>
                      {(layout?.floors || []).map((f) => f.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                  </span>
                  {(s.course || "").includes("เทคโนโลยี")
                    ? <input value={s.score || ""} onChange={(e) => onScore(s.id, e.target.value)} placeholder="Kahoot"
                        className="w-16 shrink-0 rounded px-1 py-0 text-xs" style={{ ...font, border: "1px solid #F5D488", background: "#FFFBEB", color: "#7A4B00" }} />
                    : (s.score && <span className="rounded px-1 text-xs" style={{ background: "#FFF3D6", color: "#7A4B00" }}>{s.score}</span>)}
                  <input value={s.note || ""} onChange={(e) => onNote(s.id, e.target.value)} placeholder="+ หมายเหตุท้ายคาบ"
                    className="mt-0.5 w-full rounded px-1 py-0.5 text-xs" style={{ ...font, border: "1px solid var(--line-soft)", color: INK }} />
                </span>
                {s.absent && <span className="shrink-0 rounded-full px-1.5 py-0 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>ขาด</span>}
                {s === next && <span className="shrink-0 rounded-full px-1.5 py-0 text-xs font-medium text-white" style={{ background: BLUE }}>ถัดไป</span>}
                {!s.done && (
                  <button onClick={() => { setNewDate(toInput(s.at)); setNewTime(`${String(s.at.getHours()).padStart(2, "0")}:${s.at.getMinutes() < 30 ? "00" : "30"}`); setPickDate(s.id); window.scrollTo?.(0, 0); }}
                    className="shrink-0 rounded px-1.5 py-0 text-xs" style={{ background: BLUE_SOFT, color: BLUE }}>เลื่อน</button>
                )}
                {!s.done && <button onClick={() => onDeleteSession(s.id)} className="shrink-0 text-slate-300 hover:text-red-600" title="ลบคาบนี้"><X size={13} /></button>}
              </div>
            ))}
          </div>

          <div className="mt-4 text-right">
            {!confirmDel ? (
              <button onClick={() => setConfirmDel(true)} className="text-xs text-slate-400 underline">ลบนักเรียนคนนี้</button>
            ) : (
              <div className="rounded-lg p-2.5 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>
                ลบ {student.nick}-{student.first} และคาบเรียน {sessions.length} คาบทั้งหมด? ย้อนกลับไม่ได้
                <div className="mt-1.5 flex justify-end gap-2">
                  <button onClick={() => setConfirmDel(false)} className="rounded-md bg-white px-3 py-1" style={{ border: "1px solid var(--line)", color: INK }}>ยกเลิก</button>
                  <button onClick={onRemove} className="rounded-md px-3 py-1 font-semibold text-white" style={{ background: "#B42318" }}>ลบเลย</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// ─── จัดคาบเรียนใหม่ ──────────────────────────────────────────────
function SchedulePanel({ student, sessions, courses, teachers, onSubmit, onClose }) {
  const lastBuy = student.purchases?.at(-1);
  const lastSess = [...sessions].sort((a, b) => a.at - b.at).at(-1);
  const guessCourse = lastBuy?.course || student.course || courses[0]?.id || "";
  const [course, setCourse] = useState(guessCourse);
  const [teacher, setTeacher] = useState(lastBuy?.teacher || student.teacher || teachers[0]?.id || "");
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + ((7 - nextWeek.getDay() + (lastSess ? lastSess.at.getDay() : nextWeek.getDay())) % 7 || 7));
  const [date, setDate] = useState(toInput(lastSess && lastSess.at >= today ? lastSess.at : nextWeek));
  const [time, setTime] = useState(lastBuy?.time || (lastSess && !lastSess.noTime ? `${String(lastSess.at.getHours()).padStart(2, "0")}:${lastSess.at.getMinutes() < 30 ? "00" : "30"}` : "18:00"));
  const cInfo = courses.find((c) => c.id === course);
  const logged = sessions.filter((x) => x.course === course).length;
  const bought = student.purchases?.filter((b) => b.course === course).reduce((a, b) => a + (b.total || 0), 0) || 0;
  const suggested = Math.max(1, bought - logged || cInfo?.sessions || 4);
  const [count, setCount] = useState(suggested);
  useEffect(() => { setCount(suggested); }, [course]);
  const TIMES = []; for (let h = 8; h <= 22; h++) { TIMES.push(`${String(h).padStart(2, "0")}:00`); TIMES.push(`${String(h).padStart(2, "0")}:30`); }
  const sel = { ...font, border: "1px solid var(--line)" };
  return (
    <div className="mt-2 rounded-lg p-2.5" style={{ background: "#FFF3D6", border: "1px solid #F5D488" }}>
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold" style={{ color: "#7A4B00" }}>
        <span>จัดคาบเรียนให้ {student.nick}</span>
        <button onClick={onClose} className="opacity-60"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <label className="col-span-2">คอร์ส
          <select value={course} onChange={(e) => setCourse(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.cert ? " ★" : ""}</option>)}
          </select>
        </label>
        <label>ครู
          <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>จำนวนคาบ
          <input type="number" min="1" max="30" value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel} />
        </label>
        <label>เริ่มวันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel} />
        </label>
        <label>เวลา
          <select value={time} onChange={(e) => setTime(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel}>
            {TIMES.map((t) => <option key={t} value={t}>{t} น.</option>)}
          </select>
        </label>
      </div>
      <div className="mt-1.5 text-xs" style={{ color: "#7A4B00" }}>
        {bought > 0 ? `ซื้อคอร์สนี้ไว้ ${bought} คาบ ลงตารางแล้ว ${logged} คาบ` : "ยังไม่มีประวัติซื้อคอร์สนี้"} · จะสร้าง {count} คาบ สัปดาห์ละครั้ง วัน{DAY_TH[(new Date(date + "T00:00:00").getDay() + 6) % 7] || ""} เวลา {time}
        {cInfo?.cert && " · ★ นับใบเซอร์"}
      </div>
      <button onClick={() => date && onSubmit({ course, teacher, date, time, count })} className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>บันทึกลงตาราง</button>
    </div>
  );
}

// ─── หลังบ้าน ────────────────────────────────────────────────────
function Admin({ students, sessions, courses, setCourses, teachers, onAddTeacher, onRemoveTeacher, onUpdateTeacher, pool, rule, setRule, onPick, say, onCleanup, onBackup, onRestore, biz, setBiz, groups, onCreateGroup, onAddMember, onRemoveMember, onDeleteGroup, onReceipt, onPayQR, onApplyState, periodLabelStr }) {
  const rateOf = (course) => courses.find((c) => c.id === course)?.rate ?? 400;
  const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  // รอบบิลปิดวันที่ 25 ของทุกเดือน: งวดถูกตั้งชื่อตามเดือนที่ปิดบิล
  // เช่น งวด "ก.ย." = 25 ส.ค. ถึง 24 ก.ย. (ปิด 25 ก.ย.) · cm เก็บเป็นเดือน 0–11
  const CLOSE_DAY = 25;
  const periodOf = (x) => {
    let cm = x.getMonth(), cy = x.getFullYear();
    if (x.getDate() >= CLOSE_DAY) { cm += 1; if (cm > 11) { cm = 0; cy += 1; } }
    return `${cy}-${String(cm).padStart(2, "0")}`;
  };
  const periodRange = (key) => {
    const [cy, cm] = key.split("-").map(Number);
    return { start: new Date(cy, cm - 1, CLOSE_DAY), end: new Date(cy, cm, CLOSE_DAY) };
  };
  const periodLabel = (key) => { const [cy, cm] = key.split("-").map(Number); return `${TH_MONTH[cm]} ${cy + 543}`; };
  const dmy = (x) => `${x.getDate()} ${TH_MONTH[x.getMonth()]}`;

  const allBuys = students.flatMap((st) => (st.purchases || []).map((b) => ({ ...b, studentId: st.id })));
  const periods = [...new Set([...sessions.map((s) => periodOf(s.at)), ...allBuys.filter((b) => b.date).map((b) => periodOf(new Date(b.date + "T00:00:00")))])].sort().reverse();
  const [ym, setYm] = useState(periodOf(today));
  const { start: pStart, end: pEnd } = periodRange(ym);
  const inMonth = sessions.filter((s) => s.done && s.at >= pStart && s.at < pEnd);

  // แยกครู → คอร์ส → จำนวนคาบ × ค่าสอน
  const rOf = (s) => (s.rate != null && s.rate !== "" ? Number(s.rate) : rateOf(s.course));
  const payroll = teachers.map((t) => {
    const mine = inMonth.filter((s) => s.teacher === t.id);
    const byCourse = {};
    mine.forEach((s) => {
      const k = (s.course || "(ไม่ระบุคอร์ส)") + (s.cls && s.cls.startsWith("กลุ่ม") ? ` · ${s.cls}` : "");
      if (!byCourse[k]) byCourse[k] = { count: 0, rate: rOf(s), pay: 0, items: [] };
      byCourse[k].count += 1; byCourse[k].pay += rOf(s); byCourse[k].items.push(s);
    });
    return { ...t, taught: mine.length, pay: mine.reduce((a, s) => a + rOf(s), 0), byCourse: Object.entries(byCourse).sort((a, b) => b[1].pay - a[1].pay) };
  }).filter((t) => t.taught > 0 || t.status === "Active");

  const buys = allBuys.filter((b) => { if (!b.date) return false; const d = new Date(b.date + "T00:00:00"); return d >= pStart && d < pEnd && b.status === "Confirmed"; });
  const revenue = buys.reduce((a, b) => a + (b.price || 0), 0);
  const courseCost = buys.reduce((a, b) => a + (courses.find((c) => c.id === b.course)?.cost || 0), 0);
  const salary = payroll.reduce((a, t) => a + t.pay, 0);
  const profit = revenue - courseCost - salary;

  const editCourse = (id, patch) => setCourses((all) => all.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCourse = () => {
    const id = "new-" + Date.now();
    setCourses((all) => [...all, { id, name: "คอร์สใหม่", sessions: 4, price: 0, cost: 0, rate: 400, cert: false, discount: 0 }]);
    say("เพิ่มคอร์สแล้ว แก้ชื่อและราคาได้เลย");
  };
  const removeCourse = (id) => {
    if (sessions.some((x) => x.course === id) || students.some((st) => (st.purchases || []).some((b) => b.course === id))) { say("คอร์สนี้มีประวัติการเรียนอยู่ ลบไม่ได้"); return; }
    setCourses((all) => all.filter((c) => c.id !== id));
  };

  const lost = students.map((st) => ({ st, ...pool.get(st.id) })).filter((x) => x.forfeited.length > 0);
  const poolTotal = lost.reduce((a, x) => a + x.amount, 0);
  const [openRow, setOpenRow] = useState(null); // `${teacherId}|${course}`
  const nameOf = (id) => { const st = students.find((x) => x.id === id); return st ? `${st.nick}${st.first ? "-" + st.first : ""}` : id; };

  const [view, setView] = useState("main");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="inline-flex overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)" }}>
        <button onClick={() => setView("main")} className="px-3 py-1.5 text-sm font-semibold" style={view === "main" ? { background: BLUE, color: "#fff" } : { background: "var(--card)", color: INK }}>ภาพรวม / การเงิน</button>
        <button onClick={() => setView("settings")} className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold" style={view === "settings" ? { background: BLUE, color: "#fff" } : { background: "var(--card)", color: INK }}><Settings size={15} /> ตั้งค่า</button>
      </div>
      {view === "main" && (<>
      <section className="rounded-2xl p-5 text-white" style={{ background: BLUE }}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">งวดปิดบิล
          <select value={ym.split("-")[1]} onChange={(e) => setYm(`${ym.split("-")[0]}-${e.target.value}`)} className="rounded-lg px-2 py-1 text-sm" style={{ ...font, background: "rgba(255,255,255,.15)", color: "#fff" }}>
            {TH_MONTH.map((m, i) => <option key={i} value={String(i).padStart(2, "0")} style={{ color: INK }}>{m}</option>)}
          </select>
          <select value={ym.split("-")[0]} onChange={(e) => setYm(`${e.target.value}-${ym.split("-")[1]}`)} className="rounded-lg px-2 py-1 text-sm" style={{ ...font, background: "rgba(255,255,255,.15)", color: "#fff" }}>
            {[...new Set([...periods.map((pp) => pp.split("-")[0]), String(today.getFullYear())])].sort().reverse().map((y) => <option key={y} value={y} style={{ color: INK }}>{Number(y) + 543}</option>)}
          </select>
        </div>
        <div className="mt-0.5 text-xs text-white/70">{dmy(pStart)} – {dmy(new Date(pEnd.getTime() - 86400000))} (ปิดบิลวันที่ 25) · สอน {inMonth.length} คาบ · ขายคอร์ส {buys.length} รายการ</div>
        <div className="mt-1 text-3xl font-extrabold">{baht(profit)}</div>
        <div className="text-sm text-white/80">รายได้คอร์ส − ต้นทุนคอร์ส − ค่าสอนครู</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          {[[revenue, "รายได้คอร์สที่ขาย"], [courseCost, "ต้นทุนคอร์ส"], [salary, "ค่าสอนครู"]].map(([n, l]) => (
            <div key={l} className="rounded-xl bg-white/15 py-2"><div className="font-bold">{baht(n)}</div><div className="text-xs text-white/80">{l}</div></div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: BLUE }}>เงินเดือนครูงวดนี้ · {periodLabel(ym)}</h2>
          <span className="text-xs text-slate-500">รวม {baht(salary)}</span>
        </div>
        <div className="space-y-2.5">
          {payroll.filter((t) => t.taught > 0).map((t) => (
            <div key={t.id} className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid var(--line)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: BLUE_SOFT }}>
                <div className="flex-1 font-semibold" style={{ color: INK }}>{t.name}</div>
                <button onClick={() => onReceipt({ kind: "out", no: `PV-${ym.replace("-", "")}-${t.id}`, date: toInput(today), party: t.name, items: t.byCourse.map(([course, info]) => ({ label: `${course} (${info.count} คาบ × ${baht(info.rate)})`, amount: info.pay })), total: t.pay, note: `ค่าสอนงวด ${periodLabel(ym)}` })} className="rounded-md px-2 py-1 text-xs font-medium" style={{ background: "var(--card)", color: BLUE, border: `1px solid ${BLUE}` }}>ใบจ่าย</button>
                <div className="text-right"><div className="text-xs text-slate-500">{t.taught} คาบ</div><div className="font-bold" style={{ color: BLUE }}>{baht(t.pay)}</div></div>
              </div>
              {t.byCourse.map(([course, info]) => {
                const key = `${t.id}|${course}`;
                const open = openRow === key;
                return (
                  <div key={course} style={{ borderTop: "1px solid var(--line-soft)" }}>
                    <button onClick={() => setOpenRow(open ? null : key)} className="flex w-full items-center px-4 py-2 text-left text-sm">
                      <ChevronRight size={14} className="mr-1 shrink-0 text-slate-400" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                      <div className="flex-1"><span className="font-medium">{course}</span></div>
                      <div className="w-28 text-right text-xs text-slate-500">{info.count} × {baht(info.rate)}</div>
                      <div className="w-20 text-right font-semibold">{baht(info.pay)}</div>
                    </button>
                    {open && (
                      <div className="px-4 pb-2" style={{ background: "#FAFBFF" }}>
                        {info.items.slice().sort((a, b) => a.at - b.at).map((s, k) => (
                          <button key={s.id} onClick={() => onPick(s.studentId)} className="flex w-full items-center gap-2 py-1 text-left text-xs" style={k ? { borderTop: "1px solid var(--line-soft)" } : {}}>
                            <span className="w-24 shrink-0 text-slate-500">{thDate(s.at)}</span>
                            <span className="w-12 shrink-0 text-slate-500">{s.noTime ? "" : thTime(s.at)}</span>
                            <span className="flex-1 font-medium" style={{ color: INK }}>{nameOf(s.studentId)}</span>
                            {s.origTeacher && <span className="rounded px-1" style={{ background: "#FFF3D6", color: "#7A4B00" }}>สอนแทน</span>}
                            <span className="text-slate-400">{baht(info.rate)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {payroll.filter((t) => t.taught > 0).length === 0 && (
            <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-500" style={{ border: "1px solid var(--line)" }}>งวดนี้ยังไม่มีคาบที่สอนเสร็จ</div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{ background: INK }}>
          <span>รวมค่าสอนทั้งหมดงวดนี้</span><span>{baht(salary)}</span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">นับเฉพาะคาบที่ติ๊กว่าเรียนแล้ว (Present) ในช่วง {dmy(pStart)}–{dmy(new Date(pEnd.getTime() - 86400000))} · คาบที่ครูสอนแทนจะนับให้ครูที่สอนจริง · แก้ค่าสอนต่อคาบได้ที่ตารางคอร์สด้านล่าง</p>
      </section>

      <GroupClasses groups={groups} students={students} teachers={teachers.filter((t) => t.status === "Active")} courses={courses} onCreate={onCreateGroup} onAddMember={onAddMember} onRemoveMember={onRemoveMember} onDelete={onDeleteGroup} onPick={onPick} />

      <PaymentsPanel biz={biz} students={students} say={say} onPayQR={onPayQR} />

      </>)}

      {view === "settings" && (<>
      <SnapshotRestore onApplyState={onApplyState} say={say} />

      <TeacherEditor teachers={teachers} sessions={sessions} onAdd={onAddTeacher} onRemove={onRemoveTeacher} onUpdate={onUpdateTeacher} />

      <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
        <div className="mb-1 text-sm font-semibold" style={{ color: BLUE }}>ข้อมูลธุรกิจ (สำหรับใบเสร็จ)</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[["name", "ชื่อร้าน/โรงเรียน"], ["phone", "เบอร์โทร"], ["address", "ที่อยู่"], ["taxId", "เลขผู้เสียภาษี"], ["promptpay", "พร้อมเพย์"]].map(([k, label]) => (
            <label key={k} className="block text-xs text-slate-500">{label}
              <input value={biz[k] || ""} onChange={(e) => setBiz({ ...biz, [k]: e.target.value })} className="mt-0.5 w-full rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)" }} />
            </label>
          ))}
        </div>
        <label className="mt-2 block text-xs text-slate-500">บัญชีธนาคาร (จะโชว์ในหน้าจ่ายเงิน /pay ให้เด็กโอน) — พิมพ์หลายบรรทัดได้
          <textarea value={biz.bankInfo || ""} onChange={(e) => setBiz({ ...biz, bankInfo: e.target.value })} rows={2} placeholder="เช่น กรุงไทย 123-4-56789-0 ชื่อบัญชี ชาวด์ วิธ ทูเดย์" className="mt-0.5 w-full rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)" }} />
        </label>
        <p className="mt-1.5 text-xs text-slate-500">ข้อมูลนี้จะขึ้นหัวใบเสร็จรับเงิน/ใบจ่ายเงิน</p>
        <div className="mt-3">
          <div className="text-xs text-slate-500">QR รับเงิน — อัปโหลดรูป QR พร้อมเพย์/ธนาคารของร้าน (ถ้าอัป จะใช้รูปนี้แทนการสร้าง QR อัตโนมัติ)</div>
          <div className="mt-1 flex items-center gap-3">
            {biz.qrImgUrl ? <img src={biz.qrImgUrl} alt="qr" className="h-20 w-20 rounded-lg object-contain" style={{ border: "1px solid var(--line)" }} /> : <div className="flex h-20 w-20 items-center justify-center rounded-lg text-center text-xs text-slate-400" style={{ border: "1px dashed var(--line)" }}>ยังไม่มีรูป</div>}
            <div className="flex flex-col gap-1.5">
              <label className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: BLUE_SOFT, color: BLUE }}>
                {biz.qrImgUrl ? "เปลี่ยนรูป QR" : "อัปโหลดรูป QR"}
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const up = await uploadSlip(f); setBiz({ ...biz, qrImgUrl: up.url }); say("อัปโหลดรูป QR แล้ว"); } catch (err) { say("อัปโหลดไม่สำเร็จ: " + (err.message || err)); } e.target.value = ""; }} />
              </label>
              {biz.qrImgUrl && <button onClick={() => setBiz({ ...biz, qrImgUrl: "" })} className="rounded-lg px-3 py-1.5 text-sm" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบรูป QR</button>}
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-400">* ต้องรัน SQL ที่เก็บรูป (bucket slips) ก่อน ถึงจะอัปโหลดได้</div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
        <div className="mb-1 text-sm font-semibold" style={{ color: BLUE }}>ข้อมูลและการสำรอง</div>
        <p className="mb-2 text-xs text-slate-500">ระบบจะดาวน์โหลดไฟล์สำรองให้อัตโนมัติวันละ 1 ครั้งตอนเปิดหน้าแรกของวัน เก็บไฟล์ไว้ใน Google Drive/เครื่องได้เลย</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={onBackup} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>ดาวน์โหลดไฟล์สำรองตอนนี้</button>
          <label className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "var(--card)", color: BLUE, border: `1px solid ${BLUE}` }}>
            กู้คืนจากไฟล์
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onRestore(f); e.target.value = ""; }} />
          </label>
          <button onClick={onCleanup} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบคาบค้างเก่า (เลยกำหนด ยังไม่เช็ค)</button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">ส่วนกลาง (คาบที่เด็กหายไปแล้วไม่ได้ใช้)</div>
            <div className="text-2xl font-extrabold" style={{ color: "#B42318" }}>{baht(poolTotal)}</div>
            <div className="text-xs text-slate-500">{lost.reduce((a, x) => a + x.forfeited.length, 0)} คาบ จาก {lost.length} คน</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <label className="block">ไม่มาเกิน
              <input type="number" min="1" value={rule.months} onChange={(e) => setRule({ ...rule, months: Number(e.target.value) || 1 })}
                className="mx-1 w-12 rounded border px-1 py-0.5 text-center text-sm" style={font} /> เดือน
            </label>
            <label className="mt-1 block">คาบละ
              <input type="number" min="0" step="50" value={rule.perSession} onChange={(e) => setRule({ ...rule, perSession: Number(e.target.value) || 0 })}
                className="mx-1 w-16 rounded border px-1 py-0.5 text-center text-sm" style={font} /> บาท
            </label>
          </div>
        </div>
        {lost.length > 0 && (
          <div className="mt-3 max-h-72 overflow-auto rounded-xl" style={{ border: "1px solid var(--line-soft)" }}>
            {lost.map((x, i) => (
              <button key={x.st.id} onClick={() => onPick(x.st.id)} className="flex w-full items-center px-3 py-2 text-left text-sm" style={i ? { borderTop: "1px solid var(--line-soft)" } : {}}>
                <div className="flex-1">
                  <div className="font-medium">{x.st.nick}-{x.st.first} <span className="text-xs text-slate-400">#{x.st.id}</span></div>
                  <div className="text-xs text-slate-500">ล่าสุด {x.lastDone ? thDate(x.lastDone) : "-"} · หาย {x.monthsIdle} เดือน · เหลือ {x.forfeited.length} คาบ{x.st.forced ? " · ยกเอง" : ""}</div>
                </div>
                <div className="font-semibold" style={{ color: "#B42318" }}>{baht(x.amount)}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: BLUE }}>ตั้งค่าคอร์ส — แก้ได้ทุกช่อง</h2>
          <button onClick={addCourse} className="rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: BLUE }}>+ เพิ่มคอร์ส</button>
        </div>
        <div className="overflow-auto rounded-2xl bg-white" style={{ border: "1px solid var(--line)" }}>
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr className="text-left text-xs text-slate-500" style={{ background: "var(--bg)" }}>
                <th className="px-3 py-2">ชื่อคอร์ส</th><th className="px-2 py-2 text-center">ใบเซอร์</th><th className="px-2 py-2">คาบ</th><th className="px-2 py-2">ราคาขาย</th><th className="px-2 py-2">ต้นทุน</th><th className="px-2 py-2">ค่าสอน/คาบ</th><th className="px-2 py-2">กำไร/คอร์ส</th><th></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => {
                const margin = (c.price || 0) - (c.cost || 0) - (c.sessions || 0) * (c.rate || 0);
                const num = (key, w = 80, step = 1) => (
                  <input type="number" step={step} value={c[key] ?? 0} onChange={(e) => editCourse(c.id, { [key]: Number(e.target.value) || 0 })}
                    className="rounded-md px-2 py-1 text-right" style={{ ...font, width: w, border: "1px solid var(--line)" }} />
                );
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                    <td className="px-3 py-1.5">
                      <input value={c.name} onChange={(e) => editCourse(c.id, { name: e.target.value })}
                        className="w-full rounded-md px-2 py-1 font-medium" style={{ ...font, border: "1px solid var(--line)", minWidth: 170 }} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!c.cert} onChange={(e) => editCourse(c.id, { cert: e.target.checked })} className="h-4 w-4" title="นับเป็นคอร์สที่ให้ใบเซอร์" />
                    </td>
                    <td className="px-2 py-1.5">{num("sessions", 56)}</td>
                    <td className="px-2 py-1.5">{num("price", 90, 50)}</td>
                    <td className="px-2 py-1.5">{num("cost", 80, 50)}</td>
                    <td className="px-2 py-1.5">{num("rate", 70, 50)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold" style={{ color: margin >= 0 ? "#1B7A3A" : "#B42318" }}>{baht(margin)}</td>
                    <td className="px-2 py-1.5"><button onClick={() => removeCourse(c.id)} className="text-slate-400 hover:text-red-600" title="ลบ"><X size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">ติ๊ก "ใบเซอร์" = คอร์สนี้นับรวมใน {CERT_TARGET} คอร์สเพื่อออกใบเซอร์ · ส่วนลดเลือกตอนกดต่อคอร์สในโปรไฟล์เด็ก · ต้นทุน = ค่าใช้จ่ายอื่นต่อคอร์ส (เช่น อุปกรณ์ ค่าที่) ไม่รวมค่าสอนครู · กำไร/คอร์ส = ราคาขาย − ต้นทุน − (คาบ × ค่าสอน)</p>
      </section>
      </>)}
    </div>
  );
}


// ─── จัดการครู + ข้อมูลติดต่อ/การเงิน + รับข้อมูลที่ครูกรอกเอง ─────────
function TeacherEditor({ teachers, sessions, onAdd, onRemove, onUpdate }) {
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [regs, setRegs] = useState([]);
  useEffect(() => { loadTeacherRegs().then(setRegs).catch(() => {}); }, []);
  const applyReg = async (r) => {
    const match = teachers.find((t) => t.name.trim().toLowerCase() === (r.name || "").trim().toLowerCase());
    if (!match) { if (!window.confirm(`ยังไม่มีครูชื่อ "${r.name}" ในระบบ — เพิ่มเป็นครูใหม่ก่อนไหม? (กดตกลงเพื่อเพิ่ม)`)) return; onAdd(r.name); }
    const id = match ? match.id : r.name;
    onUpdate(id, { phone: r.phone || "", lineId: r.line_id || "", bank: r.bank || "", acctNo: r.acct_no || "", acctName: r.acct_name || "", promptpay: r.promptpay || "" });
    try { await removeTeacherReg(r.id); } catch (e) {}
    setRegs((all) => all.filter((x) => x.id !== r.id));
  };
  const fld = (t, k, label) => (
    <label className="block text-xs text-slate-500">{label}
      <input value={t[k] || ""} onChange={(e) => onUpdate(t.id, { [k]: e.target.value })} className="mt-0.5 w-full rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)" }} />
    </label>
  );
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: BLUE }}>ครูผู้สอน</h2>
        <div className="flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onAdd(name); setName(""); } }}
            placeholder="ชื่อครูใหม่" className="rounded-full px-3 py-1 text-sm" style={{ ...font, border: "1px solid var(--line)", width: 140 }} />
          <button onClick={() => { onAdd(name); setName(""); }} className="rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: BLUE }}>+ เพิ่มครู</button>
        </div>
      </div>

      {regs.length > 0 && (
        <div className="mb-2 rounded-2xl p-3" style={{ background: "#FFF3D6", border: "1px solid #F5D488" }}>
          <div className="mb-1 text-xs font-semibold" style={{ color: "#7A4B00" }}>ครูกรอกข้อมูลเข้ามาใหม่ ({regs.length})</div>
          {regs.map((r) => (
            <div key={r.id} className="mb-1 flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
              <div className="flex-1"><b>{r.name}</b>{r.phone ? ` · ${r.phone}` : ""}{r.line_id ? ` · LINE ${r.line_id}` : ""}{r.bank ? ` · ${r.bank} ${r.acct_no || ""}` : ""}</div>
              <button onClick={() => applyReg(r)} className="rounded-md px-2 py-1 font-semibold text-white" style={{ background: BLUE }}>อัปเดตให้ครูนี้</button>
              <button onClick={async () => { try { await removeTeacherReg(r.id); } catch (e) {} setRegs((all) => all.filter((x) => x.id !== r.id)); }} className="rounded-md px-2 py-1" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบ</button>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid var(--line)" }}>
        {teachers.map((t, i) => {
          const n = sessions.filter((x) => x.teacher === t.id).length;
          const off = t.status !== "Active";
          const exp = openId === t.id;
          return (
            <div key={t.id} style={i ? { borderTop: "1px solid var(--line-soft)" } : {}}>
              <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <button onClick={() => setOpenId(exp ? null : t.id)} className="flex flex-1 items-center text-left">
                  <ChevronRight size={14} className="mr-1 shrink-0 text-slate-400" style={{ transform: exp ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  <span className={"font-semibold " + (off ? "text-slate-400 line-through" : "")}>{t.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{n ? `${n} คาบ` : "ยังไม่มีคาบ"}{off ? " · พัก" : ""}{t.phone ? " · ☎" : ""}</span>
                </button>
                <button onClick={() => onRemove(t.id)} className="rounded-md px-2.5 py-1 text-xs" style={n ? { background: "var(--line-soft)", color: INK } : { background: "#FDE8E8", color: "#B42318" }}>{n ? (off ? "เปิดใช้งาน" : "พักการสอน") : "ลบ"}</button>
              </div>
              {exp && (
                <div className="grid grid-cols-1 gap-2 px-4 pb-3 sm:grid-cols-2" style={{ background: "#FAFBFF" }}>
                  {fld(t, "phone", "เบอร์โทร")}{fld(t, "lineId", "LINE ID")}
                  {fld(t, "bank", "ธนาคาร")}{fld(t, "acctNo", "เลขบัญชี")}
                  {fld(t, "acctName", "ชื่อบัญชี")}{fld(t, "promptpay", "พร้อมเพย์")}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">แตะชื่อครูเพื่อกรอกเบอร์/LINE/บัญชี · ครูกรอกเองได้ที่ลิงก์ /teacher · ครูที่มีประวัติสอนแล้วลบไม่ได้ กด "พักการสอน" แทน</p>
    </section>
  );
}

// ─── รายชื่อนักเรียน ──────────────────────────────────────────────
function StudentsTab({ students, sessions, pool, onPick, onAdd }) {
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ nick: "", first: "", last: "", phone: "", line: "", fb: "", ig: "" });
  const field = (k, ph) => <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} className="rounded-md px-2 py-1 text-sm" style={{ ...font, border: "1px solid var(--line)" }} />;
  const cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 3);
  const statusOf = (st) => {
    const own = sessions.filter((x) => x.studentId === st.id);
    const done = own.filter((x) => x.done);
    const remaining = own.filter((x) => !x.done);
    const upcoming = remaining.some((x) => x.at >= today);
    const lastDone = done.length ? new Date(Math.max(...done.map((x) => x.at))) : null;
    if (upcoming || (lastDone && lastDone >= cutoff && remaining.length > 0)) return "active";
    if (remaining.length === 0 && own.length > 0) return "finished";
    return "gone";
  };
  const list = students
    .map((st) => ({ st, status: statusOf(st), done: sessions.filter((x) => x.studentId === st.id && x.done).length, total: sessions.filter((x) => x.studentId === st.id).length }))
    .filter((x) => filter === "all" || x.status === filter)
    .filter((x) => !q || `${x.st.id} ${x.st.nick} ${x.st.first} ${x.st.last}`.toLowerCase().includes(q.toLowerCase()));
  const counts = { active: 0, finished: 0, gone: 0 };
  students.forEach((st) => counts[statusOf(st)]++);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[["active", `กำลังเรียน ${counts.active}`], ["finished", `เรียนจบแล้ว ${counts.finished}`], ["gone", `หายไป ${counts.gone}`], ["all", `ทั้งหมด ${students.length}`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className="rounded-full px-3 py-1.5 text-sm font-medium"
            style={filter === k ? { background: BLUE, color: "#fff" } : { background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>{l}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส" className="ml-auto rounded-full px-3 py-1.5 text-sm" style={{ ...font, border: "1px solid var(--line)", minWidth: 160 }} />
        <button onClick={() => setAdding((v) => !v)} className="rounded-full px-3 py-1.5 text-sm font-medium text-white" style={{ background: BLUE }}>+ เพิ่มนักเรียน</button>
      </div>
      {adding && (
        <div className="mb-3 rounded-2xl bg-white p-3" style={{ border: "1px solid var(--line)" }}>
          <div className="mb-2 text-sm font-semibold" style={{ color: BLUE }}>เพิ่มนักเรียนใหม่ (หรือส่งลิงก์สมัครให้กรอกเองก็ได้)</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {field("nick", "ชื่อเล่น *")}{field("first", "ชื่อจริง")}{field("last", "นามสกุล")}{field("phone", "เบอร์โทร")}
            {field("line", "LINE ID")}{field("fb", "Facebook")}{field("ig", "Instagram")}
            <button onClick={() => { if (!f.nick.trim()) return; const id = onAdd(f); setF({ nick: "", first: "", last: "", phone: "", line: "", fb: "", ig: "" }); setAdding(false); setFilter("all"); setQ(id); }}
              className="rounded-md py-1 text-sm font-semibold text-white" style={{ background: BLUE }}>บันทึก</button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid var(--line)" }}>
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">ไม่พบนักเรียน</p>}
        {list.map(({ st: s, status, done, total }, i) => (
          <button key={s.id} onClick={() => onPick(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left" style={i ? { borderTop: "1px solid var(--line-soft)" } : {}}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold" style={{ background: BLUE_SOFT, color: BLUE }}>{s.nick[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{s.nick} <span className="font-normal text-slate-500">{s.first} {s.last}</span></div>
              <div className="truncate text-xs text-slate-500">#{s.id} · {s.teacher || "-"} · {s.course || "-"} · เรียนแล้ว {done}/{total} · ต่อคอร์ส {s.renewCount} · ใบเซอร์ {s.certCount}/{CERT_TARGET}</div>
            </div>
            {pool.get(s.id)?.forfeited.length > 0 && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#FDE8E8", color: "#B42318" }}>ส่วนกลาง {pool.get(s.id).forfeited.length}</span>
            )}
            {status === "finished" && <span className="shrink-0 rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--line-soft)", color: "#64748B" }}>จบแล้ว</span>}
            {s.certCount >= CERT_TARGET && <Award size={18} className="shrink-0" style={{ color: "#D98A00" }} />}
            <ChevronRight size={18} className="shrink-0 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ลิงก์สมัคร + รายการรอรับเข้าระบบ ─────────────────────────────
function FormPreview({ say, courses, teachers, onAccept }) {
  const [copied, setCopied] = useState(false);
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const url = `${window.location.origin}/join`;
  const copy = () => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const refresh = () => { setLoading(true); loadRegistrations().then(setRegs).catch((e) => { console.error(e); say("โหลดรายการสมัครไม่สำเร็จ (ยังไม่ได้รันตาราง registrations?)"); }).finally(() => setLoading(false)); };
  useEffect(() => { refresh(); }, []);
  const [acceptId, setAcceptId] = useState(null);
  const doAccept = async (r, form) => {
    const id = onAccept({ nick: r.nick, first: r.first, last: r.last, phone: r.phone, line: r.line, fb: r.fb, ig: r.ig }, form);
    try { await removeRegistration(r.id); } catch (e) { console.error(e); }
    setRegs((all) => all.filter((x) => x.id !== r.id));
    setAcceptId(null);
    say(`รับ ${r.nick} เข้าระบบ + จัดคาบแล้ว (#${id})`);
  };
  const reject = async (r) => { try { await removeRegistration(r.id); } catch (e) { console.error(e); } setRegs((all) => all.filter((x) => x.id !== r.id)); say("ลบรายการแล้ว"); };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
        <div className="mb-1 text-sm font-semibold">ส่งลิงก์นี้ให้เด็กหลังจ่ายเงิน</div>
        <p className="mb-3 text-xs text-slate-500">เด็กกรอกเอง ไม่ต้องใส่รหัส ข้อมูลจะมารอด้านล่าง กด "รับเข้าระบบ" แล้ว<b>ต้องจัดคอร์ส/วัน/เวลาให้เสร็จในขั้นตอนเดียว</b> (ถ้ายังไม่จัดคาบ จะยังไม่ถูกรับเข้าระบบ)</p>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: BLUE_SOFT, color: BLUE }}>
          <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate underline">{url}</a>
          <button onClick={copy} title="คัดลอก">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        </div>
        <div className="mt-2 flex gap-2">
          <a href={`https://line.me/R/share?text=${encodeURIComponent("ลงทะเบียนเรียนกับ Today What Todo ได้ที่นี่เลยครับ " + url)}`} target="_blank" rel="noreferrer"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-white" style={{ background: "#06C755" }}>แชร์ทาง LINE</a>
          <a href={url} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "var(--card)", color: BLUE, border: `1px solid ${BLUE}` }}>เปิดดูหน้าฟอร์ม</a>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: BLUE }}>รอรับเข้าระบบ ({regs.length})</div>
          <button onClick={refresh} className="rounded-full px-3 py-1 text-xs" style={{ background: "var(--line-soft)", color: INK }}>{loading ? "กำลังโหลด…" : "รีเฟรช"}</button>
        </div>
        {regs.length === 0 && !loading && <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีคนสมัครใหม่</p>}
        <div className="space-y-2">
          {regs.map((r) => (
            <div key={r.id} className="rounded-xl p-3 text-sm" style={{ border: "1px solid var(--line-soft)" }}>
              <div className="font-semibold">{r.nick} <span className="font-normal text-slate-500">{r.first} {r.last}</span></div>
              <div className="text-xs text-slate-500">{[r.phone && `โทร ${r.phone}`, r.line && `LINE ${r.line}`, r.fb && `FB ${r.fb}`, r.ig && `IG ${r.ig}`].filter(Boolean).join(" · ")}</div>
              {r.note && <div className="mt-1 rounded-lg px-2 py-1 text-xs" style={{ background: "#FFF3D6", color: "#7A4B00" }}>{r.note}</div>}
              <div className="mt-2 flex items-center gap-2">
                <span className="mr-auto text-xs text-slate-400">{new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
                <button onClick={() => reject(r)} className="rounded-md px-2.5 py-1 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบ</button>
                <button onClick={() => setAcceptId(acceptId === r.id ? null : r.id)} className="rounded-md px-3 py-1 text-xs font-semibold text-white" style={{ background: acceptId === r.id ? INK : BLUE }}>{acceptId === r.id ? "ปิด" : "รับเข้าระบบ"}</button>
              </div>
              {acceptId === r.id && <RegAcceptForm courses={courses} teachers={teachers} onCancel={() => setAcceptId(null)} onConfirm={(form) => doAccept(r, form)} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ฟอร์มจัดคาบตอนรับเด็กใหม่ (บังคับก่อนรับเข้าระบบ) ──────────────
function RegAcceptForm({ courses, teachers, onConfirm, onCancel }) {
  const [course, setCourse] = useState(courses[0]?.id || "");
  const [teacher, setTeacher] = useState(teachers[0]?.id || "");
  const [date, setDate] = useState(toInput(today));
  const [time, setTime] = useState("18:00");
  const cInfo = courses.find((c) => c.id === course);
  const [count, setCount] = useState(cInfo?.sessions || 4);
  useEffect(() => { const ci = courses.find((c) => c.id === course); setCount(ci?.sessions || 4); }, [course]);
  const TIMES = []; for (let h = 8; h <= 22; h++) { TIMES.push(`${String(h).padStart(2, "0")}:00`); TIMES.push(`${String(h).padStart(2, "0")}:30`); }
  const sel = { ...font, border: "1px solid var(--line)" };
  return (
    <div className="mt-2 rounded-lg p-2.5" style={{ background: "#FFF3D6", border: "1px solid #F5D488" }}>
      <div className="mb-1.5 text-xs font-semibold" style={{ color: "#7A4B00" }}>จัดคาบเรียนให้ก่อนรับเข้าระบบ</div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <label className="col-span-2">คอร์ส
          <select value={course} onChange={(e) => setCourse(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.cert ? " ★" : ""}</option>)}
          </select>
        </label>
        <label>ครู
          <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>จำนวนคาบ
          <input type="number" min="1" max="30" value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel} />
        </label>
        <label>เริ่มวันที่
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel} />
        </label>
        <label>เวลา
          <select value={time} onChange={(e) => setTime(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1" style={sel}>
            {TIMES.map((t) => <option key={t} value={t}>{t} น.</option>)}
          </select>
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => date && course && teacher && onConfirm({ course, teacher, date, time, count })} disabled={!date || !course || !teacher}
          className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: BLUE }}>รับเข้าระบบ + จัดคาบ</button>
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>ยกเลิก</button>
      </div>
    </div>
  );
}

// ─── ใบเสร็จรับเงิน / จ่ายเงิน (พิมพ์ได้) ─────────────────────────
function Receipt({ data, biz, onClose }) {
  const isIn = data.kind === "in";
  const printIt = () => window.print();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 print:bg-white print:p-0" onClick={onClose}>
      <style>{`@media print { body * { visibility: hidden; } #receipt, #receipt * { visibility: visible; } #receipt { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>
      <div className="my-4 w-full max-w-sm rounded-2xl bg-white p-5 text-sm" style={{ ...font, color: INK }} onClick={(e) => e.stopPropagation()}>
        <div id="receipt">
          <div className="flex items-start justify-between border-b pb-2" style={{ borderColor: "#E5E9F2" }}>
            <div>
              <div className="text-base font-extrabold" style={{ color: BLUE }}>{biz.name || "Today What Todo"}</div>
              {biz.address && <div className="text-xs text-slate-500">{biz.address}</div>}
              {biz.phone && <div className="text-xs text-slate-500">โทร {biz.phone}</div>}
              {biz.taxId && <div className="text-xs text-slate-500">เลขผู้เสียภาษี {biz.taxId}</div>}
            </div>
            <div className="rounded-lg px-2 py-1 text-xs font-bold text-white" style={{ background: isIn ? "#1E8E5A" : "#B4700F" }}>{isIn ? "ใบเสร็จรับเงิน" : "ใบสำคัญจ่าย"}</div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>เลขที่ {data.no}</span><span>วันที่ {data.date}</span>
          </div>
          <div className="mt-2 text-sm"><span className="text-slate-500">{isIn ? "รับเงินจาก" : "จ่ายเงินให้"}: </span><span className="font-semibold">{data.party}</span></div>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1">รายการ</th><th className="pb-1 text-right">จำนวนเงิน</th></tr></thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)" }}><td className="py-1 pr-2">{it.label}</td><td className="py-1 text-right">{baht(it.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t font-bold" style={{ borderColor: "#E5E9F2" }}><td className="py-1.5">รวมทั้งสิ้น</td><td className="py-1.5 text-right" style={{ color: BLUE }}>{baht(data.total)}</td></tr></tfoot>
          </table>
          {data.note && <div className="mt-2 text-xs text-slate-500">{data.note}</div>}
          {isIn && biz.promptpay && <div className="mt-1 text-xs text-slate-500">พร้อมเพย์: {biz.promptpay}</div>}
          <div className="mt-6 flex justify-between text-xs text-slate-400">
            <div className="text-center">.............................<br />ผู้รับเงิน</div>
            <div className="text-center">.............................<br />ผู้จ่ายเงิน</div>
          </div>
        </div>
        <div className="no-print mt-4 flex gap-2">
          <button onClick={printIt} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>พิมพ์ / บันทึก PDF</button>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

// ─── หน้าให้ครูกรอกข้อมูลเอง (public /teacher) ────────────────────
function TeacherJoinPage() {
  const [f, setF] = useState({ name: "", phone: "", lineId: "", bank: "", acctNo: "", acctName: "", promptpay: "" });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    if (!f.name.trim()) { setErr("กรุณากรอกชื่อ (ให้ตรงกับชื่อครูในระบบ)"); return; }
    try { await submitTeacherReg(f); setDone(true); } catch (e) { setErr("ส่งไม่สำเร็จ: " + (e.message || e)); }
  };
  const inp = { ...font, border: "1px solid var(--line)" };
  if (done) return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ ...font, background: "var(--bg)", color: INK }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center" style={{ border: "1px solid var(--line)" }}>
        <div className="text-lg font-bold" style={{ color: BLUE }}>ส่งข้อมูลแล้ว ✓</div>
        <div className="mt-1 text-sm text-slate-500">ขอบคุณครับ ทางโรงเรียนจะอัปเดตข้อมูลให้</div>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen p-5" style={{ ...font, background: "var(--bg)", color: INK }}>
      <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;800&display=swap" rel="stylesheet" />
      <div className="mx-auto max-w-sm">
        <div className="mb-3 text-center">
          <div className="text-xl font-extrabold" style={{ color: BLUE }}>ลงทะเบียนข้อมูลครู</div>
          <div className="text-sm text-slate-500">Today What Todo · กรอกชื่อให้ตรงกับที่ใช้สอน</div>
        </div>
        <div className="space-y-2 rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
          {[["name", "ชื่อ (ตามที่ใช้ในระบบ) *"], ["phone", "เบอร์โทร"], ["lineId", "LINE ID"], ["bank", "ธนาคาร"], ["acctNo", "เลขบัญชี"], ["acctName", "ชื่อบัญชี"], ["promptpay", "พร้อมเพย์ (เบอร์/บัตรปชช.)"]].map(([k, label]) => (
            <label key={k} className="block text-xs text-slate-500">{label}
              <input value={f[k]} onChange={set(k)} className="mt-0.5 w-full rounded-lg px-2 py-2 text-sm" style={inp} />
            </label>
          ))}
          {err && <div className="text-xs" style={{ color: "#B42318" }}>{err}</div>}
          <button onClick={submit} className="mt-1 w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: BLUE }}>ส่งข้อมูล</button>
        </div>
      </div>
    </div>
  );
}

// ─── คลาสกลุ่ม (เพิ่ม/ลดคนได้) ────────────────────────────────────
function GroupClasses({ groups, students, teachers, courses, onCreate, onAddMember, onRemoveMember, onDelete, onPick }) {
  const [openForm, setOpenForm] = useState(false);
  const [type, setType] = useState("ติว");
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState(teachers[0]?.id || "");
  const [startDate, setStartDate] = useState(toInput(today));
  const [time, setTime] = useState("18:00");
  const [cost, setCost] = useState(500);
  const [openId, setOpenId] = useState(null);
  const [addSel, setAddSel] = useState("");
  const TIMES = []; for (let h = 8; h <= 22; h++) { TIMES.push(`${String(h).padStart(2, "0")}:00`); TIMES.push(`${String(h).padStart(2, "0")}:30`); }
  const count = type === "ติว" ? 10 : 4;
  const course = type === "ติว" ? "ติวเทคโนโลยี กลุ่ม" : "ทำเพลง";
  const nameOf = (id) => { const st = students.find((x) => x.id === id); return st ? `${st.nick}${st.first ? " " + st.first : ""}` : id; };
  const create = () => {
    if (!teacher || !startDate) return;
    const id = onCreate({ name, course, teacher, startDate, time, count, costPerSession: Number(cost) || 0 });
    setOpenForm(false); setName(""); setOpenId(id);
  };
  const sel = { ...font, border: "1px solid var(--line)" };
  return (
    <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: BLUE }}>คลาสกลุ่ม</h2>
        <button onClick={() => setOpenForm((v) => !v)} className="rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: openForm ? INK : BLUE }}>{openForm ? "ปิด" : "+ สร้างกลุ่ม"}</button>
      </div>

      {openForm && (
        <div className="mb-3 rounded-xl p-3" style={{ background: BLUE_SOFT }}>
          <div className="mb-2 flex gap-1.5">
            {["ติว", "ทำเพลง"].map((tp) => (
              <button key={tp} onClick={() => { setType(tp); setCost(500); }} className="rounded-full px-3 py-1 text-sm font-medium" style={type === tp ? { background: BLUE, color: "#fff" } : { background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>
                {tp === "ติว" ? "ติวเทคโนโลยี (10 คาบ)" : "ทำเพลง (4 คาบ)"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="col-span-2">ชื่อกลุ่ม (เว้นว่างได้)
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`กลุ่ม${type} ...`} className="mt-0.5 w-full rounded-md px-2 py-1.5" style={sel} />
            </label>
            <label>ครู
              <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1.5" style={sel}>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>ต้นทุน/ค่าสอนต่อคาบ
              <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1.5" style={sel} />
            </label>
            <label>เริ่มวันที่
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1.5" style={sel} />
            </label>
            <label>เวลา
              <select value={time} onChange={(e) => setTime(e.target.value)} className="mt-0.5 w-full rounded-md px-2 py-1.5" style={sel}>
                {TIMES.map((t) => <option key={t} value={t}>{t} น.</option>)}
              </select>
            </label>
          </div>
          <div className="mt-1 text-xs text-slate-500">คอร์ส: {course} · {count} คาบ · {baht(Number(cost) || 0)}/คาบ</div>
          <button onClick={create} className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>สร้างกลุ่ม แล้วค่อยเพิ่มนักเรียน</button>
        </div>
      )}

      {groups.length === 0 && !openForm && <div className="py-4 text-center text-sm text-slate-400">ยังไม่มีคลาสกลุ่ม</div>}

      <div className="space-y-2">
        {groups.map((g) => {
          const exp = openId === g.id;
          const notMembers = students.filter((st) => !g.members.includes(st.id));
          return (
            <div key={g.id} className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)" }}>
              <button onClick={() => setOpenId(exp ? null : g.id)} className="flex w-full items-center px-3 py-2 text-left" style={{ background: BLUE_SOFT }}>
                <ChevronRight size={14} className="mr-1 shrink-0 text-slate-400" style={{ transform: exp ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{g.name}</div>
                  <div className="text-xs text-slate-500">{g.course} · {g.teacher} · {g.count} คาบ · {baht(g.costPerSession)}/คาบ · {g.members.length} คน</div>
                </div>
              </button>
              {exp && (
                <div className="px-3 py-2">
                  {g.members.length === 0 && <div className="py-1 text-xs text-slate-400">ยังไม่มีสมาชิก</div>}
                  {g.members.map((mid) => (
                    <div key={mid} className="flex items-center gap-2 py-1 text-sm" style={{ borderBottom: "1px solid var(--line-soft)" }}>
                      <button onClick={() => onPick(mid)} className="flex-1 text-left font-medium" style={{ color: BLUE }}>{nameOf(mid)}</button>
                      <button onClick={() => onRemoveMember(g.id, mid)} className="rounded-md px-2 py-0.5 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>นำออก</button>
                    </div>
                  ))}
                  <div className="mt-2 flex gap-1.5">
                    <select value={addSel} onChange={(e) => setAddSel(e.target.value)} className="flex-1 rounded-md px-2 py-1.5 text-sm" style={sel}>
                      <option value="">+ เลือกนักเรียนเพิ่มเข้ากลุ่ม…</option>
                      {notMembers.map((st) => <option key={st.id} value={st.id}>{st.nick} {st.first} (#{st.id})</option>)}
                    </select>
                    <button onClick={() => { if (addSel) { onAddMember(g.id, addSel); setAddSel(""); } }} className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ background: BLUE }}>เพิ่ม</button>
                  </div>
                  <button onClick={() => onDelete(g.id)} className="mt-2 text-xs" style={{ color: "#B42318" }}>ลบกลุ่มนี้</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">เพิ่ม/ลดคนได้ตลอด · เพิ่มคน = สร้างคาบให้คนนั้นตามวัน-เวลากลุ่ม · นำออก = ลบเฉพาะคาบที่ยังไม่เรียน</p>
    </section>
  );
}

// ─── แท็บห้องเรียน (ผังห้อง + จัดห้องให้คาบจริง) ─────────────────────
const ROOM_PALETTE = ["#1656D6", "#1E8E5A", "#B4700F", "#8A3FFC", "#D5468B", "#0EA5B7", "#E8590C", "#4C6EF5"];
const roomEmoji = (course) => { const c = course || ""; if (c.includes("เทคโน")) return "💻"; if (/mix|master/i.test(c)) return "🎧"; if (c.includes("เพลง")) return "🎹"; if (c.includes("ติว")) return "📚"; return "🎵"; };
const fileToImg = (file, max = 640) => new Promise((res) => {
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => {
    let { width: w, height: h } = img; if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h);
    res(cv.toDataURL("image/jpeg", 0.8)); }; img.src = r.result; };
  r.readAsDataURL(file);
});

function RoomsTab({ layout, setLayout, usage, setUsage, sessions, students, onSetRoom, onPick, say }) {
  const floors = layout.floors || [];
  const [curFloor, setCurFloor] = useState(floors[0]?.id);
  const [mode, setMode] = useState("layout");
  const [date, setDate] = useState(toInput(today));
  const [time, setTime] = useState("18:00");
  const [editRoom, setEditRoom] = useState(null); // roomId
  const [viewRoom, setViewRoom] = useState(null); // roomId
  const [uRoom, setURoom] = useState(""); const [uFrom, setUFrom] = useState("18:00"); const [uTo, setUTo] = useState("19:00"); const [uLabel, setULabel] = useState(""); const [warn, setWarn] = useState(null);
  const TIMES = []; for (let h = 8; h <= 22; h++) { TIMES.push(`${String(h).padStart(2, "0")}:00`); TIMES.push(`${String(h).padStart(2, "0")}:30`); }
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const DUR = 60;
  const cur = floors.find((f) => f.id === curFloor) || floors[0];
  const colorOf = (fid) => ROOM_PALETTE[Math.max(0, floors.findIndex((f) => f.id === fid)) % ROOM_PALETTE.length];
  const allRooms = floors.flatMap((f) => f.rooms.map((r) => ({ ...r, floorName: f.name })));
  const roomById = (id) => allRooms.find((r) => r.id === id);
  const stName = (id) => { const st = students.find((x) => x.id === id); return st ? `${st.nick}${st.first ? " " + st.first : ""} #${id}` : "#" + id; };
  const sMin = (s) => s.at.getHours() * 60 + s.at.getMinutes();
  const sTime = (s) => `${String(s.at.getHours()).padStart(2, "0")}:${String(s.at.getMinutes()).padStart(2, "0")}`;
  const daySessions = sessions.filter((s) => toInput(s.at) === date);

  const setFloors = (fn) => setLayout({ ...layout, floors: fn(floors) });
  const updateRoom = (rid, patch) => setFloors((fs) => fs.map((f) => ({ ...f, rooms: f.rooms.map((r) => (r.id === rid ? { ...r, ...patch } : r)) })));
  const addRoom = () => { const id = "rm" + Date.now(); setFloors((fs) => fs.map((f) => (f.id === curFloor ? { ...f, rooms: [...f.rooms, { id, name: "ห้องใหม่", x: 20, y: 20, w: 150, h: 110, imgs: [] }] } : f))); };
  const addFloor = () => { const n = prompt("ชื่อชั้นใหม่", "ชั้น " + (floors.length + 1)); if (n === null) return; const id = "fl" + Date.now(); setLayout({ ...layout, floors: [...floors, { id, name: n || "ชั้น " + (floors.length + 1), rooms: [] }] }); };
  const renameFloor = (f) => { const n = prompt("เปลี่ยนชื่อชั้น", f.name); if (n) setFloors((fs) => fs.map((x) => (x.id === f.id ? { ...x, name: n } : x))); };
  const deleteRoom = (rid) => { setFloors((fs) => fs.map((f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== rid) }))); daySessions.forEach(() => {}); sessions.forEach((s) => { if (s.room === rid) onSetRoom(s.id, ""); }); setEditRoom(null); };

  const busyAt = (rid, t) => {
    const min = toMin(t);
    const s = daySessions.find((x) => x.room === rid && min >= sMin(x) && min < sMin(x) + DUR);
    if (s) return { who: `${stName(s.studentId)} · ${sTime(s)}`, lesson: true };
    const u = (usage || []).find((x) => x.roomId === rid && x.date === date && min >= toMin(x.from) && min < toMin(x.to));
    if (u) return { who: `${u.label} · ${u.from}-${u.to}`, lesson: false };
    return null;
  };

  // ลาก/ปรับขนาดห้อง (โหมดจัดผัง)
  const onDown = (e, room) => {
    if (mode !== "layout") return;
    const box = e.currentTarget; const resize = e.target.dataset.handle === "1";
    box.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = room.x, oy = room.y, ow = room.w, oh = room.h; box._moved = false;
    const move = (ev) => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 3) box._moved = true;
      if (resize) { box.style.width = Math.max(70, ow + dx) + "px"; box.style.height = Math.max(60, oh + dy) + "px"; }
      else { box.style.left = Math.max(0, ox + dx) + "px"; box.style.top = Math.max(0, oy + dy) + "px"; } };
    const up = () => { box.removeEventListener("pointermove", move); box.removeEventListener("pointerup", up);
      updateRoom(room.id, { x: parseInt(box.style.left) || ox, y: parseInt(box.style.top) || oy, w: parseInt(box.style.width) || ow, h: parseInt(box.style.height) || oh }); };
    box.addEventListener("pointermove", move); box.addEventListener("pointerup", up);
  };

  const addUsage = () => {
    setWarn(null);
    if (!uRoom) { say("เลือกห้องก่อน"); return; }
    if (!uLabel.trim()) { say("ใส่ว่าใช้ทำอะไร"); return; }
    if (toMin(uTo) <= toMin(uFrom)) { say("เวลาสิ้นสุดต้องหลังเวลาเริ่ม"); return; }
    const hit = daySessions.filter((s) => s.room === uRoom && toMin(uFrom) < sMin(s) + DUR && toMin(uTo) > sMin(s)).sort((a, b) => a.at - b.at);
    if (hit.length) { setWarn({ room: roomById(uRoom)?.name, list: hit.map((s) => `${roomEmoji(s.course)} ${stName(s.studentId)} · ${sTime(s)}`) }); return; }
    const clashU = (usage || []).find((u) => u.roomId === uRoom && u.date === date && toMin(uFrom) < toMin(u.to) && toMin(uTo) > toMin(u.from));
    if (clashU && !window.confirm(`ช่วงนี้มีการจองทั่วไปอยู่แล้ว (${clashU.label} ${clashU.from}-${clashU.to})\nยืนยันจองซ้อนไหม?`)) return;
    setUsage([...(usage || []), { id: "us" + Date.now(), roomId: uRoom, date, from: uFrom, to: uTo, label: uLabel.trim() }]);
    setULabel(""); say("เพิ่มการใช้ห้องแล้ว");
  };
  const removeUsage = (id) => setUsage((usage || []).filter((u) => u.id !== id));

  const roomOpts = (val) => (
    <>
      <option value="">— ห้อง —</option>
      <option value="online">🌐 ออนไลน์</option>
      {allRooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.floorName})</option>)}
    </>
  );
  const inp = { ...font, border: "1px solid var(--line)" };

  return (
    <div>
      {/* floors */}
      <div className="mb-3 flex flex-wrap gap-2">
        {floors.map((f) => { const c = colorOf(f.id); const on = f.id === curFloor;
          return <button key={f.id} onClick={() => setCurFloor(f.id)} onDoubleClick={() => renameFloor(f)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold" style={on ? { background: c, color: "#fff" } : { background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{f.name}
          </button>; })}
        <button onClick={addFloor} className="rounded-full px-3 py-1 text-sm font-medium" style={{ background: BLUE_SOFT, color: BLUE }}>+ ชั้น</button>
      </div>

      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)" }}>
          {[["layout", "จัดผัง"], ["book", "ดูการใช้ห้อง"]].map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)} className="px-3 py-1.5 text-sm font-semibold" style={mode === m ? { background: BLUE, color: "#fff" } : { background: "var(--card)", color: INK }}>{l}</button>
          ))}
        </div>
        <button onClick={addRoom} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: BLUE }}>+ เพิ่มห้อง</button>
        <span className="flex-1" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inp} />
        <select value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inp}>{TIMES.map((t) => <option key={t} value={t}>{t} น.</option>)}</select>
      </div>

      {/* stage */}
      <div className="relative w-full overflow-hidden rounded-2xl" style={{ height: "56vh", minHeight: 340, border: "1px solid var(--line)", background: "repeating-linear-gradient(0deg,var(--line-soft) 0 1px,transparent 1px 28px), repeating-linear-gradient(90deg,var(--line-soft) 0 1px,transparent 1px 28px), #fff", touchAction: "none" }}>
        {cur?.rooms.map((room) => {
          const c = colorOf(cur.id);
          const bk = mode === "book" ? busyAt(room.id, time) : null;
          const border = mode === "book" ? (bk ? "#B42318" : "#1E8E5A") : c;
          const ses = daySessions.filter((s) => s.room === room.id).sort((a, b) => a.at - b.at);
          const us = (usage || []).filter((u) => u.roomId === room.id && u.date === date).sort((a, b) => toMin(a.from) - toMin(b.from));
          const lines = [...ses.map((s) => `${roomEmoji(s.course)} ${stName(s.studentId)} · ${sTime(s)}`), ...us.map((u) => `📌 ${u.label} · ${u.from}-${u.to}`)];
          const veil = mode === "book" ? (bk ? "rgba(253,232,232,.80)" : "rgba(228,246,236,.80)") : "rgba(255,255,255,.74)";
          return (
            <div key={room.id} onPointerDown={(e) => onDown(e, room)} onClick={(e) => { if (e.currentTarget._moved) { e.currentTarget._moved = false; return; } mode === "layout" ? setEditRoom(room.id) : setViewRoom(room.id); }}
              className="absolute flex flex-col overflow-hidden rounded-xl p-1.5" style={{ left: room.x, top: room.y, width: room.w, height: room.h, border: `2px solid ${border}`, color: c, cursor: mode === "layout" ? "grab" : "pointer", backgroundImage: room.imgs?.[0] ? `url(${room.imgs[0]})` : "none", backgroundSize: "cover", backgroundPosition: "center" }}>
              <div className="absolute inset-0" style={{ background: veil }} />
              <div className="relative font-bold" style={{ fontSize: 13, lineHeight: 1.15 }}>{room.name}{room.imgs?.length ? <span style={{ fontWeight: 400, opacity: .55 }}> 🖼{room.imgs.length}</span> : ""}</div>
              {mode === "book" && <div className="relative" style={{ fontSize: 11, fontWeight: 600, color: bk ? "#B42318" : "#1E8E5A" }}>{bk ? "⛔ ไม่ว่าง" : "✅ ว่าง"} · {time}</div>}
              {lines.length ? <div className="relative mt-auto" style={{ fontSize: 11, opacity: .85, lineHeight: 1.25 }}>{lines.slice(0, 4).map((t, i) => <div key={i}>{t}</div>)}{lines.length > 4 ? <div>…อีก {lines.length - 4}</div> : null}</div>
                : mode === "layout" ? <div className="relative" style={{ fontSize: 11, opacity: .5 }}>แตะเพื่อตั้งค่า/ใส่รูป</div> : null}
              {mode === "layout" && <div data-handle="1" className="absolute" style={{ right: 2, bottom: 2, width: 16, height: 16, cursor: "nwse-resize", background: `linear-gradient(135deg,transparent 50%,${c} 50%)`, borderRadius: "0 0 8px 0" }} />}
            </div>
          );
        })}
        {cur?.rooms.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">ยังไม่มีห้องในชั้นนี้ · กด "+ เพิ่มห้อง"</div>}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-1"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#1E8E5A", display: "inline-block" }} /> ว่าง</span>
        <span className="inline-flex items-center gap-1"><i style={{ width: 11, height: 11, borderRadius: 3, background: "#B42318", display: "inline-block" }} /> ไม่ว่าง</span>
        <span className="text-slate-400">โหมดจัดผัง = สีตามชั้น · ลากย้าย/ปรับมุมขวาล่าง · แตะห้องเพื่อตั้งชื่อ/ใส่รูป/ลบ</span>
      </div>

      {/* schedule panel */}
      <section className="mt-3 rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
        <h3 className="text-sm font-semibold" style={{ color: BLUE }}>คาบเรียนวันที่ {date} (จากตาราง)</h3>
        <div className="my-2 rounded-lg px-2 py-1.5 text-xs" style={{ background: BLUE_SOFT, color: BLUE }}>🔒 เวลาเรียนของเด็กล็อกไว้ — เปลี่ยน "ห้อง" ได้ที่นี่เลย · ย้าย "วัน/เวลา" ทำที่หน้าตารางสอน · เลือกวันด้านบนเพื่อจัดห้องล่วงหน้า · มี 🌐 ออนไลน์</div>
        {daySessions.length === 0 ? <div className="py-2 text-sm text-slate-400">วันนี้ไม่มีคาบ (เปลี่ยนวันด้านบนได้)</div> :
          daySessions.slice().sort((a, b) => a.at - b.at).map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-1.5 text-sm" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <span className="w-12 shrink-0 font-bold">{sTime(s)}</span>
              <button onClick={() => onPick(s.studentId)} className="min-w-0 flex-1 truncate text-left" style={{ color: INK }}>{roomEmoji(s.course)} {stName(s.studentId)} · {s.course}</button>
              <select value={s.room || ""} onChange={(e) => onSetRoom(s.id, e.target.value)} className="shrink-0 rounded-lg px-2 py-1 text-xs" style={{ ...inp, maxWidth: "46%" }}>{roomOpts(s.room)}</select>
            </div>
          ))}
      </section>

      {/* usage panel */}
      <section className="mt-3 rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
        <h3 className="text-sm font-semibold" style={{ color: BLUE }}>จองใช้ห้องทั่วไป (เลือกเวลาเองได้)</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={uRoom} onChange={(e) => setURoom(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={{ ...inp, minWidth: 120 }}>
            <option value="">เลือกห้อง</option>
            {allRooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.floorName})</option>)}
          </select>
          <select value={uFrom} onChange={(e) => setUFrom(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inp}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
          <span className="text-xs text-slate-400">ถึง</span>
          <select value={uTo} onChange={(e) => setUTo(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={inp}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <input value={uLabel} onChange={(e) => setULabel(e.target.value)} placeholder="ใช้ทำอะไร เช่น ซ้อมวง / อัดเสียง / ประชุม" className="mt-2 w-full rounded-lg px-2 py-1.5 text-sm" style={inp} />
        <button onClick={addUsage} className="mt-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: BLUE }}>+ เพิ่มการใช้ห้อง</button>
        {warn && (
          <div className="mt-2 rounded-xl p-3" style={{ background: "#FDE8E8", color: "#B42318", border: "2px solid #EE9B9B", fontWeight: 800, fontSize: 14 }}>
            ⛔ จองไม่ได้ — ห้อง {warn.room} ช่วงนี้มีคาบเรียนอยู่
            {warn.list.map((t, i) => <div key={i} style={{ fontWeight: 600, fontSize: 13 }}>• {t}</div>)}
            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 4 }}>คาบเรียนของเด็กสำคัญกว่า ต้องย้ายเด็กออกจากห้องนี้ก่อน (เปลี่ยน "ห้อง" ที่แผงคาบเรียน หรือย้ายวัน/เวลาที่หน้าตาราง) แล้วจึงจองห้องได้</div>
          </div>
        )}
        <div className="mt-2">
          {(usage || []).filter((u) => u.date === date).sort((a, b) => toMin(a.from) - toMin(b.from)).map((u) => (
            <div key={u.id} className="flex items-center gap-2 py-1.5 text-sm" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <span className="w-12 shrink-0 font-bold">{u.from}</span>
              <span className="min-w-0 flex-1 truncate">📌 {u.label} · {roomById(u.roomId)?.name || "?"} (ถึง {u.to})</span>
              <button onClick={() => removeUsage(u.id)} className="shrink-0 rounded-md px-2 py-0.5 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบ</button>
            </div>
          ))}
          {(usage || []).filter((u) => u.date === date).length === 0 && <div className="py-1 text-xs text-slate-400">ยังไม่มีการจองใช้ห้องทั่วไปในวันนี้</div>}
        </div>
      </section>

      {/* edit room modal */}
      {editRoom && (() => { const room = roomById(editRoom); if (!room) return null; return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setEditRoom(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" style={{ color: INK }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-bold">ตั้งค่าห้อง</h3>
            <label className="text-xs text-slate-500">ชื่อห้อง<input value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm" style={inp} /></label>
            <div className="mt-3 text-xs text-slate-500">รูปในห้อง (เครื่องดนตรี/อุปกรณ์)</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {(room.imgs || []).map((src, i) => (
                <div key={i} className="relative" style={{ width: 64, height: 64, borderRadius: 8, background: `url(${src}) center/cover`, border: "1px solid var(--line)" }}>
                  <button onClick={() => updateRoom(room.id, { imgs: room.imgs.filter((_, k) => k !== i) })} className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white" style={{ background: "#B42318" }}>×</button>
                </div>
              ))}
            </div>
            <label className="mt-2 inline-block cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: BLUE_SOFT, color: BLUE }}>
              + เพิ่มรูป
              <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { const fs = [...e.target.files]; const imgs = []; for (const f of fs) imgs.push(await fileToImg(f)); updateRoom(room.id, { imgs: [...(room.imgs || []), ...imgs] }); e.target.value = ""; }} />
            </label>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setEditRoom(null)} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>เสร็จ</button>
              <button onClick={() => deleteRoom(room.id)} className="rounded-lg px-4 py-2 text-sm" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบห้อง</button>
            </div>
          </div>
        </div>
      ); })()}

      {/* view room modal (book) */}
      {viewRoom && (() => { const room = roomById(viewRoom); if (!room) return null;
        const ses = daySessions.filter((s) => s.room === room.id).sort((a, b) => a.at - b.at);
        const us = (usage || []).filter((u) => u.roomId === room.id && u.date === date).sort((a, b) => toMin(a.from) - toMin(b.from));
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setViewRoom(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" style={{ color: INK, maxHeight: "88vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-bold">ห้อง {room.name}</h3>
            <div className="flex flex-wrap gap-2">{(room.imgs || []).map((src, i) => <div key={i} style={{ width: 64, height: 64, borderRadius: 8, background: `url(${src}) center/cover`, border: "1px solid var(--line)" }} />)}{!room.imgs?.length && <span className="text-xs text-slate-400">ยังไม่มีรูป</span>}</div>
            <div className="mt-3 text-sm font-semibold">คาบเรียนในห้องนี้ ({date})</div>
            {ses.length ? ses.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1.5 text-sm" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <span className="w-12 shrink-0 font-bold">{sTime(s)}</span>
                <span className="min-w-0 flex-1 truncate">{stName(s.studentId)} · {s.course}</span>
                <select value={s.room || ""} onChange={(e) => onSetRoom(s.id, e.target.value)} className="shrink-0 rounded-lg px-2 py-1 text-xs" style={inp}>{roomOpts(s.room)}</select>
              </div>
            )) : <div className="py-1 text-xs text-slate-400">ไม่มีคาบในห้องนี้</div>}
            <div className="mt-3 text-sm font-semibold">การใช้ห้องทั่วไป</div>
            {us.length ? us.map((u) => (
              <div key={u.id} className="flex items-center gap-2 py-1.5 text-sm" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <span className="w-12 shrink-0 font-bold">{u.from}</span><span className="min-w-0 flex-1 truncate">{u.label} (ถึง {u.to})</span>
                <button onClick={() => removeUsage(u.id)} className="shrink-0 rounded-md px-2 py-0.5 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบ</button>
              </div>
            )) : <div className="py-1 text-xs text-slate-400">ไม่มีการใช้ห้องทั่วไป</div>}
            <button onClick={() => setViewRoom(null)} className="mt-3 w-full rounded-lg py-2 text-sm" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>ปิด</button>
          </div>
        </div>
      ); })()}
    </div>
  );
}

// ─── โมดัล QR รับเงิน (พร้อมเพย์) ────────────────────────────────
function PayQR({ biz, student, defaultAmount, onClose }) {
  const [amount, setAmount] = useState(defaultAmount || "");
  const pp = (biz?.promptpay || "").trim();
  const qrImg = (biz?.qrImgUrl || "").trim();
  const payload = pp ? promptpayPayload(pp, Number(amount) || 0) : "";
  const payLink = typeof window !== "undefined" ? `${window.location.origin}/pay?name=${encodeURIComponent(student?.nick || "")}&id=${student?.id || ""}&amt=${Number(amount) || ""}&pp=${encodeURIComponent(pp)}&qr=${encodeURIComponent(qrImg)}` : "";
  const copy = (t) => { try { navigator.clipboard.writeText(t); } catch (e) {} };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center" style={{ ...font, color: INK }} onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-bold" style={{ color: BLUE }}>QR รับเงิน (พร้อมเพย์)</div>
        {student && <div className="text-sm text-slate-500">{student.nick} {student.first || ""} #{student.id}</div>}
        {!pp && !qrImg ? (
          <div className="my-4 rounded-lg p-3 text-sm" style={{ background: "#FDE8E8", color: "#B42318" }}>ยังไม่ได้ตั้ง QR — ไปที่ "ข้อมูลธุรกิจ" ในหลังบ้าน แล้วอัปรูป QR หรือใส่เลขพร้อมเพย์ก่อนครับ</div>
        ) : (
          <>
            <div className="my-3 flex justify-center">
              <div className="rounded-xl bg-white p-3" style={{ border: "1px solid var(--line)" }}>{qrImg ? <img src={qrImg} alt="QR" style={{ width: 190, height: 190, objectFit: "contain" }} /> : <QRCodeSVG value={payload} size={190} level="M" />}</div>
            </div>
            <div className="mb-2 flex items-center justify-center gap-2 text-sm">
              <span className="text-slate-500">ยอด</span>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ระบุจำนวน" className="w-28 rounded-lg px-2 py-1 text-center" style={{ ...font, border: "1px solid var(--line)" }} />
              <span className="text-slate-500">บาท</span>
            </div>
            {qrImg ? <div className="text-xs text-slate-500">ใช้รูป QR ที่อัปไว้ · ระบุยอดในแอปธนาคารตอนสแกน</div> : <div className="text-xs text-slate-500">พร้อมเพย์: {pp}</div>}
            <div className="mt-3 flex flex-col gap-2">
              <button onClick={() => copy(payLink)} className="rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>คัดลอกลิงก์จ่ายเงิน (เด็กเปิดแล้วเห็น QR + อัปสลิปได้)</button>
              <div className="text-xs text-slate-400">แคปหน้าจอ QR ส่งให้เด็ก หรือส่งลิงก์ด้านบนก็ได้</div>
            </div>
          </>
        )}
        <button onClick={onClose} className="mt-3 w-full rounded-lg py-2 text-sm" style={{ background: "var(--card)", color: INK, border: "1px solid var(--line)" }}>ปิด</button>
      </div>
    </div>
  );
}

// ─── หน้าเด็กอัปสลิปเอง (public /pay) ───────────────────────────
function PaySlipPage() {
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [cfg, setCfg] = useState(null);
  useEffect(() => { loadPayConfig().then(setCfg).catch(() => setCfg(null)); }, []);
  // ดึงจากคลาวด์ก่อน (เสถียร) ถ้าไม่มีค่อย fallback ไปที่ลิงก์
  const qrImg = (cfg?.qr_url || q.get("qr") || "").trim();
  const pp = (cfg?.promptpay || q.get("pp") || "").trim();
  const bankInfo = (cfg?.bank_info || "").trim();
  const [name, setName] = useState(q.get("name") || "");
  const [sid, setSid] = useState(q.get("id") || "");
  const [amount, setAmount] = useState(q.get("amt") || "");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const payload = pp ? promptpayPayload(pp, Number(amount) || 0) : "";
  const submit = async () => {
    setErr("");
    if (!name.trim()) { setErr("กรอกชื่อ/ชื่อเล่นก่อน"); return; }
    if (!file) { setErr("แนบรูปสลิปโอนเงินก่อน"); return; }
    setBusy(true);
    try {
      const up = await uploadSlip(file);
      await submitPayment({ studentName: name, studentId: sid, amount, month: new Date().toISOString().slice(0, 7), slipUrl: up.url, slipPath: up.path });
      setDone(true);
    } catch (e) { setErr("ส่งไม่สำเร็จ: " + (e.message || e)); }
    setBusy(false);
  };
  const inp = { ...font, border: "1px solid var(--line)" };
  if (done) return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ ...font, background: "var(--bg)", color: INK }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center" style={{ border: "1px solid var(--line)" }}>
        <div className="text-lg font-bold" style={{ color: BLUE }}>ส่งสลิปแล้ว ✓</div>
        <div className="mt-1 text-sm text-slate-500">ขอบคุณครับ ทางโรงเรียนจะตรวจสอบยอดให้</div>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen p-5" style={{ ...font, background: "var(--bg)", color: INK }}>
      <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;800&display=swap" rel="stylesheet" />
      <div className="mx-auto max-w-sm">
        <div className="mb-3 text-center">
          <div className="text-xl font-extrabold" style={{ color: BLUE }}>ชำระเงิน · ส่งสลิป</div>
          <div className="text-sm text-slate-500">Today What Todo</div>
        </div>
        {(qrImg || pp || bankInfo) && (
          <div className="mb-3 rounded-2xl bg-white p-4 text-center" style={{ border: "1px solid var(--line)" }}>
            {(qrImg || pp) && <>
              <div className="mb-2 text-sm font-semibold">สแกนจ่ายเงิน</div>
              <div className="flex justify-center"><div className="rounded-xl p-2" style={{ border: "1px solid var(--line)" }}>{qrImg ? <img src={qrImg} alt="QR" style={{ width: 180, height: 180, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} /> : <QRCodeSVG value={payload} size={180} level="M" />}</div></div>
              {amount ? <div className="mt-2 text-sm">ยอด {Number(amount).toLocaleString()} บาท</div> : (qrImg ? <div className="mt-2 text-xs text-slate-400">สแกนแล้วพิมพ์ยอดในแอปธนาคาร</div> : null)}
            </>}
            {bankInfo && <div className="mt-2 whitespace-pre-line rounded-lg px-3 py-2 text-sm" style={{ background: BLUE_SOFT, color: INK }}>{bankInfo}</div>}
          </div>
        )}
        <div className="space-y-2 rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
          <label className="block text-xs text-slate-500">ชื่อ/ชื่อเล่น *<input value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 w-full rounded-lg px-2 py-2 text-sm" style={inp} /></label>
          <div className="flex gap-2">
            <label className="block flex-1 text-xs text-slate-500">รหัสนักเรียน (ถ้ามี)<input value={sid} onChange={(e) => setSid(e.target.value)} className="mt-0.5 w-full rounded-lg px-2 py-2 text-sm" style={inp} /></label>
            <label className="block flex-1 text-xs text-slate-500">ยอดโอน (บาท)<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-0.5 w-full rounded-lg px-2 py-2 text-sm" style={inp} /></label>
          </div>
          <label className="block text-xs text-slate-500">รูปสลิปโอนเงิน *
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-1 w-full text-sm" />
          </label>
          {file && <div className="text-xs text-slate-400">เลือกแล้ว: {file.name}</div>}
          {err && <div className="text-xs" style={{ color: "#B42318" }}>{err}</div>}
          <button onClick={submit} disabled={busy} className="mt-1 w-full rounded-xl py-2.5 font-semibold text-white disabled:opacity-50" style={{ background: BLUE }}>{busy ? "กำลังส่ง…" : "ส่งสลิป"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── หลังบ้าน: การเงิน / สลิป (แยกเดือน) ─────────────────────────
function PaymentsPanel({ biz, students, say, onPayQR }) {
  const [rows, setRows] = useState(null);
  const [zoom, setZoom] = useState(null);
  const reload = () => loadPayments().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);
  const payLink = typeof window !== "undefined" ? `${window.location.origin}/pay?pp=${encodeURIComponent((biz?.promptpay || "").trim())}&qr=${encodeURIComponent((biz?.qrImgUrl || "").trim())}` : "";
  const confirm = async (r) => { await updatePayment(r.id, { status: r.status === "confirmed" ? "pending" : "confirmed" }); reload(); };
  const del = async (r) => { if (!window.confirm("ลบรายการนี้?")) return; await removePayment(r.id); reload(); };
  const byMonth = {};
  (rows || []).forEach((r) => { const m = r.month || (r.created_at || "").slice(0, 7); (byMonth[m] = byMonth[m] || []).push(r); });
  const months = Object.keys(byMonth).sort().reverse();
  const thMonth = (m) => { const [y, mo] = m.split("-"); return `${["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][+mo] || mo} ${(+y) + 543}`; };
  return (
    <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: BLUE }}>การเงิน / สลิป (แยกเดือน)</h2>
        <div className="flex gap-1.5">
          <button onClick={() => onPayQR(null, "")} className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: "#1E8E5A" }}>สร้าง QR</button>
          <button onClick={() => { try { navigator.clipboard.writeText(payLink); say("คัดลอกลิงก์ส่งสลิปแล้ว"); } catch (e) {} }} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: BLUE_SOFT, color: BLUE }}>คัดลอกลิงก์ส่งสลิป</button>
        </div>
      </div>
      <p className="mb-2 text-xs text-slate-500">ลิงก์ให้เด็กอัปสลิปเอง: <span className="break-all" style={{ color: BLUE }}>{payLink}</span></p>
      {rows === null ? <div className="py-3 text-sm text-slate-400">กำลังโหลด…</div> :
        months.length === 0 ? <div className="py-3 text-sm text-slate-400">ยังไม่มีสลิปเข้ามา</div> :
        months.map((m) => {
          const list = byMonth[m].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
          const total = list.reduce((a, r) => a + (Number(r.amount) || 0), 0);
          const conf = list.filter((r) => r.status === "confirmed").reduce((a, r) => a + (Number(r.amount) || 0), 0);
          return (
            <div key={m} className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-sm font-bold">{thMonth(m)}</div>
                <div className="text-xs text-slate-500">ยืนยันแล้ว {baht(conf)} / รวม {baht(total)} ({list.length} รายการ)</div>
              </div>
              <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--line-soft)" }}>
                {list.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2 px-2 py-2 text-sm" style={i ? { borderTop: "1px solid var(--line-soft)" } : {}}>
                    {r.slip_url ? <img src={r.slip_url} onClick={() => setZoom(r.slip_url)} alt="slip" className="h-12 w-12 shrink-0 cursor-pointer rounded-md object-cover" style={{ border: "1px solid var(--line)" }} /> : <div className="h-12 w-12 shrink-0 rounded-md" style={{ background: "var(--line-soft)" }} />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.student_name} {r.student_id ? `#${r.student_id}` : ""}</div>
                      <div className="text-xs text-slate-500">{baht(Number(r.amount) || 0)} · {(r.created_at || "").slice(0, 10)}</div>
                    </div>
                    <button onClick={() => confirm(r)} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold" style={r.status === "confirmed" ? { background: "#E9F9F0", color: "#1E8E5A" } : { background: "#FFF3D6", color: "#7A4B00" }}>{r.status === "confirmed" ? "✓ ยืนยันแล้ว" : "รอตรวจ"}</button>
                    <button onClick={() => del(r)} className="shrink-0 rounded-md px-2 py-1 text-xs" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบ</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      {zoom && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setZoom(null)}><img src={zoom} alt="slip" className="max-h-[88vh] max-w-full rounded-lg" /></div>}
    </section>
  );
}

// ─── หลังบ้าน: กู้คืนจากสำรองบนคลาวด์ (ย้อนวัน) ────────────────────
function SnapshotRestore({ onApplyState, say }) {
  const [snaps, setSnaps] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => { setOpen(true); listSnapshots().then(setSnaps).catch(() => setSnaps([])); };
  const restore = async (id) => {
    if (!window.confirm(`กู้คืนข้อมูลของวันที่ ${id}?\nจะทับข้อมูลปัจจุบันทั้งหมด`)) return;
    try { const st = await loadSnapshot(id); if (st) { onApplyState(st); say(`กู้คืนข้อมูลวันที่ ${id} แล้ว`); } else say("ไม่พบสแนปช็อตของวันนั้น"); }
    catch (e) { say("กู้คืนไม่สำเร็จ: " + (e.message || e)); }
  };
  return (
    <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid var(--line)" }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: BLUE }}>สำรองบนคลาวด์ (กู้ย้อนหลัง)</h2>
        <button onClick={load} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: BLUE_SOFT, color: BLUE }}>ดูรายการสำรอง</button>
      </div>
      <p className="text-xs text-slate-500">ระบบเก็บสแนปช็อตอัตโนมัติวันละ 1 ครั้งบนคลาวด์ ถ้าข้อมูลผิดพลาดกดกู้คืนย้อนวันได้ (ไม่ต้องพึ่งไฟล์ที่โหลดเก็บเอง)</p>
      {open && (snaps === null ? <div className="py-2 text-sm text-slate-400">กำลังโหลด…</div> :
        snaps.length === 0 ? <div className="py-2 text-sm text-slate-400">ยังไม่มีสำรอง (ระบบจะเริ่มเก็บวันนี้)</div> :
        <div className="mt-2">
          {snaps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 py-1.5 text-sm" style={i ? { borderTop: "1px solid var(--line-soft)" } : {}}>
              <span className="flex-1">📅 {s.id}</span>
              <button onClick={() => restore(s.id)} className="rounded-md px-3 py-1 text-xs font-semibold text-white" style={{ background: BLUE }}>กู้คืน</button>
            </div>
          ))}
        </div>)}
    </section>
  );
}
