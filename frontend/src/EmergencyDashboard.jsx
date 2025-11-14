// File: src/EmergencyDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = "http://192.168.1.32:3000"; 


const ALERT_COLORS = {
  FIRE:     "#ff4d4d",
  ELECTRICAL: "#ffa500", 
  MEDICAL: "#1e90ff",
};

export default function EmergencyDashboard() {
  const [connected, setConnected] = useState(false);
  const [lastAlert, setLastAlert] = useState(null);
  const [log, setLog] = useState([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false); 
  const audioRef = useRef(null);
  const socketRef = useRef(null);

  const cards = useMemo(() => ([
    { key: "FIRE",    label: "Fire Emergency",    desc: "Evacuate and cut power." },
    { key: "ELECTRICAL", label: "Electrical Hazard", desc: "Isolate power & use non-conductive tools." },
    { key: "MEDICAL", label: "Medical Emergency", desc: "First aid & call support." },
  ]), []);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = s;

    s.on("connect",    () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    s.on("alert", (alert) => {
      // Log for debugging socket reception
      console.log("Alert received via Socket.IO:", alert.type);
      
      setLastAlert(alert);
      setLog((prev) => [{ ...alert }, ...prev].slice(0, 100));
      
      if (audioUnlocked) {
        try { 
          audioRef.current.currentTime = 0; 
          audioRef.current?.play(); 
        } catch (e) {
            console.error("Autoplay blocked, even with unlock:", e);
        }
      }
    });

    return () => s.disconnect();
  }, [audioUnlocked]);

  const handleUnlockAudio = () => {
    if (audioRef.current && !audioUnlocked) {
      try {
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          setAudioUnlocked(true);
        }).catch(error => {
          console.error("Could not play on click, may still be blocked:", error);
        });
      } catch (error) {
        console.error("Failed to unlock audio:", error);
      }
    }
  };


  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial" }}>
      <h2>Emergency Console {connected ? "🟢" : "🟡"}</h2>
      <p style={{ color: "#555" }}>Listening for button presses from ESP32 devices…</p>

      {/* Button to enable audio */}
      {!audioUnlocked && (
        <button 
          onClick={handleUnlockAudio} 
          style={{ 
            padding: "8px 16px", 
            backgroundColor: "#ffc107", 
            color: "#000", 
            border: "none", 
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 700,
            marginBottom: "16px"
          }}
        >
          🔈 Click to Enable Alert Sound
        </button>
      )}
      {audioUnlocked && (
        <p style={{ color: "#28a745", fontWeight: 600, marginBottom: "16px" }}>
          ✅ Alert Sound Enabled
        </p>
      )}

      {/* Siren audio */}
      <audio ref={audioRef} src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" preload="auto" />

      {/* Live banner */}
      {lastAlert && (
        <div
          style={{
            margin: "12px 0 16px",
            padding: "12px 16px",
            borderRadius: 12,
            color: "#000",
            background: ALERT_COLORS[lastAlert.type] || "#00ff0a",
            boxShadow: "0 8px 18px rgba(0,0,0,.15)",
            fontWeight: 800,
            letterSpacing: .3,
          }}
        >
          🚨 {lastAlert.type} ALERT — Device: {lastAlert.deviceId} — {new Date(lastAlert.ts).toLocaleTimeString()}
        </div>
      )}

      {/* Three cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 12
      }}>
        {cards.map(c => (
          <div key={c.key}
                style={{
                border: "2px solid #eaeaea",
                borderRadius: 16,
                padding: 16,
                background: "#fff",
                boxShadow: "0 6px 16px rgba(0,0,0,.06)"
              }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{c.label}</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>{c.desc}</div>
            <div style={{
              marginTop: 12,
              height: 8,
              borderRadius: 999,
              background: (lastAlert?.type === c.key) ? ALERT_COLORS[c.key] : "#f1f5f9"
            }} />
            <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}>
              {(lastAlert?.type === c.key) ? "ACTIVE" : "Idle"}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <h4 style={{ marginTop: 22 }}>Activity</h4>
      <div style={{
        border: "1px solid #eee",
        borderRadius: 12,
        background: "#fff",
        padding: 8,
        maxHeight: 260,
        overflowY: "auto"
      }}>
        {log.length === 0 && <div style={{ color: "#666", fontSize: 13, padding: 8 }}>No alerts yet.</div>}
        {log.map((a, idx) => (
          <div key={idx} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 10px", borderBottom: "1px dashed #eee"
          }}>
            <div>
              <b style={{ color: ALERT_COLORS[a.type] || "#111" }}>{a.type}</b>
              <span style={{ color: "#666" }}> — {a.deviceId}</span>
            </div>
            <div style={{ color: "#777", fontSize: 12 }}>{new Date(a.ts).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}