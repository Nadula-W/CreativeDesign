// File: src/EmergencyDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = "http://192.168.0.100:3000";

// Only these alerts will display in this dashboard (worker alerts ignored)
const EMERGENCY_TYPES = ["FIRE", "ELECTRICAL", "MEDICAL"];

const ALERT_COLORS = {
  FIRE: "#ff4d4d",
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

  // Emergency cards
  const cards = useMemo(
    () => [
      { key: "FIRE",        label: "Fire Emergency",       desc: "Evacuate immediately & cut power." },
      { key: "ELECTRICAL",  label: "Electrical Hazard",    desc: "Isolate power & use non-conductive tools." },
      { key: "MEDICAL",     label: "Medical Emergency",    desc: "Provide first aid & call assistance." },
    ],
    []
  );

  // ----------------------------
  // 🔊 BOOSTED TEXT-TO-SPEECH VOICE
  // ----------------------------
  const speakAlert = (message) => {
    if (!window.speechSynthesis) return;

    const utter = new SpeechSynthesisUtterance(message);

    // Boosted loudness perception
    utter.rate = 1.25;   // slightly faster = clearer / louder
    utter.pitch = 1.35;  // sharper tone = louder perception
    utter.volume = 1.0;  // max allowed by browser

    // Try to use a louder Google English voice
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      utter.voice =
        voices.find((v) => v.name.includes("Google") && v.lang.includes("en")) ||
        voices.find((v) => v.lang.includes("en")) ||
        voices[0];
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  // Build spoken message text
  const buildMessage = (alert) => {
    const { type, deviceId } = alert;

    switch (type) {
      case "FIRE":
        return `Warning. Fire alert detected from device ${deviceId}. Evacuate immediately.`;
      case "ELECTRICAL":
        return `Electrical hazard detected from device ${deviceId}. Please isolate power immediately.`;
      case "MEDICAL":
        return `Medical emergency reported from device ${deviceId}. Provide first aid and call for support.`;
      default:
        return `Emergency alert detected. Type ${type}. Device ${deviceId}.`;
    }
  };

  // ----------------------------
  // 📜 LOAD ALERT HISTORY (PERSISTENT ACTIVITY)
  // ----------------------------
  const loadHistory = async () => {
    try {
      const resp = await fetch("http://192.168.0.100:3000/api/alerts?limit=100");
      const data = await resp.json();

      if (data.ok && Array.isArray(data.items)) {
        // only show FIRE/ELECTRICAL/MEDICAL in this dashboard
        const filtered = data.items.filter((a) =>
          EMERGENCY_TYPES.includes(a.type)
        );
        setLog(filtered);
        if (filtered.length > 0) {
          setLastAlert(filtered[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load alert history:", err);
    }
  };

  // Initialize siren volume to low
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.2; // 20% volume
    }
  }, []);

  // ----------------------------
  // 🔌 SOCKET.IO CONNECTION
  // ----------------------------
  useEffect(() => {
    // Load past alerts when the dashboard mounts
    loadHistory();

    const s = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = s;

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    s.on("alert", (alert) => {
      console.log("ALERT RECEIVED:", alert);

      // Ignore non-emergency alerts
      if (!EMERGENCY_TYPES.includes(alert.type)) {
        console.log("Ignored alert:", alert.type);
        return;
      }

      // update UI + activity log
      setLastAlert(alert);
      setLog((prev) => [{ ...alert }, ...prev].slice(0, 100));

      // 1️⃣ SPEAK THE ALERT IMMEDIATELY
      const msg = buildMessage(alert);
      speakAlert(msg);

      // 2️⃣ PLAY SIREN AFTER 3 SECONDS (soft)
      if (audioUnlocked && audioRef.current) {
        setTimeout(() => {
          try {
            audioRef.current.volume = 0.2;
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          } catch (e) {
            console.warn("Siren autoplay blocked:", e);
          }
        }, 3000);
      }
    });

    return () => s.disconnect();
  }, [audioUnlocked]);

  // Unlock audio (browser restriction)
  const handleUnlockAudio = () => {
    if (audioRef.current && !audioUnlocked) {
      audioRef.current
        .play()
        .then(() => {
          audioRef.current.pause();
          setAudioUnlocked(true);
        })
        .catch((err) => console.warn("User interaction needed for audio:", err));
    }
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Segoe UI, Roboto, Arial" }}>
      <h2>Emergency Console {connected ? "🟢" : "🟡"}</h2>
      <p style={{ color: "#555" }}>Listening for emergency alerts…</p>

      {!audioUnlocked && (
        <button
          onClick={handleUnlockAudio}
          style={{
            padding: "8px 16px",
            backgroundColor: "#ffc107",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontWeight: "700",
            marginBottom: "16px",
          }}
        >
          🔈 Click to Enable Audio Alerts
        </button>
      )}

      {audioUnlocked && (
        <p style={{ color: "#28a745", fontWeight: "700" }}>✅ Audio Alerts Enabled</p>
      )}

      {/* Alarm Sound */}
      <audio
        ref={audioRef}
        src="https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
        preload="auto"
      />

      {/* Live Alert Banner */}
      {lastAlert && (
        <div
          style={{
            margin: "12px 0 16px",
            padding: "12px 16px",
            borderRadius: "12px",
            color: "#000",
            background: ALERT_COLORS[lastAlert.type],
            fontWeight: "800",
            boxShadow: "0 8px 18px rgba(0,0,0,.15)",
          }}
        >
          🚨 {lastAlert.type} ALERT — Device: {lastAlert.deviceId} —{" "}
          {new Date(lastAlert.ts).toLocaleTimeString()}
        </div>
      )}

      {/* Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.key}
            style={{
              border: "2px solid #eaeaea",
              borderRadius: 16,
              padding: 16,
              background: "#fff",
              boxShadow: "0 6px 16px rgba(0,0,0,.06)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800 }}>{c.label}</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>{c.desc}</div>

            <div
              style={{
                marginTop: 12,
                height: 8,
                borderRadius: 999,
                background:
                  lastAlert?.type === c.key ? ALERT_COLORS[c.key] : "#f1f5f9",
              }}
            />

            <div style={{ marginTop: 10, fontSize: 12 }}>
              {lastAlert?.type === c.key ? "ACTIVE" : "Idle"}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline Log */}
      <h4 style={{ marginTop: 22 }}>Activity</h4>
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 8,
          background: "#fff",
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        {log.length === 0 && (
          <div style={{ padding: 8, color: "#666" }}>No alerts yet.</div>
        )}
        {log.map((a, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderBottom: "1px dashed #eee",
            }}
          >
            <div>
              <b style={{ color: ALERT_COLORS[a.type] || "#111" }}>{a.type}</b>
              <span style={{ color: "#666" }}> — {a.deviceId}</span>
            </div>
            <div style={{ fontSize: 12, color: "#777" }}>
              {new Date(a.ts).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
