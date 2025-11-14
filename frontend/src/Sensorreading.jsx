// src/Sensorreading.jsx
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Meter from "./component/Meter";
import "./Sensorreading.css";

const SOCKET_URL = "http://192.168.1.32:3000"; // same as your EmergencyDashboard

export default function Sensorreading({ idPrefix = "sensor" }) {
  const [connected, setConnected] = useState(false);
  const [sensors, setSensors] = useState({
    temperature: null,
    humidity: null,
    airQuality: null,
    co2: null,
    o3: null,
    noise: null,
    mqPct: null,
    mqRaw: null,
  });

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket"] });
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    // Listen for sensor updates emitted by server (/api/sensor)
    s.on("sensor", (payload) => {
      // payload: { deviceId, temperature, humidity, mqRaw, mqPct, meta, ts }
      // We map mqPct -> airQuality for UI or expose separately
      setSensors((prev) => ({
        ...prev,
        temperature: payload.temperature ?? prev.temperature,
        humidity: payload.humidity ?? prev.humidity,
        mqRaw: payload.mqRaw ?? prev.mqRaw,
        mqPct: typeof payload.mqPct !== "undefined" ? payload.mqPct : prev.mqPct,
        // map mqPct to airQuality for the existing gauge if you like:
        airQuality: typeof payload.mqPct !== "undefined" ? payload.mqPct : prev.airQuality,
        // other sensors remain unchanged unless you add them on server
      }));
    });

    return () => s.disconnect();
  }, []);

  // fallback display values if null
  const d = {
    temperature: sensors.temperature ?? "--",
    humidity: sensors.humidity ?? "--",
    airQuality: sensors.airQuality ?? sensors.mqPct ?? "--",
    co2: sensors.co2 ?? "--",
    o3: sensors.o3 ?? "--",
    noise: sensors.noise ?? "--",
  };

  return (
    <div className="sensor-container">
      <div style={{ marginBottom: 8, color: connected ? "#16a34a" : "#b91c1c" }}>
        Socket: {connected ? "Connected" : "Disconnected"}
      </div>

      <div className="sensor-grid">
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Temperature" value={d.temperature} unit="°C" min={0} max={50} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Humidity" value={d.humidity} unit="%" min={0} max={100} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Air Quality" value={d.airQuality} unit="%" min={0} max={100} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="CO2 Level" value={d.co2} unit="ppm" min={0} max={2000} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Noise Level" value={d.noise} unit="dB" min={0} max={120} />
        </div>
        <div className="sensor-card">
          <Meter idPrefix={idPrefix} title="Ozone level" value={d.o3} unit="ppb" min={0} max={200} />
        </div>
      </div>
    </div>
  );
}
