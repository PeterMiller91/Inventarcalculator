import { useState, useRef, useEffect, useCallback } from "react";

/* ── Persistent Storage Hook ── */
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

/* ── App ── */
export default function App() {
  const [items, setItems] = useLocalStorage("inventar-items", []);
  const [input, setInput] = useState("");
  const [recipes, setRecipes] = useState("");
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [flashIndex, setFlashIndex] = useState(null);
  const [apiKey, setApiKey] = useLocalStorage("inventar-apikey", "");
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const inputRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,300&family=Playfair+Display:wght@600;800&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Item Actions ── */
  const addItem = useCallback(() => {
    const name = input.trim();
    if (!name) return;
    const existing = items.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
      const updated = [...items];
      updated[existing].count += 1;
      setItems(updated);
      setFlashIndex(existing);
    } else {
      setItems([...items, { name, count: 1 }]);
      setFlashIndex(items.length);
    }
    setTimeout(() => setFlashIndex(null), 500);
    setInput("");
    inputRef.current?.focus();
  }, [input, items, setItems]);

  const handleKeyDown = (e) => { if (e.key === "Enter") addItem(); };

  const increment = (idx) => {
    const updated = [...items]; updated[idx].count += 1; setItems(updated);
  };
  const decrement = (idx) => {
    const updated = [...items];
    if (updated[idx].count <= 1) updated.splice(idx, 1);
    else updated[idx].count -= 1;
    setItems(updated);
  };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const totalItems = items.reduce((sum, i) => sum + i.count, 0);

  /* ── Export CSV ── */
  const exportCSV = () => {
    const header = "Produkt;Anzahl\n";
    const rows = items.map(i => `${i.name};${i.count}`).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inventar_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const colW1 = 320, colW2 = 120, tableW = colW1 + colW2;
    const rowH = 32, headerH = 38, startX = 60;
    let y = 120;
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let rects = "", texts = "";

    texts += `<text x="${startX}" y="70" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="bold" fill="#1a2332">Inventarliste</text>`;
    texts += `<text x="${startX}" y="92" font-family="Helvetica,Arial,sans-serif" font-size="10" fill="#8896a7">${new Date().toLocaleDateString("de-DE")} — ${items.length} Produkte, ${totalItems} Einheiten</text>`;

    rects += `<rect x="${startX}" y="${y}" width="${tableW}" height="${headerH}" fill="#1a2332" rx="4"/>`;
    texts += `<text x="${startX+16}" y="${y+24}" font-family="Helvetica,Arial,sans-serif" font-size="12" font-weight="bold" fill="#fff">Produkt</text>`;
    texts += `<text x="${startX+colW1+colW2/2}" y="${y+24}" font-family="Helvetica,Arial,sans-serif" font-size="12" font-weight="bold" fill="#fff" text-anchor="middle">Anzahl</text>`;
    y += headerH;

    items.forEach((item, i) => {
      const bg = i % 2 === 0 ? "#f4f6f9" : "#ffffff";
      rects += `<rect x="${startX}" y="${y}" width="${tableW}" height="${rowH}" fill="${bg}"/>`;
      texts += `<text x="${startX+16}" y="${y+21}" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#2c3e50">${esc(item.name)}</text>`;
      texts += `<text x="${startX+colW1+colW2/2}" y="${y+21}" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#2c3e50" text-anchor="middle">${item.count}</text>`;
      y += rowH;
    });
    rects += `<rect x="${startX}" y="${y}" width="${tableW}" height="2" fill="#1a2332" rx="1"/>`;

    const pageH = Math.max(y + 80, 600);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${pageH}">${rects}${texts}</svg>`;
    const html = `<!DOCTYPE html><html><head><title>Inventarliste</title><style>@media print{@page{size:A4;margin:20mm}body{margin:0}}</style></head><body>${svg}<script>window.print();<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    setShowExportMenu(false);
  };

  /* ── AI Recipes ── */
  const fetchRecipes = async () => {
    if (items.length === 0) return;
    if (!apiKey) { setShowSettings(true); return; }
    setLoadingRecipes(true); setRecipes("");
    const ingredientList = items.map(i => `${i.count}x ${i.name}`).join(", ");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: `Du bist ein kreativer Koch-Assistent. Ich habe folgende Zutaten im Inventar: ${ingredientList}. Schlage mir 3 kreative Rezepte vor, die ich mit diesen Zutaten (ganz oder teilweise) kochen kann. Formatiere es übersichtlich mit Emoji, Rezeptnamen, kurzer Zutatenliste und 2-3 Sätzen Anleitung pro Rezept. Antworte auf Deutsch.`
          }]
        })
      });
      const data = await res.json();
      if (data.error) {
        setRecipes("Fehler: " + (data.error.message || JSON.stringify(data.error)));
      } else {
        const text = data.content?.map(b => b.type === "text" ? b.text : "").filter(Boolean).join("\n");
        setRecipes(text || "Keine Antwort erhalten.");
      }
    } catch (err) {
      setRecipes("Fehler: " + err.message);
    }
    setLoadingRecipes(false);
  };

  /* ── Save API Key ── */
  const saveApiKey = () => {
    setApiKey(keyInput.trim());
    setShowSettings(false);
  };

  return (
    <div style={S.wrapper}>
      <div style={S.noiseOverlay} />
      <div style={S.glowOrb} />

      <div style={S.container}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
            <h1 style={S.title}>Inventar</h1>
            <button
              style={S.settingsBtn}
              onClick={() => { setKeyInput(apiKey); setShowSettings(!showSettings); }}
              title="Einstellungen"
            >⚙</button>
          </div>
          <p style={S.subtitle}>Bestand erfassen · Rezepte entdecken</p>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div style={S.settingsPanel}>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>
              <strong style={{ color: "#e2e8f0" }}>API-Key Einstellung</strong><br />
              Für Rezeptvorschläge brauchst du einen Anthropic API-Key.<br />
              Hol dir einen auf <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>console.anthropic.com</a>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...S.input, flex: 1, fontSize: 13 }}
                type="password"
                placeholder="sk-ant-..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveApiKey()}
              />
              <button style={{ ...S.addBtn, fontSize: 13, padding: "10px 16px" }} onClick={saveApiKey}>
                Speichern
              </button>
            </div>
            {apiKey && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 8 }}>✓ API-Key gespeichert</div>}
          </div>
        )}

        {/* Input */}
        <div style={S.inputRow}>
          <input
            ref={inputRef}
            style={S.input}
            type="text"
            placeholder="Produkt hinzufügen …"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button style={S.addBtn} onClick={addItem}>+ Erfassen</button>
        </div>

        {/* Stats */}
        {items.length > 0 && (
          <div style={S.statsBar}>
            <span style={S.statText}>
              {items.length} Produkt{items.length !== 1 ? "e" : ""} · {totalItems} Einheit{totalItems !== 1 ? "en" : ""}
            </span>
            <button style={S.clearAllBtn} onClick={() => { setItems([]); setRecipes(""); }}>
              Alle löschen
            </button>
          </div>
        )}

        {/* Table */}
        {items.length > 0 ? (
          <div style={S.tableWrap}>
            <div style={S.tableHeader}>
              <span style={S.thText}>Produkt</span>
              <span style={{ ...S.thText, textAlign: "center" }}>Anzahl</span>
              <span style={{ ...S.thText, textAlign: "center" }}>+/−</span>
              <span />
            </div>
            {items.map((item, idx) => (
              <div key={item.name} style={S.row(flashIndex === idx)}>
                <span style={S.productName}>{item.name}</span>
                <div style={{ textAlign: "center" }}>
                  <span style={S.countBadge}>{item.count}</span>
                </div>
                <div style={S.counterBtns}>
                  <button style={S.cBtn("minus")} onClick={() => decrement(idx)}>−</button>
                  <button style={S.cBtn("plus")} onClick={() => increment(idx)}>+</button>
                </div>
                <button style={S.removeBtn} onClick={() => removeItem(idx)}>✕</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={S.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📦</div>
            <p style={{ fontSize: 14, fontStyle: "italic", fontWeight: 300 }}>
              Noch keine Produkte erfasst.
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={S.footer}>
          <div style={{ position: "relative" }} ref={exportRef}>
            <button style={S.footerBtn("export")} onClick={() => items.length > 0 && setShowExportMenu(!showExportMenu)}>
              ↓ Exportieren
            </button>
            {showExportMenu && (
              <div style={S.dropdownMenu}>
                <button style={S.dropdownItem} onClick={exportCSV}>📄 CSV exportieren</button>
                <button style={S.dropdownItem} onClick={exportPDF}>📑 PDF drucken</button>
              </div>
            )}
          </div>
          <button style={S.footerBtn("recipe")} onClick={() => items.length > 0 && !loadingRecipes && fetchRecipes()}>
            🍳 {loadingRecipes ? "Lädt…" : "Rezeptvorschläge"}
          </button>
        </div>

        {/* Recipes */}
        {(recipes || loadingRecipes) && (
          <div style={S.recipeBox}>
            <div style={S.recipeTitle}>🍽️ Rezeptvorschläge</div>
            {loadingRecipes ? (
              <div style={{ color: "#94a3b8", fontSize: 14 }}>Rezepte werden generiert…</div>
            ) : (
              <div style={S.recipeContent}>{recipes}</div>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 40, fontSize: 11, color: "#334155" }}>
          Inventar Kalkulator v1.0 · PWA
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; -webkit-font-smoothing: antialiased; }
        input::placeholder { color: #475569; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 3px; }
        @media (max-width: 480px) {
          h1 { font-size: 28px !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Styles ── */
const S = {
  wrapper: {
    minHeight: "100vh",
    minHeight: "100dvh",
    background: "linear-gradient(168deg, #0d1117 0%, #151d2b 40%, #1a2744 100%)",
    fontFamily: "'DM Sans', sans-serif",
    color: "#e2e8f0",
    padding: "24px 16px 80px",
    position: "relative",
    overflow: "hidden",
  },
  noiseOverlay: {
    position: "fixed", inset: 0, opacity: 0.03, pointerEvents: "none", zIndex: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  },
  glowOrb: {
    position: "fixed", width: 400, height: 400, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(56,152,236,0.12) 0%, transparent 70%)",
    top: -100, right: -100, pointerEvents: "none", zIndex: 0,
  },
  container: { maxWidth: 640, margin: "0 auto", position: "relative", zIndex: 1 },
  header: { marginBottom: 28, textAlign: "center" },
  title: {
    fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 800,
    background: "linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    letterSpacing: "-0.02em", margin: 0,
  },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 6, fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" },
  settingsBtn: {
    width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(255,255,255,0.04)", color: "#64748b", fontSize: 16,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  settingsPanel: {
    marginBottom: 20, padding: 18, borderRadius: 12,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.1)",
    backdropFilter: "blur(12px)",
  },
  inputRow: { display: "flex", gap: 10, marginBottom: 28 },
  input: {
    flex: 1, padding: "14px 18px", borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.15)", background: "rgba(255,255,255,0.04)",
    color: "#e2e8f0", fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: "none",
    transition: "border-color 0.25s ease",
  },
  addBtn: {
    padding: "14px 20px", borderRadius: 12, border: "none",
    background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff",
    fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    boxShadow: "0 4px 16px rgba(37,99,235,0.3)", fontFamily: "'DM Sans', sans-serif",
  },
  statsBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "0 4px" },
  statText: { fontSize: 12, color: "#64748b", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" },
  clearAllBtn: {
    padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)",
    background: "rgba(239,68,68,0.06)", color: "#f87171", fontSize: 11,
    fontWeight: 600, cursor: "pointer", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif",
  },
  tableWrap: {
    borderRadius: 14, overflow: "hidden",
    border: "1px solid rgba(148,163,184,0.08)", background: "rgba(255,255,255,0.01)",
  },
  tableHeader: {
    display: "grid", gridTemplateColumns: "1fr 72px 100px 32px",
    alignItems: "center", padding: "10px 14px",
    background: "rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(148,163,184,0.1)",
  },
  thText: { fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase" },
  row: (flash) => ({
    display: "grid", gridTemplateColumns: "1fr 72px 100px 32px",
    alignItems: "center", padding: "12px 14px",
    background: flash ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.02)",
    borderBottom: "1px solid rgba(148,163,184,0.06)", transition: "background 0.3s ease",
  }),
  productName: { fontSize: 15, fontWeight: 500, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  countBadge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 34, height: 28, borderRadius: 8,
    background: "rgba(59,130,246,0.12)", color: "#93c5fd",
    fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums",
  },
  counterBtns: { display: "flex", gap: 6, justifyContent: "center" },
  cBtn: (v) => ({
    width: 34, height: 34, borderRadius: 8,
    border: "1px solid rgba(148,163,184,0.12)",
    background: v === "minus" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
    color: v === "minus" ? "#f87171" : "#4ade80",
    fontSize: 18, fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  }),
  removeBtn: {
    width: 28, height: 28, borderRadius: 6, border: "none",
    background: "transparent", color: "#475569", fontSize: 14,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  emptyState: { textAlign: "center", padding: "48px 20px", color: "#475569" },
  footer: { marginTop: 28, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  footerBtn: (v) => ({
    padding: "12px 22px", borderRadius: 10,
    border: v === "recipe" ? "none" : "1px solid rgba(148,163,184,0.15)",
    background: v === "recipe" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(255,255,255,0.04)",
    color: v === "recipe" ? "#fff" : "#94a3b8",
    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    display: "flex", alignItems: "center", gap: 8,
    boxShadow: v === "recipe" ? "0 4px 16px rgba(217,119,6,0.25)" : "none",
  }),
  dropdownMenu: {
    position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
    transform: "translateX(-50%)", background: "#1e293b",
    border: "1px solid rgba(148,163,184,0.15)", borderRadius: 10,
    padding: 6, zIndex: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", minWidth: 160,
  },
  dropdownItem: {
    display: "block", width: "100%", padding: "10px 16px",
    border: "none", background: "transparent", color: "#e2e8f0",
    fontSize: 14, cursor: "pointer", borderRadius: 6, textAlign: "left",
    fontFamily: "'DM Sans', sans-serif",
  },
  recipeBox: {
    marginTop: 32, padding: 24, borderRadius: 14,
    background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)",
  },
  recipeTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600,
    color: "#fbbf24", marginBottom: 16, display: "flex", alignItems: "center", gap: 10,
  },
  recipeContent: { fontSize: 14, lineHeight: 1.7, color: "#cbd5e1", whiteSpace: "pre-wrap", fontWeight: 300 },
};
