import { useState, useEffect } from "react";

/* ── Persistent Storage ── */
function useLocalStorage(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

/* ── Constants ── */
const DEFAULT_SHIFTS = [
  { id: "frueh",  name: "Frühschicht",   start: "06:00", end: "14:00", hours: 8, color: "#f59e0b" },
  { id: "mittel", name: "Mittelschicht", start: "10:00", end: "18:00", hours: 8, color: "#3b82f6" },
  { id: "spaet",  name: "Spätschicht",   start: "14:00", end: "22:00", hours: 8, color: "#8b5cf6" },
  { id: "nacht",  name: "Nachtschicht",  start: "22:00", end: "06:00", hours: 8, color: "#64748b" },
];

const DAYS     = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_FULL = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];

/* ── Date helpers ── */
function getMonday(offset = 0) {
  const d = new Date();
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoWeek(d) {
  const tmp = new Date(d);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const y1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp - y1) / 86400000 - 3 + ((y1.getDay() + 6) % 7)) / 7);
}

function fmt(d) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

/* ── App ── */
export default function App() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=Playfair+Display:wght@600;800&display=swap";
    document.head.appendChild(l);
  }, []);

  const [tab,        setTab]        = useState("plan");
  const [employees,  setEmployees]  = useLocalStorage("dp-employees", []);
  const [shiftTypes, setShiftTypes] = useLocalStorage("dp-shifts",    DEFAULT_SHIFTS);
  const [schedules,  setSchedules]  = useLocalStorage("dp-schedules", {});
  const [weekOffset, setWeekOffset] = useState(0);
  const [editCell,   setEditCell]   = useState(null);   // { day, shiftId }

  /* ── Employee form ── */
  const [empName,   setEmpName]   = useState("");
  const [empTarget, setEmpTarget] = useState("40");
  const [empIst,    setEmpIst]    = useState("0");

  /* ── Shift form ── */
  const [sfName,  setSfName]  = useState("");
  const [sfStart, setSfStart] = useState("06:00");
  const [sfEnd,   setSfEnd]   = useState("14:00");
  const [sfHours, setSfHours] = useState("8");
  const [sfColor, setSfColor] = useState("#3b82f6");

  /* ── Week info ── */
  const monday    = getMonday(weekOffset);
  const wk        = monday.toISOString().slice(0, 10);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });
  const plan = schedules[wk] || {};

  /* ── Hour helpers ── */
  function weekHours(empId, p) {
    let h = 0;
    DAYS.forEach(day => {
      if (!p[day]) return;
      Object.entries(p[day]).forEach(([sid, eid]) => {
        if (eid === empId) { const s = shiftTypes.find(x => x.id === sid); if (s) h += s.hours; }
      });
    });
    return h;
  }

  /* ── Employee actions ── */
  const addEmployee = () => {
    const name = empName.trim(); if (!name) return;
    setEmployees([...employees, {
      id: crypto.randomUUID(), name,
      targetHours: parseFloat(empTarget) || 40,
      istHours:    parseFloat(empIst)    || 0,
      preferredShifts: [],
    }]);
    setEmpName(""); setEmpTarget("40"); setEmpIst("0");
  };

  const removeEmployee = id => setEmployees(employees.filter(e => e.id !== id));

  const updateEmp = (id, patch) =>
    setEmployees(employees.map(e => e.id === id ? { ...e, ...patch } : e));

  const togglePref = (empId, shiftId) => {
    const emp = employees.find(e => e.id === empId); if (!emp) return;
    updateEmp(empId, {
      preferredShifts: emp.preferredShifts.includes(shiftId)
        ? emp.preferredShifts.filter(s => s !== shiftId)
        : [...emp.preferredShifts, shiftId],
    });
  };

  /* ── Shift type actions ── */
  const addShift = () => {
    const name = sfName.trim(); if (!name) return;
    setShiftTypes([...shiftTypes, {
      id: crypto.randomUUID(), name,
      start: sfStart, end: sfEnd,
      hours: parseFloat(sfHours) || 8,
      color: sfColor,
    }]);
    setSfName("");
  };

  const removeShift = id => setShiftTypes(shiftTypes.filter(s => s.id !== id));

  /* ── Schedule generation ── */
  const generate = () => {
    if (!employees.length || !shiftTypes.length) return;

    // Accumulate hours already scheduled in this week before generation
    const assignedH = Object.fromEntries(employees.map(e => [e.id, 0]));
    const newPlan   = {};

    DAYS.forEach(day => {
      newPlan[day] = {};
      const usedToday = new Set();

      shiftTypes.forEach(shift => {
        const pool = employees
          .filter(e => !usedToday.has(e.id) && assignedH[e.id] < e.targetHours)
          .sort((a, b) => {
            const pa = a.preferredShifts.includes(shift.id) ? 10 : 0;
            const pb = b.preferredShifts.includes(shift.id) ? 10 : 0;
            const ra = a.targetHours - assignedH[a.id];
            const rb = b.targetHours - assignedH[b.id];
            return (pb + rb) - (pa + ra);
          });

        if (pool.length) {
          newPlan[day][shift.id] = pool[0].id;
          usedToday.add(pool[0].id);
          assignedH[pool[0].id] += shift.hours;
        }
      });
    });

    setSchedules({ ...schedules, [wk]: newPlan });
    setEditCell(null);
  };

  const clearPlan = () => {
    const s = { ...schedules }; delete s[wk]; setSchedules(s); setEditCell(null);
  };

  const setCellEmp = (day, shiftId, empId) => {
    const p = { ...plan, [day]: { ...(plan[day] || {}) } };
    if (empId === "") delete p[day][shiftId]; else p[day][shiftId] = empId;
    setSchedules({ ...schedules, [wk]: p });
    setEditCell(null);
  };

  const empName_ = id => employees.find(e => e.id === id)?.name ?? "—";

  /* ── Export CSV ── */
  const exportCSV = () => {
    const header = ["Tag", ...shiftTypes.map(s => s.name)].join(";") + "\n";
    const rows   = DAYS.map((d, i) =>
      [DAY_FULL[i], ...shiftTypes.map(s => {
        const eid = plan[d]?.[s.id]; return eid ? empName_(eid) : "";
      })].join(";")
    ).join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `dienstplan_${wk}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const colW = 110, rowH = 30, startX = 30, firstColW = 90;
    const tableW = firstColW + shiftTypes.length * colW;
    let rects = "", texts = "";
    let y = 80;

    // Title
    texts += `<text x="${startX}" y="45" font-family="Helvetica" font-size="18" font-weight="bold" fill="#1a2332">Dienstplan KW ${isoWeek(monday)} · ${fmt(weekDates[0])}–${fmt(weekDates[6])} ${monday.getFullYear()}</text>`;

    // Header row
    rects += `<rect x="${startX}" y="${y}" width="${tableW}" height="${rowH}" fill="#1a2332"/>`;
    texts += `<text x="${startX+8}" y="${y+20}" font-family="Helvetica" font-size="11" font-weight="bold" fill="#fff">Tag</text>`;
    shiftTypes.forEach((s, i) => {
      const x = startX + firstColW + i * colW;
      rects += `<rect x="${x}" y="${y}" width="${colW}" height="${rowH}" fill="${s.color}88"/>`;
      texts += `<text x="${x + colW/2}" y="${y+20}" font-family="Helvetica" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle">${s.name}</text>`;
    });
    y += rowH;

    DAYS.forEach((day, di) => {
      const bg = di % 2 === 0 ? "#f4f6f9" : "#ffffff";
      rects += `<rect x="${startX}" y="${y}" width="${tableW}" height="${rowH}" fill="${bg}"/>`;
      texts += `<text x="${startX+8}" y="${y+20}" font-family="Helvetica" font-size="11" font-weight="bold" fill="#1a2332">${DAY_FULL[di].slice(0,2)} ${fmt(weekDates[di])}</text>`;
      shiftTypes.forEach((s, i) => {
        const x   = startX + firstColW + i * colW;
        const eid = plan[day]?.[s.id];
        const nm  = eid ? empName_(eid) : "—";
        texts += `<text x="${x + colW/2}" y="${y+20}" font-family="Helvetica" font-size="10" fill="#2c3e50" text-anchor="middle">${nm}</text>`;
      });
      y += rowH;
    });

    rects += `<rect x="${startX}" y="${y}" width="${tableW}" height="2" fill="#1a2332"/>`;
    const pageH = Math.max(y + 60, 500);
    const svg   = `<svg xmlns="http://www.w3.org/2000/svg" width="${tableW + 60}" height="${pageH}">${rects}${texts}</svg>`;
    const html  = `<!DOCTYPE html><html><head><title>Dienstplan</title><style>@media print{@page{size:A4 landscape;margin:10mm}body{margin:0}}</style></head><body>${svg}<script>window.print();<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  /* ── Render ── */
  return (
    <div style={S.wrapper}>
      <div style={S.noise} />
      <div style={S.orb} />
      <div style={S.container}>

        {/* Header */}
        <div style={S.header}>
          <h1 style={S.title}>Dienstplan</h1>
          <p style={S.subtitle}>Mitarbeiter verwalten · Schichten planen · Pläne generieren</p>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {[
            { id: "plan",      label: "📋 Dienstplan" },
            { id: "employees", label: `👥 Mitarbeiter ${employees.length ? `(${employees.length})` : ""}` },
            { id: "shifts",    label: `⏰ Schichten (${shiftTypes.length})` },
          ].map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ DIENSTPLAN ══ */}
        {tab === "plan" && (
          <div>
            <div style={S.weekNav}>
              <button style={S.navBtn} onClick={() => setWeekOffset(w => w - 1)}>← Vorwoche</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  KW {isoWeek(monday)} · {monday.getFullYear()}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {fmt(weekDates[0])} – {fmt(weekDates[6])}
                </div>
              </div>
              <button style={S.navBtn} onClick={() => setWeekOffset(w => w + 1)}>Nächste →</button>
            </div>

            <div style={S.actionRow}>
              <button style={S.primaryBtn} onClick={generate}
                disabled={!employees.length || !shiftTypes.length}
                title={!employees.length ? "Erst Mitarbeiter anlegen" : !shiftTypes.length ? "Erst Schichten anlegen" : ""}>
                ⚡ Automatisch generieren
              </button>
              <button style={S.ghostBtn}  onClick={exportCSV}
                disabled={!Object.keys(plan).length}>↓ CSV</button>
              <button style={S.ghostBtn}  onClick={exportPDF}
                disabled={!Object.keys(plan).length}>🖨 PDF</button>
              <button style={S.dangerBtn} onClick={clearPlan}
                disabled={!Object.keys(plan).length}>✕ Löschen</button>
            </div>

            {employees.length === 0 || shiftTypes.length === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.4 }}>📋</div>
                <p style={{ margin: 0 }}>
                  {employees.length === 0
                    ? "Bitte zuerst Mitarbeiter im Tab «Mitarbeiter» anlegen."
                    : "Bitte zuerst Schichten im Tab «Schichten» anlegen."}
                </p>
              </div>
            ) : (
              <>
                {/* Schedule table */}
                <div style={{ overflowX: "auto", marginBottom: 24 }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, textAlign: "left", minWidth: 84 }}>Tag</th>
                        {shiftTypes.map(s => (
                          <th key={s.id} style={{ ...S.th, borderBottom: `3px solid ${s.color}`, minWidth: 120 }}>
                            <div style={{ color: s.color }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400, marginTop: 2 }}>
                              {s.start}–{s.end} · {s.hours}h
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day, di) => (
                        <tr key={day} style={{ background: di % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                          <td style={{ ...S.td, textAlign: "left", paddingLeft: 14 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{day}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{fmt(weekDates[di])}</div>
                          </td>
                          {shiftTypes.map(shift => {
                            const empId   = plan[day]?.[shift.id];
                            const isEdit  = editCell?.day === day && editCell?.shiftId === shift.id;
                            return (
                              <td key={shift.id} style={S.td}>
                                {isEdit ? (
                                  <select
                                    autoFocus
                                    style={S.cellSelect}
                                    defaultValue={empId || ""}
                                    onChange={e => setCellEmp(day, shift.id, e.target.value)}
                                    onBlur={() => setEditCell(null)}
                                  >
                                    <option value="">— frei —</option>
                                    {employees.map(e => (
                                      <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div
                                    style={S.cell(!!empId, shift.color)}
                                    onClick={() => setEditCell({ day, shiftId: shift.id })}
                                    title="Klicken zum Bearbeiten"
                                  >
                                    {empId
                                      ? empName_(empId)
                                      : <span style={{ opacity: 0.25, fontSize: 12 }}>frei</span>}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Hour summary */}
                <div style={S.summaryBox}>
                  <div style={S.sectionLabel}>Stunden-Übersicht · KW {isoWeek(monday)}</div>
                  <div style={S.summaryGrid}>
                    {employees.map(emp => {
                      const ist  = weekHours(emp.id, plan);
                      const pct  = Math.min(100, (ist / emp.targetHours) * 100);
                      const over = ist > emp.targetHours;
                      const under = ist < emp.targetHours * 0.5;
                      return (
                        <div key={emp.id} style={S.summaryCard}>
                          <div style={S.summaryName}>{emp.name}</div>
                          <div style={S.barTrack}>
                            <div style={S.barFill(pct, over)} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: over ? "#f87171" : under ? "#fbbf24" : "#4ade80" }}>
                              {ist}h Ist
                            </span>
                            <span style={{ fontSize: 12, color: "#64748b" }}>{emp.targetHours}h Soll</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ MITARBEITER ══ */}
        {tab === "employees" && (
          <div>
            <div style={S.card}>
              <div style={S.sectionLabel}>Mitarbeiter hinzufügen</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <input
                  style={{ ...S.input, flex: "2 1 160px" }}
                  placeholder="Name"
                  value={empName}
                  onChange={e => setEmpName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addEmployee()}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 90px" }}>
                  <label style={S.inputLabel}>Soll-Std./Woche</label>
                  <input
                    style={S.input}
                    placeholder="40"
                    type="number" min="1"
                    value={empTarget}
                    onChange={e => setEmpTarget(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addEmployee()}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 90px" }}>
                  <label style={S.inputLabel}>Ist-Std. (aktuell)</label>
                  <input
                    style={S.input}
                    placeholder="0"
                    type="number" min="0"
                    value={empIst}
                    onChange={e => setEmpIst(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addEmployee()}
                  />
                </div>
                <button style={{ ...S.primaryBtn, alignSelf: "flex-end" }} onClick={addEmployee}>
                  + Hinzufügen
                </button>
              </div>
            </div>

            {employees.length === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.4 }}>👤</div>
                <p style={{ margin: 0 }}>Noch keine Mitarbeiter angelegt.</p>
              </div>
            ) : (
              employees.map(emp => {
                const ist = weekHours(emp.id, plan);
                return (
                  <div key={emp.id} style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{emp.name}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                          Diese Woche: {ist}h geplant
                        </div>
                      </div>
                      <button style={S.removeBtn} onClick={() => removeEmployee(emp.id)}>✕</button>
                    </div>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={S.inputLabel}>Soll-Stunden / Woche</label>
                        <input
                          style={{ ...S.input, width: 120 }}
                          type="number" min="1"
                          value={emp.targetHours}
                          onChange={e => updateEmp(emp.id, { targetHours: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={S.inputLabel}>Ist-Stunden (manuell)</label>
                        <input
                          style={{ ...S.input, width: 120 }}
                          type="number" min="0"
                          value={emp.istHours ?? 0}
                          onChange={e => updateEmp(emp.id, { istHours: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={S.inputLabel}>Bevorzugte Schichten</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {shiftTypes.map(s => {
                          const on = emp.preferredShifts.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              style={S.shiftTag(on, s.color)}
                              onClick={() => togglePref(emp.id, s.id)}
                            >
                              {on ? "★ " : "☆ "}{s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ══ SCHICHTEN ══ */}
        {tab === "shifts" && (
          <div>
            <div style={S.card}>
              <div style={S.sectionLabel}>Schicht hinzufügen</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <input
                  style={{ ...S.input, flex: "2 1 160px" }}
                  placeholder="Name (z.B. Frühschicht)"
                  value={sfName}
                  onChange={e => setSfName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addShift()}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <label style={S.inputLabel}>Von</label>
                  <input style={{ ...S.input, width: 110 }} type="time" value={sfStart} onChange={e => setSfStart(e.target.value)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <label style={S.inputLabel}>Bis</label>
                  <input style={{ ...S.input, width: 110 }} type="time" value={sfEnd}   onChange={e => setSfEnd(e.target.value)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <label style={S.inputLabel}>Stunden</label>
                  <input style={{ ...S.input, width: 80 }}  type="number" min="1" value={sfHours} onChange={e => setSfHours(e.target.value)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <label style={S.inputLabel}>Farbe</label>
                  <input
                    type="color" value={sfColor} onChange={e => setSfColor(e.target.value)}
                    style={{ width: 44, height: 44, borderRadius: 8, border: "1px solid rgba(148,163,184,0.15)", cursor: "pointer", background: "transparent", padding: 3 }}
                  />
                </div>
                <button style={{ ...S.primaryBtn, alignSelf: "flex-end" }} onClick={addShift}>+ Hinzufügen</button>
              </div>
            </div>

            {shiftTypes.length === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.4 }}>⏰</div>
                <p style={{ margin: 0 }}>Keine Schichten definiert.</p>
              </div>
            ) : (
              shiftTypes.map(s => (
                <div key={s.id} style={{ ...S.card, borderLeft: `4px solid ${s.color}`, paddingLeft: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 17, color: s.color }}>{s.name}</div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                        {s.start} – {s.end} · {s.hours} Stunden
                      </div>
                    </div>
                    <button style={S.removeBtn} onClick={() => removeShift(s.id)}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 56, fontSize: 11, color: "#1e293b" }}>
          Dienstplan Generator v1.0 · PWA
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; -webkit-font-smoothing: antialiased; }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.4); }
        input::placeholder { color: #475569; }
        select option { background: #1e293b; color: #e2e8f0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 3px; }
        button:disabled { opacity: 0.4; cursor: not-allowed !important; }
        @media (max-width: 520px) { h1 { font-size: 28px !important; } }
      `}</style>
    </div>
  );
}

/* ── Styles ── */
const S = {
  wrapper: {
    minHeight: "100dvh",
    background: "linear-gradient(168deg, #0d1117 0%, #151d2b 40%, #1a2744 100%)",
    fontFamily: "'DM Sans', sans-serif",
    color: "#e2e8f0",
    padding: "24px 16px 80px",
    position: "relative",
    overflow: "hidden",
  },
  noise: {
    position: "fixed", inset: 0, opacity: 0.03, pointerEvents: "none", zIndex: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  },
  orb: {
    position: "fixed", width: 400, height: 400, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(56,152,236,0.12) 0%, transparent 70%)",
    top: -100, right: -100, pointerEvents: "none", zIndex: 0,
  },
  container: { maxWidth: 920, margin: "0 auto", position: "relative", zIndex: 1 },
  header:    { marginBottom: 28, textAlign: "center" },
  title: {
    fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 800,
    background: "linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    letterSpacing: "-0.02em", margin: 0,
  },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 6, fontWeight: 300, letterSpacing: "0.07em", textTransform: "uppercase" },
  tabs: {
    display: "flex", gap: 6, marginBottom: 24,
    background: "rgba(255,255,255,0.03)", padding: 6,
    borderRadius: 14, border: "1px solid rgba(148,163,184,0.08)",
    flexWrap: "wrap",
  },
  tab: active => ({
    flex: 1, minWidth: 120, padding: "10px 14px", borderRadius: 10,
    border: active ? "1px solid rgba(59,130,246,0.25)" : "1px solid transparent",
    background: active ? "rgba(59,130,246,0.15)" : "transparent",
    color: active ? "#93c5fd" : "#64748b",
    fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", textAlign: "center",
  }),
  weekNav: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 16, padding: "14px 20px", borderRadius: 12,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.08)",
  },
  navBtn: {
    padding: "9px 18px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(255,255,255,0.04)", color: "#94a3b8",
    fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
  },
  actionRow: { display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  primaryBtn: {
    padding: "11px 20px", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff",
    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
  },
  ghostBtn: {
    padding: "11px 18px", borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.15)", background: "rgba(255,255,255,0.04)",
    color: "#94a3b8", fontSize: 14, fontWeight: 600, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  dangerBtn: {
    padding: "11px 18px", borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)",
    color: "#f87171", fontSize: 14, fontWeight: 600, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  },
  table: {
    width: "100%", borderCollapse: "collapse",
    border: "1px solid rgba(148,163,184,0.08)", borderRadius: 12, overflow: "hidden",
  },
  th: {
    padding: "14px 10px", textAlign: "center",
    background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(148,163,184,0.1)",
    fontSize: 13, fontWeight: 700, color: "#94a3b8",
  },
  td: {
    padding: "8px 8px", textAlign: "center",
    borderBottom: "1px solid rgba(148,163,184,0.06)", verticalAlign: "middle",
  },
  cell: (filled, color) => ({
    padding: "7px 10px", borderRadius: 8, cursor: "pointer",
    background: filled ? `${color}1a` : "transparent",
    border: filled ? `1px solid ${color}40` : "1px solid transparent",
    color: filled ? "#e2e8f0" : "#64748b",
    fontSize: 13, fontWeight: filled ? 600 : 400,
    minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s", whiteSpace: "nowrap",
  }),
  cellSelect: {
    width: "100%", padding: "6px 8px", borderRadius: 8,
    border: "1px solid rgba(59,130,246,0.4)",
    background: "#1e293b", color: "#e2e8f0",
    fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif",
  },
  summaryBox: {
    padding: 20, borderRadius: 14,
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(148,163,184,0.08)",
  },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 14 },
  summaryCard: {
    padding: "14px", borderRadius: 10,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.08)",
  },
  summaryName: { fontSize: 13, fontWeight: 700, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  barTrack: { height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" },
  barFill: (pct, over) => ({
    height: "100%", width: `${pct}%`, borderRadius: 3,
    background: over ? "#ef4444" : pct >= 75 ? "#22c55e" : "#3b82f6",
    transition: "width 0.4s ease",
  }),
  card: {
    marginBottom: 14, padding: "18px 20px", borderRadius: 14,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.08)",
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: "#64748b",
    letterSpacing: "0.1em", textTransform: "uppercase",
  },
  input: {
    padding: "11px 14px", borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(255,255,255,0.04)", color: "#e2e8f0",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
  },
  inputLabel: { fontSize: 11, color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" },
  shiftTag: (on, color) => ({
    padding: "8px 14px", borderRadius: 8,
    border: `1px solid ${on ? color : "rgba(148,163,184,0.15)"}`,
    background: on ? `${color}25` : "rgba(255,255,255,0.03)",
    color: on ? color : "#64748b",
    fontSize: 13, fontWeight: on ? 700 : 400, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif", transition: "all 0.18s",
  }),
  removeBtn: {
    padding: "6px 11px", borderRadius: 6, border: "none",
    background: "rgba(239,68,68,0.08)", color: "#f87171",
    fontSize: 14, cursor: "pointer",
  },
  empty: { textAlign: "center", padding: "56px 20px", color: "#475569", fontSize: 14 },
};
