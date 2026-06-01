import { useState, useRef, useCallback, useEffect } from "react";

function useLocalStorage(key, init) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : init;
    } catch { return init; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

export default function WhatsAppVoice({ anthropicKey, onNeedAnthropicKey }) {
  const [openaiKey, setOpenaiKey] = useLocalStorage("voice-openai-key", "");
  const [keyInput, setKeyInput] = useState("");
  const [showKeySettings, setShowKeySettings] = useState(false);
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    setFile(f);
    setTranscript("");
    setSummary("");
    setError("");
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const doTranscribe = async (audioFile, key) => {
    // Rename .opus → .ogg for Whisper compatibility (same codec, Ogg container)
    let uploadFile = audioFile;
    if (audioFile.name.toLowerCase().endsWith(".opus")) {
      uploadFile = new File([audioFile], audioFile.name.replace(/\.opus$/i, ".ogg"), {
        type: "audio/ogg",
      });
    }
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: formData,
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.text || "";
  };

  const doSummarize = async (text, anthropicApiKey) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: `Fasse diese transkribierte WhatsApp-Sprachnachricht kurz und prägnant zusammen. Erkenne die Kernaussage und liste eventuelle To-Dos, Fragen oder wichtige Informationen stichpunktartig auf. Antworte auf Deutsch.\n\nTranskript:\n${text}`,
          },
        ],
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return (
      data.content
        ?.map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("\n") || ""
    );
  };

  const handleTranscribeAndSummarize = async () => {
    if (!file) return;
    if (!openaiKey) { setShowKeySettings(true); return; }

    setLoadingTranscript(true);
    setError("");
    setTranscript("");
    setSummary("");

    let text = "";
    try {
      text = await doTranscribe(file, openaiKey);
      setTranscript(text);
    } catch (err) {
      setError("Transkription fehlgeschlagen: " + err.message);
      setLoadingTranscript(false);
      return;
    }
    setLoadingTranscript(false);

    if (!anthropicKey) {
      onNeedAnthropicKey?.();
      return;
    }

    setLoadingSummary(true);
    try {
      const sum = await doSummarize(text, anthropicKey);
      setSummary(sum);
    } catch (err) {
      setSummary("Fehler bei Zusammenfassung: " + err.message);
    }
    setLoadingSummary(false);
  };

  const handleTranscribeOnly = async () => {
    if (!file || !openaiKey) { setShowKeySettings(true); return; }
    setLoadingTranscript(true);
    setError("");
    setTranscript("");
    setSummary("");
    try {
      const text = await doTranscribe(file, openaiKey);
      setTranscript(text);
    } catch (err) {
      setError("Transkription fehlgeschlagen: " + err.message);
    }
    setLoadingTranscript(false);
  };

  const handleSummarizeOnly = async () => {
    if (!transcript || !anthropicKey) { onNeedAnthropicKey?.(); return; }
    setLoadingSummary(true);
    try {
      const sum = await doSummarize(transcript, anthropicKey);
      setSummary(sum);
    } catch (err) {
      setSummary("Fehler: " + err.message);
    }
    setLoadingSummary(false);
  };

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {}
  };

  const reset = () => {
    setFile(null);
    setTranscript("");
    setSummary("");
    setError("");
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const isLoading = loadingTranscript || loadingSummary;

  return (
    <div>
      {/* API Key Settings */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          WhatsApp-Sprachnachrichten transkribieren & zusammenfassen
        </div>
        <button
          style={V.ghostBtn}
          onClick={() => { setKeyInput(openaiKey); setShowKeySettings(!showKeySettings); }}
        >
          ⚙ OpenAI Key
        </button>
      </div>

      {showKeySettings && (
        <div style={V.settingsPanel}>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
            <strong style={{ color: "#e2e8f0" }}>OpenAI API-Key (für Transkription)</strong>
            <br />
            Benötigt für Whisper-Transkription.{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#60a5fa" }}
            >
              platform.openai.com
            </a>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...V.input, flex: 1 }}
              type="password"
              placeholder="sk-..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setOpenaiKey(keyInput.trim());
                  setShowKeySettings(false);
                }
              }}
            />
            <button
              style={V.primaryBtn}
              onClick={() => { setOpenaiKey(keyInput.trim()); setShowKeySettings(false); }}
            >
              Speichern
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12 }}>
            {openaiKey ? (
              <span style={{ color: "#4ade80" }}>✓ OpenAI Key gespeichert</span>
            ) : (
              <span style={{ color: "#f87171" }}>✗ Kein OpenAI Key</span>
            )}
            {" · "}
            {anthropicKey ? (
              <span style={{ color: "#4ade80" }}>✓ Anthropic Key gespeichert (für Zusammenfassung)</span>
            ) : (
              <span style={{ color: "#f87171" }}>✗ Kein Anthropic Key (im Inventar-Tab setzen)</span>
            )}
          </div>
        </div>
      )}

      {/* Drop Zone */}
      <div
        style={V.dropZone(dragOver, !!file)}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => { if (!file) fileInputRef.current?.click(); }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.opus,.ogg,.oga,.m4a,.mp3,.mp4,.wav,.webm"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {!file ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎙️</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#e2e8f0", marginBottom: 6 }}>
              Sprachnachricht hier ablegen
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              Unterstützte Formate: .opus · .ogg · .m4a · .mp3 · .wav · .webm
              <br />
              oder klicken zum Auswählen
            </div>
          </div>
        ) : (
          <div style={{ width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 28 }}>🎙️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14, fontWeight: 500, color: "#e2e8f0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {file.name}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {(file.size / 1024).toFixed(0)} KB
                </div>
              </div>
              <button
                style={V.ghostBtn}
                onClick={(e) => { e.stopPropagation(); reset(); }}
              >
                ✕ Entfernen
              </button>
            </div>
            {audioUrl && (
              <audio
                controls
                src={audioUrl}
                style={{ width: "100%", borderRadius: 8, height: 36 }}
              />
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <div style={V.errorBox}>{error}</div>}

      {/* Action Buttons */}
      {file && (
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            style={{ ...V.primaryBtnLarge, opacity: isLoading ? 0.7 : 1 }}
            onClick={handleTranscribeAndSummarize}
            disabled={isLoading}
          >
            {loadingTranscript
              ? "⏳ Transkribiere…"
              : loadingSummary
              ? "⏳ Zusammenfasse…"
              : "🔤✨ Transkribieren & Zusammenfassen"}
          </button>
          {!isLoading && (
            <button
              style={V.ghostBtnMd}
              onClick={handleTranscribeOnly}
              disabled={isLoading}
            >
              🔤 Nur transkribieren
            </button>
          )}
          {transcript && !isLoading && !summary && (
            <button
              style={{ ...V.accentBtn, opacity: isLoading ? 0.7 : 1 }}
              onClick={handleSummarizeOnly}
              disabled={isLoading}
            >
              ✨ Nur zusammenfassen
            </button>
          )}
        </div>
      )}

      {/* Transcript Result */}
      {(transcript || loadingTranscript) && (
        <div style={V.resultBox("blue")}>
          <div style={V.resultHeader}>
            <span style={{ ...V.resultTitle, color: "#93c5fd" }}>🔤 Transkript</span>
            {transcript && (
              <button
                style={V.copyBtn}
                onClick={() => copyToClipboard(transcript, "transcript")}
              >
                {copied === "transcript" ? "✓ Kopiert!" : "📋 Kopieren"}
              </button>
            )}
          </div>
          {loadingTranscript ? (
            <div style={{ color: "#94a3b8", fontSize: 14 }}>
              Sprachnachricht wird transkribiert…
            </div>
          ) : (
            <div style={V.resultText}>{transcript}</div>
          )}
        </div>
      )}

      {/* Summary Result */}
      {(summary || loadingSummary) && (
        <div style={V.resultBox("purple")}>
          <div style={V.resultHeader}>
            <span style={{ ...V.resultTitle, color: "#c4b5fd" }}>✨ Zusammenfassung</span>
            {summary && (
              <button
                style={V.copyBtn}
                onClick={() => copyToClipboard(summary, "summary")}
              >
                {copied === "summary" ? "✓ Kopiert!" : "📋 Kopieren"}
              </button>
            )}
          </div>
          {loadingSummary ? (
            <div style={{ color: "#94a3b8", fontSize: 14 }}>
              Zusammenfassung wird erstellt…
            </div>
          ) : (
            <div style={V.resultText}>{summary}</div>
          )}
        </div>
      )}

      {/* Bottom hint */}
      {!file && (
        <div style={{ textAlign: "center", marginTop: 32, fontSize: 12, color: "#334155", lineHeight: 1.7 }}>
          WhatsApp → Sprachnachricht gedrückt halten → Exportieren → Datei hier ablegen
        </div>
      )}
    </div>
  );
}

/* ── Styles ── */
const V = {
  ghostBtn: {
    padding: "7px 13px", borderRadius: 8,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(255,255,255,0.03)", color: "#94a3b8",
    fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
  },
  ghostBtnMd: {
    padding: "11px 18px", borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(255,255,255,0.03)", color: "#94a3b8",
    fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
  },
  settingsPanel: {
    marginBottom: 20, padding: 18, borderRadius: 12,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.1)",
  },
  input: {
    padding: "11px 15px", borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.15)", background: "rgba(255,255,255,0.04)",
    color: "#e2e8f0", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
  },
  primaryBtn: {
    padding: "11px 18px", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff",
    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
  },
  primaryBtnLarge: {
    padding: "13px 22px", borderRadius: 12, border: "none",
    background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff",
    fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 4px 18px rgba(37,99,235,0.35)",
  },
  accentBtn: {
    padding: "11px 18px", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff",
    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
  },
  dropZone: (dragOver, hasFile) => ({
    border: `2px dashed ${dragOver ? "#3b82f6" : hasFile ? "rgba(59,130,246,0.35)" : "rgba(148,163,184,0.2)"}`,
    borderRadius: 16, padding: 28,
    background: dragOver
      ? "rgba(59,130,246,0.07)"
      : hasFile
      ? "rgba(255,255,255,0.02)"
      : "rgba(255,255,255,0.015)",
    cursor: hasFile ? "default" : "pointer",
    transition: "all 0.2s ease",
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: hasFile ? "auto" : 170,
  }),
  errorBox: {
    marginTop: 12, padding: 14, borderRadius: 10,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
    color: "#fca5a5", fontSize: 13, lineHeight: 1.5,
  },
  resultBox: (color) => ({
    marginTop: 20, padding: 20, borderRadius: 14,
    background: color === "blue" ? "rgba(59,130,246,0.06)" : "rgba(139,92,246,0.06)",
    border: `1px solid ${color === "blue" ? "rgba(59,130,246,0.2)" : "rgba(139,92,246,0.2)"}`,
  }),
  resultHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
  },
  resultTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600,
  },
  copyBtn: {
    padding: "5px 11px", borderRadius: 7,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(255,255,255,0.04)", color: "#94a3b8",
    fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    transition: "color 0.2s",
  },
  resultText: {
    fontSize: 14, lineHeight: 1.75, color: "#cbd5e1",
    whiteSpace: "pre-wrap", fontWeight: 300,
  },
};
