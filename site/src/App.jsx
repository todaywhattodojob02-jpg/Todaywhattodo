import { useState, useMemo, useEffect, useRef } from "react";
import { loadState, saveState, mode, submitRegistration, loadRegistrations, removeRegistration, serialize, revive } from "./storage.js";
import {
  Volume2, SlidersVertical, Phone, MessageCircle, Facebook, Instagram,
  CalendarDays, Users, Wallet, Link2, ChevronRight, X, Award, Copy, Check, Lock, Cloud, CloudOff,
} from "lucide-react";

// ─── ธีมสีตามโลโก้ ───────────────────────────────────────────
const BLUE = "#1656D6";
const BLUE_DARK = "#0F44B0";
const BLUE_SOFT = "#E9F0FE";
const INK = "#10254F";

const font = { fontFamily: "'Prompt', 'Kanit', 'Sarabun', system-ui, sans-serif" };

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
      <input value={f[k]} onChange={set(k)} placeholder={ph} className="w-full rounded-lg px-3 py-2 text-sm" style={{ ...font, border: "1px solid #D7E0F3", background: "#FAFBFF" }} {...extra} />
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
          className="w-full rounded-xl px-3 py-2 text-center text-lg tracking-widest" style={{ border: `2px solid ${err ? "#B42318" : "#D7E0F3"}` }} autoFocus />
        <button onClick={() => { if (pin === PIN) { sessionStorage.setItem("twt-ok", "1"); setOk(true); } else setErr(true); }}
          className="mt-3 w-full rounded-xl py-2.5 font-semibold text-white" style={{ background: BLUE }}>เข้าใช้งาน</button>
        {err && <div className="mt-2 text-xs" style={{ color: "#B42318" }}>รหัสไม่ถูกต้อง</div>}
      </div>
    </div>
  );

  if (failed) return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ ...font, background: "#F4F7FD", color: INK }}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center" style={{ border: "1px solid #D7E0F3" }}>
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
    <div className="flex min-h-screen items-center justify-center" style={{ ...font, background: "#F4F7FD", color: INK }}>
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
  const [saveStatus, setSaveStatus] = useState(loadErr ? "error" : "saved"); // saved | saving | error
  const firstRun = useRef(true);

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
      const payload = JSON.stringify(serialize({ students: rawStudents, sessions, courses, teachers, rule }));
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

  // บันทึกอัตโนมัติทุกครั้งที่ข้อมูลเปลี่ยน (หน่วง 0.8 วิ)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSaveStatus("saving");
    const t = setTimeout(() => {
      saveState({ students: rawStudents, sessions, courses, teachers, rule })
        .then(() => setSaveStatus("saved"))
        .catch((e) => { console.error(e); setSaveStatus("error"); });
    }, 800);
    return () => clearTimeout(t);
  }, [rawStudents, sessions, courses, teachers, rule]);

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

  // ปุ่มลา: เลื่อนคาบที่เหลือทั้งหมด (คาบถัดไป + คาบหลังจากนั้น) ไปอีก 7 วัน + จดหมายเหตุการลาได้
  const leave = (id, course, note = "") => {
    const mine = byStudent(id).filter((s) => !s.done && (!course || s.course === course)).sort((a, b) => a.at - b.at);
    if (!mine.length) return;
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
  const deleteUnusedPast = () => {
    const stale = sessions.filter((x) => !x.done && !x.absent && x.at < today);
    if (!stale.length) { say("ไม่มีคาบเก่าที่เลยมาแล้วแต่ยังไม่ได้เช็ค"); return; }
    if (!window.confirm(`ลบคาบที่เลยกำหนดมาแล้วแต่ยังไม่ได้ติ๊กว่าเรียน/ขาด ${stale.length} คาบ? (คาบในอนาคตและคาบที่เรียนแล้วจะไม่ถูกลบ)`)) return;
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
    <div className="min-h-screen" style={{ ...font, background: "#F4F7FD", color: INK }}>
      <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <header className="px-4 pt-5 pb-4" style={{ background: BLUE }}>
        <div className="mx-auto flex max-w-6xl items-end justify-between">
          <Logo />
          <div className="text-right text-white/80 text-sm">
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
            jumpTo={jumpTo} onPick={setOpen} needSchedule={needSchedule} onSchedule={openWithSchedule} teachers={teachers.filter((t) => t.status === "Active")} />
        )}

        {tab === "students" && (
          <StudentsTab students={students} sessions={sessions} pool={pool} onPick={setOpen} onAdd={(f, open) => addStudent(f, open)} />
        )}

        {tab === "admin" && <Admin students={students} sessions={sessions} courses={courses} setCourses={setCourses} teachers={teachers} onAddTeacher={addTeacher} onRemoveTeacher={removeTeacher} pool={pool} rule={rule} setRule={setRule} onPick={setOpen} say={say} onCleanup={deleteUnusedPast} onBackup={exportBackup} onRestore={importBackup} />}
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
          onNote={setSessionNote} onScore={setSessionScore} />
      )}

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
              <button onClick={() => setConflict(null)} className="flex-1 rounded-lg py-2 text-sm font-semibold" style={{ background: "#fff", border: "1px solid #D7E0F3", color: INK }}>ยกเลิก</button>
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

function WeekGrid({ sessions, students, forfeitedIds, teacherFilter, setTeacherFilter, studentFilter, setStudentFilter, jumpTo, onPick, needSchedule, onSchedule, teachers }) {
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
        <div className="flex items-center overflow-hidden rounded-xl bg-white" style={{ border: "1px solid #D7E0F3" }}>
          <button onClick={() => shift(-1)} className="px-3 py-2 text-sm font-semibold" style={{ color: BLUE }}>‹</button>
          <input type="date" value={toInput(weekStart)} onChange={(e) => e.target.value && setWeekStart(mondayOf(new Date(e.target.value)))}
            className="px-2 py-1.5 text-sm outline-none" style={{ ...font, borderLeft: "1px solid #D7E0F3", borderRight: "1px solid #D7E0F3" }} />
          <button onClick={() => shift(1)} className="px-3 py-2 text-sm font-semibold" style={{ color: BLUE }}>›</button>
        </div>
        <button onClick={() => setWeekStart(mondayOf(today))} className="rounded-xl bg-white px-3 py-2 text-sm font-medium" style={{ border: "1px solid #D7E0F3", color: BLUE }}>สัปดาห์นี้</button>
        <button onClick={() => { const last = [...sessions].sort((a, b) => b.at - a.at)[0]; if (last) setWeekStart(mondayOf(last.at)); }}
          className="rounded-xl bg-white px-3 py-2 text-sm font-medium" style={{ border: "1px solid #D7E0F3", color: BLUE }}>คาบล่าสุดในชีต</button>

        <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}
          className="rounded-xl bg-white px-3 py-2 text-sm font-medium" style={{ ...font, border: "1px solid #D7E0F3" }}>
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
      <div className="mb-3 rounded-2xl bg-white p-3" style={{ border: "1px solid #D7E0F3" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: BLUE }}>ตารางของเด็ก</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อ/รหัส" className="rounded-full px-3 py-1.5 text-sm" style={{ ...font, border: "1px solid #D7E0F3", width: 140 }} />
          <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ ...font, border: "1px solid #D7E0F3", maxWidth: 220 }}>
            <option value="all">ทุกคน (ตารางครู)</option>
            {options.map((x) => <option key={x.id} value={x.id}>{x.nick}-{x.first} #{x.id}</option>)}
          </select>
          {focus && <button onClick={() => { setStudentFilter("all"); setQ(""); }} className="rounded-full px-3 py-1.5 text-sm" style={{ background: "#EEF2FA", color: INK }}>ล้าง</button>}
        </div>
        {focus && (
          <div className="mt-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{focus.nick}-{focus.first}</span>
              <span className="text-slate-500">{focusSessions.length} คาบ · เรียนแล้ว {focusSessions.filter((x) => x.done).length}</span>
              {Object.entries(byTeacher).map(([t, n]) => <span key={t} className="rounded-full px-2 py-0.5 text-xs" style={{ background: BLUE_SOFT, color: BLUE }}>{t} {n} คาบ</span>)}
              <span className="ml-auto flex gap-1">
                <button onClick={() => jumpSession(-1)} className="rounded-lg px-2 py-1 text-xs" style={{ background: "#EEF2FA" }}>‹ คาบก่อน</button>
                <button onClick={() => jumpSession(1)} className="rounded-lg px-2 py-1 text-xs" style={{ background: "#EEF2FA" }}>คาบถัดไป ›</button>
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
      <div className="overflow-auto rounded-2xl bg-white" style={{ border: "1px solid #D7E0F3", maxHeight: "72vh" }}>
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
                <tr key={slot} style={{ borderTop: half ? "1px dashed #E5EBF7" : "1px solid #D7E0F3" }}>
                  <td className="sticky left-0 z-10 px-2 py-1 font-semibold" style={{ background: "#F4F7FD", color: half ? "#94A3B8" : INK, fontSize: 12 }}>
                    {slot.padStart(5, "0")}
                  </td>
                  {days.map((x, di) => {
                    const items = cell.get(`${di}|${slot}`) || [];
                    return (
                      <td key={di} className="px-1 py-0.5 align-top" style={{ borderLeft: "1px solid #EEF2FA", background: DAY_COLORS[di].tint, height: 34 }}>
                        {items.length === 0 ? <span className="block text-center text-slate-300">-</span> : items.map((s) => (
                          <button key={s.id} onClick={() => onPick(s.studentId)}
                            className="mb-0.5 block w-full rounded-lg px-2 py-1 text-left leading-tight"
                            style={forfeitedIds.has(s.id)
                              ? { background: "#FDE8E8", color: "#B42318", borderLeft: "3px solid #B42318" }
                              : { background: s.done ? "#EEF2FA" : "#fff", color: s.done ? "#64748B" : INK, borderLeft: `3px solid ${s.done ? "#94A3B8" : DAY_COLORS[di].head}`, boxShadow: "0 1px 0 rgba(0,0,0,.04)" }}>
                            <div className="font-semibold">{s.student.nick}-{s.student.first}{forfeitedIds.has(s.id) ? " · ส่วนกลาง" : ""}{s.origTeacher ? <span className="ml-1 rounded px-1 text-xs font-normal" style={{ background: "#FFF3D6", color: "#7A4B00" }}>แทน</span> : null}</div>
                            <div className="text-xs opacity-80">{s.course || s.student.course}{s.total ? ` (${s.n}/${s.total})` : ""}{teacherFilter === "all" || studentFilter !== "all" ? ` · ${s.teacher || s.student.teacher}` : ""}</div>
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
function Profile({ student, sessions, info, rule, courses, teachers, onRemove, onDeleteSession, onDeleteRemaining, onDeletePurchase, needsSchedule, schedOpen, setSchedOpen, onSchedule, onTeacher, onShowSchedule, onExempt, onForce, onClose, onLeave, onChangeDate, onDone, onRenew, onNote, onScore }) {
  const [renewOpen, setRenewOpen] = useState(false);
  const [disc, setDisc] = useState(0);
  const [pickDate, setPickDate] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
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
                    style={on ? { background: "#fff", color: BLUE } : { background: "rgba(255,255,255,.15)", color: "#fff" }}>
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
            <button onClick={() => setSchedOpen(true)} className="mt-1.5 w-full rounded-lg py-1.5 text-xs" style={{ background: "#fff", color: INK, border: "1px solid #D7E0F3" }}>+ จัดคาบเรียนเพิ่ม (คอร์สใหม่ / วันเวลาใหม่)</button>
          )}

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button onClick={() => { setLeaveOpen((v) => !v); setPickDate(null); }} disabled={!next} className="rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: leaveOpen ? BLUE_DARK : BLUE }}>ลา</button>
            <button onClick={openPicker} disabled={!next} className="rounded-lg py-2 text-sm font-semibold disabled:opacity-40" style={{ background: "#fff", color: BLUE, border: `2px solid ${BLUE}` }}>เปลี่ยนวัน/เวลา</button>
            <button onClick={() => setRenewOpen((v) => !v)} className="rounded-lg py-2 text-sm font-semibold text-white" style={{ background: INK }}>ต่อคอร์ส</button>
          </div>
          {leaveOpen && next && (
            <div className="mt-2 rounded-xl p-3" style={{ background: BLUE_SOFT }}>
              <div className="text-sm font-semibold">ลาคาบ {thDate(next.at)} {next.noTime ? "" : thTime(next.at)}</div>
              <div className="mb-2 text-xs text-slate-500">คาบนี้และคาบที่เหลือทั้งหมดจะเลื่อนไปอีก 1 สัปดาห์อัตโนมัติ</div>
              <input value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} placeholder="หมายเหตุการลา (ไม่บังคับ เช่น ติดสอบ)"
                className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid #D7E0F3" }} />
              <div className="mt-2 flex gap-2">
                <button onClick={() => { onLeave(cur, leaveNote.trim()); setLeaveOpen(false); setLeaveNote(""); }} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>ยืนยันลา · เลื่อนทั้งพวง</button>
                <button onClick={() => { setLeaveOpen(false); setLeaveNote(""); }} className="rounded-lg px-4 py-2 text-sm" style={{ background: "#fff", color: INK, border: "1px solid #D7E0F3" }}>ยกเลิก</button>
              </div>
            </div>
          )}
          {next && <p className="mt-1 text-center text-xs text-slate-500">ถัดไป: {thDate(next.at)} {next.noTime ? "" : thTime(next.at)} · เปลี่ยนวัน = เฉพาะคาบถัดไป · ลา = เลื่อนคาบที่เหลือทั้งหมด</p>}

          {info?.remaining > 0 && (
            <div className="mt-2 flex gap-2">
              {info.forfeited.length > 0 ? (
                <button onClick={onExempt} className="flex-1 rounded-lg py-1.5 text-xs font-medium" style={{ background: "#fff", color: "#B42318", border: "1.5px solid #B42318" }}>
                  คืนคาบให้ (ไม่หักส่วนกลาง)
                </button>
              ) : (
                <button onClick={onForce} className="flex-1 rounded-lg py-1.5 text-xs font-medium" style={{ background: "#fff", color: "#64748B", border: "1.5px solid #CBD5E1" }}>
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
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid #D7E0F3", minWidth: 140 }} />
                <select value={newTime} onChange={(e) => setNewTime(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm" style={{ ...font, border: "1px solid #D7E0F3" }}>
                  {TIMES.map((t) => <option key={t} value={t}>{t} น.</option>)}
                </select>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => { onChangeDate(pickDate, newDate, newTime); setPickDate(null); }} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>บันทึก</button>
                <button onClick={() => setPickDate(null)} className="rounded-lg px-4 py-2 text-sm" style={{ background: "#fff", color: INK, border: "1px solid #D7E0F3" }}>ยกเลิก</button>
              </div>
            </div>
          )}

          {renewOpen && (
            <div className="mt-2 rounded-lg p-2.5" style={{ background: BLUE_SOFT }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1 text-xs font-semibold">
                <span className="mr-1">ส่วนลด</span>
                {[0, 5, 10, 15, 20].map((v) => (
                  <button key={v} onClick={() => setDisc(v)} className="rounded-full px-2 py-0.5 font-medium"
                    style={disc === v ? { background: BLUE, color: "#fff" } : { background: "#fff", color: INK, border: "1px solid #D7E0F3" }}>{v ? `${v}%` : "ไม่ลด"}</button>
                ))}
                <input type="number" min="0" max="100" value={disc} onChange={(e) => setDisc(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-14 rounded-md px-1.5 py-0.5 text-right font-normal" style={{ ...font, border: "1px solid #D7E0F3" }} /> %
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
              <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #D7E0F3" }}>
                {student.purchases.map((b, i) => (
                  <div key={i} className="flex items-center px-2.5 py-1 text-xs" style={i ? { borderTop: "1px solid #EEF2FA" } : {}}>
                    <div className="flex-1"><span className="font-medium">{b.course}</span><span className="text-slate-500"> · {b.date} · {b.teacher} · {b.total} คาบ{b.time ? ` · ${b.time}` : ""}{b.discount ? ` · ลด ${b.discount}%` : ""}</span></div>
                    <div className="font-semibold">{b.price ? baht(b.price) : "-"}</div>
                    <button onClick={() => onDeletePurchase(i)} className="ml-2 text-slate-300 hover:text-red-600" title="ลบรายการซื้อนี้"><X size={14} /></button>
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
          <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #D7E0F3" }}>
            {inCourse.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 px-2.5 py-1 text-xs" style={i ? { borderTop: "1px solid #EEF2FA" } : {}}>
                <input type="checkbox" checked={s.done} onChange={() => onDone(s.id)} className="h-3.5 w-3.5 shrink-0" />
                <span className={"flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 " + (s.done ? "text-slate-400" : "")}>
                  <span className="whitespace-nowrap">{s.n || i + 1}{s.total ? `/${s.total}` : ""} · {thDate(s.at)} {s.noTime ? "" : thTime(s.at)}</span>
                  <span className="flex items-center gap-1 text-xs">
                    <select value={s.teacher || ""} onChange={(e) => onTeacher(s.id, e.target.value)}
                      className="rounded px-1 py-0" style={{ ...font, border: "1px solid #D7E0F3", background: s.origTeacher ? "#FFF3D6" : "#fff", color: INK }}>
                      <option value="">— ครู —</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {s.origTeacher && <span className="rounded px-1" style={{ background: "#FFF3D6", color: "#7A4B00" }}>สอนแทน {s.origTeacher}</span>}
                  </span>
                  {(s.course || "").includes("เทคโนโลยี")
                    ? <input value={s.score || ""} onChange={(e) => onScore(s.id, e.target.value)} placeholder="Kahoot"
                        className="w-16 shrink-0 rounded px-1 py-0 text-xs" style={{ ...font, border: "1px solid #F5D488", background: "#FFFBEB", color: "#7A4B00" }} />
                    : (s.score && <span className="rounded px-1 text-xs" style={{ background: "#FFF3D6", color: "#7A4B00" }}>{s.score}</span>)}
                  <input value={s.note || ""} onChange={(e) => onNote(s.id, e.target.value)} placeholder="+ หมายเหตุท้ายคาบ"
                    className="mt-0.5 w-full rounded px-1 py-0.5 text-xs" style={{ ...font, border: "1px solid #EEF2FA", color: INK }} />
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
                  <button onClick={() => setConfirmDel(false)} className="rounded-md bg-white px-3 py-1" style={{ border: "1px solid #D7E0F3", color: INK }}>ยกเลิก</button>
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
  const sel = { ...font, border: "1px solid #D7E0F3" };
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
function Admin({ students, sessions, courses, setCourses, teachers, onAddTeacher, onRemoveTeacher, pool, rule, setRule, onPick, say, onCleanup, onBackup, onRestore }) {
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
  const payroll = teachers.map((t) => {
    const mine = inMonth.filter((s) => s.teacher === t.id);
    const byCourse = {};
    mine.forEach((s) => {
      const k = s.course || "(ไม่ระบุคอร์ส)";
      if (!byCourse[k]) byCourse[k] = { count: 0, rate: rateOf(s.course), pay: 0, items: [] };
      byCourse[k].count += 1; byCourse[k].pay += rateOf(s.course); byCourse[k].items.push(s);
    });
    return { ...t, taught: mine.length, pay: mine.reduce((a, s) => a + rateOf(s.course), 0), byCourse: Object.entries(byCourse).sort((a, b) => b[1].pay - a[1].pay) };
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

  return (
    <div className="space-y-5">
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
            <div key={t.id} className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #D7E0F3" }}>
              <div className="flex items-center px-4 py-2.5" style={{ background: BLUE_SOFT }}>
                <div className="flex-1 font-semibold" style={{ color: INK }}>{t.name}</div>
                <div className="text-right"><div className="text-xs text-slate-500">{t.taught} คาบ</div><div className="font-bold" style={{ color: BLUE }}>{baht(t.pay)}</div></div>
              </div>
              {t.byCourse.map(([course, info]) => {
                const key = `${t.id}|${course}`;
                const open = openRow === key;
                return (
                  <div key={course} style={{ borderTop: "1px solid #EEF2FA" }}>
                    <button onClick={() => setOpenRow(open ? null : key)} className="flex w-full items-center px-4 py-2 text-left text-sm">
                      <ChevronRight size={14} className="mr-1 shrink-0 text-slate-400" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                      <div className="flex-1"><span className="font-medium">{course}</span></div>
                      <div className="w-28 text-right text-xs text-slate-500">{info.count} × {baht(info.rate)}</div>
                      <div className="w-20 text-right font-semibold">{baht(info.pay)}</div>
                    </button>
                    {open && (
                      <div className="px-4 pb-2" style={{ background: "#FAFBFF" }}>
                        {info.items.slice().sort((a, b) => a.at - b.at).map((s, k) => (
                          <button key={s.id} onClick={() => onPick(s.studentId)} className="flex w-full items-center gap-2 py-1 text-left text-xs" style={k ? { borderTop: "1px solid #EEF2FA" } : {}}>
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
            <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-slate-500" style={{ border: "1px solid #D7E0F3" }}>งวดนี้ยังไม่มีคาบที่สอนเสร็จ</div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{ background: INK }}>
          <span>รวมค่าสอนทั้งหมดงวดนี้</span><span>{baht(salary)}</span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">นับเฉพาะคาบที่ติ๊กว่าเรียนแล้ว (Present) ในช่วง {dmy(pStart)}–{dmy(new Date(pEnd.getTime() - 86400000))} · คาบที่ครูสอนแทนจะนับให้ครูที่สอนจริง · แก้ค่าสอนต่อคาบได้ที่ตารางคอร์สด้านล่าง</p>
      </section>

      <TeacherEditor teachers={teachers} sessions={sessions} onAdd={onAddTeacher} onRemove={onRemoveTeacher} />

      <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid #D7E0F3" }}>
        <div className="mb-1 text-sm font-semibold" style={{ color: BLUE }}>ข้อมูลและการสำรอง</div>
        <p className="mb-2 text-xs text-slate-500">ระบบจะดาวน์โหลดไฟล์สำรองให้อัตโนมัติวันละ 1 ครั้งตอนเปิดหน้าแรกของวัน เก็บไฟล์ไว้ใน Google Drive/เครื่องได้เลย</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={onBackup} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: BLUE }}>ดาวน์โหลดไฟล์สำรองตอนนี้</button>
          <label className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#fff", color: BLUE, border: `1px solid ${BLUE}` }}>
            กู้คืนจากไฟล์
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onRestore(f); e.target.value = ""; }} />
          </label>
          <button onClick={onCleanup} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "#FDE8E8", color: "#B42318" }}>ลบคาบค้างเก่า (เลยกำหนด ยังไม่เช็ค)</button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4" style={{ border: "1px solid #D7E0F3" }}>
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
          <div className="mt-3 max-h-72 overflow-auto rounded-xl" style={{ border: "1px solid #EEF2FA" }}>
            {lost.map((x, i) => (
              <button key={x.st.id} onClick={() => onPick(x.st.id)} className="flex w-full items-center px-3 py-2 text-left text-sm" style={i ? { borderTop: "1px solid #EEF2FA" } : {}}>
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
        <div className="overflow-auto rounded-2xl bg-white" style={{ border: "1px solid #D7E0F3" }}>
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr className="text-left text-xs text-slate-500" style={{ background: "#F4F7FD" }}>
                <th className="px-3 py-2">ชื่อคอร์ส</th><th className="px-2 py-2 text-center">ใบเซอร์</th><th className="px-2 py-2">คาบ</th><th className="px-2 py-2">ราคาขาย</th><th className="px-2 py-2">ต้นทุน</th><th className="px-2 py-2">ค่าสอน/คาบ</th><th className="px-2 py-2">กำไร/คอร์ส</th><th></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => {
                const margin = (c.price || 0) - (c.cost || 0) - (c.sessions || 0) * (c.rate || 0);
                const num = (key, w = 80, step = 1) => (
                  <input type="number" step={step} value={c[key] ?? 0} onChange={(e) => editCourse(c.id, { [key]: Number(e.target.value) || 0 })}
                    className="rounded-md px-2 py-1 text-right" style={{ ...font, width: w, border: "1px solid #D7E0F3" }} />
                );
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #EEF2FA" }}>
                    <td className="px-3 py-1.5">
                      <input value={c.name} onChange={(e) => editCourse(c.id, { name: e.target.value })}
                        className="w-full rounded-md px-2 py-1 font-medium" style={{ ...font, border: "1px solid #D7E0F3", minWidth: 170 }} />
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
    </div>
  );
}


// ─── จัดการครู ────────────────────────────────────────────────────
function TeacherEditor({ teachers, sessions, onAdd, onRemove }) {
  const [name, setName] = useState("");
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: BLUE }}>ครูผู้สอน</h2>
        <div className="flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onAdd(name); setName(""); } }}
            placeholder="ชื่อครูใหม่" className="rounded-full px-3 py-1 text-sm" style={{ ...font, border: "1px solid #D7E0F3", width: 140 }} />
          <button onClick={() => { onAdd(name); setName(""); }} className="rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: BLUE }}>+ เพิ่มครู</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #D7E0F3" }}>
        {teachers.map((t, i) => {
          const n = sessions.filter((x) => x.teacher === t.id).length;
          const off = t.status !== "Active";
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={i ? { borderTop: "1px solid #EEF2FA" } : {}}>
              <div className="flex-1">
                <span className={"font-semibold " + (off ? "text-slate-400 line-through" : "")}>{t.name}</span>
                <span className="ml-2 text-xs text-slate-500">{n ? `สอนแล้ว ${n} คาบ` : "ยังไม่มีคาบ"}{off ? " · พักการสอน" : ""}</span>
              </div>
              <button onClick={() => onRemove(t.id)} className="rounded-md px-2.5 py-1 text-xs"
                style={n ? { background: "#EEF2FA", color: INK } : { background: "#FDE8E8", color: "#B42318" }}>
                {n ? (off ? "เปิดใช้งาน" : "พักการสอน") : "ลบ"}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">ครูที่มีประวัติสอนแล้วจะลบไม่ได้ (เพื่อไม่ให้เงินเดือนย้อนหลังหาย) แต่กด "พักการสอน" ให้หายจากตัวเลือกในตารางได้</p>
    </section>
  );
}

// ─── รายชื่อนักเรียน ──────────────────────────────────────────────
function StudentsTab({ students, sessions, pool, onPick, onAdd }) {
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ nick: "", first: "", last: "", phone: "", line: "", fb: "", ig: "" });
  const field = (k, ph) => <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} className="rounded-md px-2 py-1 text-sm" style={{ ...font, border: "1px solid #D7E0F3" }} />;
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
            style={filter === k ? { background: BLUE, color: "#fff" } : { background: "#fff", color: INK, border: "1px solid #D7E0F3" }}>{l}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส" className="ml-auto rounded-full px-3 py-1.5 text-sm" style={{ ...font, border: "1px solid #D7E0F3", minWidth: 160 }} />
        <button onClick={() => setAdding((v) => !v)} className="rounded-full px-3 py-1.5 text-sm font-medium text-white" style={{ background: BLUE }}>+ เพิ่มนักเรียน</button>
      </div>
      {adding && (
        <div className="mb-3 rounded-2xl bg-white p-3" style={{ border: "1px solid #D7E0F3" }}>
          <div className="mb-2 text-sm font-semibold" style={{ color: BLUE }}>เพิ่มนักเรียนใหม่ (หรือส่งลิงก์สมัครให้กรอกเองก็ได้)</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {field("nick", "ชื่อเล่น *")}{field("first", "ชื่อจริง")}{field("last", "นามสกุล")}{field("phone", "เบอร์โทร")}
            {field("line", "LINE ID")}{field("fb", "Facebook")}{field("ig", "Instagram")}
            <button onClick={() => { if (!f.nick.trim()) return; const id = onAdd(f); setF({ nick: "", first: "", last: "", phone: "", line: "", fb: "", ig: "" }); setAdding(false); setFilter("all"); setQ(id); }}
              className="rounded-md py-1 text-sm font-semibold text-white" style={{ background: BLUE }}>บันทึก</button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #D7E0F3" }}>
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">ไม่พบนักเรียน</p>}
        {list.map(({ st: s, status, done, total }, i) => (
          <button key={s.id} onClick={() => onPick(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left" style={i ? { borderTop: "1px solid #EEF2FA" } : {}}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold" style={{ background: BLUE_SOFT, color: BLUE }}>{s.nick[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{s.nick} <span className="font-normal text-slate-500">{s.first} {s.last}</span></div>
              <div className="truncate text-xs text-slate-500">#{s.id} · {s.teacher || "-"} · {s.course || "-"} · เรียนแล้ว {done}/{total} · ต่อคอร์ส {s.renewCount} · ใบเซอร์ {s.certCount}/{CERT_TARGET}</div>
            </div>
            {pool.get(s.id)?.forfeited.length > 0 && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#FDE8E8", color: "#B42318" }}>ส่วนกลาง {pool.get(s.id).forfeited.length}</span>
            )}
            {status === "finished" && <span className="shrink-0 rounded-full px-2 py-0.5 text-xs" style={{ background: "#EEF2FA", color: "#64748B" }}>จบแล้ว</span>}
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
      <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid #D7E0F3" }}>
        <div className="mb-1 text-sm font-semibold">ส่งลิงก์นี้ให้เด็กหลังจ่ายเงิน</div>
        <p className="mb-3 text-xs text-slate-500">เด็กกรอกเอง ไม่ต้องใส่รหัส ข้อมูลจะมารอด้านล่าง กด "รับเข้าระบบ" แล้ว<b>ต้องจัดคอร์ส/วัน/เวลาให้เสร็จในขั้นตอนเดียว</b> (ถ้ายังไม่จัดคาบ จะยังไม่ถูกรับเข้าระบบ)</p>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: BLUE_SOFT, color: BLUE }}>
          <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate underline">{url}</a>
          <button onClick={copy} title="คัดลอก">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        </div>
        <div className="mt-2 flex gap-2">
          <a href={`https://line.me/R/share?text=${encodeURIComponent("ลงทะเบียนเรียนกับ Today What Todo ได้ที่นี่เลยครับ " + url)}`} target="_blank" rel="noreferrer"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-white" style={{ background: "#06C755" }}>แชร์ทาง LINE</a>
          <a href={url} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "#fff", color: BLUE, border: `1px solid ${BLUE}` }}>เปิดดูหน้าฟอร์ม</a>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid #D7E0F3" }}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: BLUE }}>รอรับเข้าระบบ ({regs.length})</div>
          <button onClick={refresh} className="rounded-full px-3 py-1 text-xs" style={{ background: "#EEF2FA", color: INK }}>{loading ? "กำลังโหลด…" : "รีเฟรช"}</button>
        </div>
        {regs.length === 0 && !loading && <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีคนสมัครใหม่</p>}
        <div className="space-y-2">
          {regs.map((r) => (
            <div key={r.id} className="rounded-xl p-3 text-sm" style={{ border: "1px solid #EEF2FA" }}>
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
  const sel = { ...font, border: "1px solid #D7E0F3" };
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
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm" style={{ background: "#fff", color: INK, border: "1px solid #D7E0F3" }}>ยกเลิก</button>
      </div>
    </div>
  );
}
