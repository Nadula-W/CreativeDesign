// src/Sensorreading.jsx
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Meter from "./component/Meter";
import "./Sensorreading.css";

const SOCKET_URL = "http://192.168.0.102:3000"; // same as your EmergencyDashboard

// ---- helper functions for status text + color ----

// Temperature status (tuned for warm climates)
function getTemperatureStatus(value) {
  if (typeof value !== "number") {
    return { label: "No data", color: "#6b7280", detail: "" };
  }

  if (value < 22) {
    return {
      label: "Cool",
      color: "#0ea5e9",
      detail: "Below typical indoor comfort.",
    };
  }
  if (value >= 22 && value <= 30) {
    return {
      label: "Comfortable",
      color: "#22c55e",
      detail: "Within a good range for most people.",
    };
  }
  if (value > 30 && value <= 35) {
    return {
      label: "Warm",
      color: "#f59e0b",
      detail: "Monitor for heat stress in long shifts.",
    };
  }
  return {
    label: "Hot",
    color: "#ef4444",
    detail: "High heat — reduce exposure if possible.",
  };
}

// Humidity status (tropical / Sri Lanka friendly)
function getHumidityStatus(value) {
  if (typeof value !== "number") {
    return { label: "No data", color: "#6b7280", detail: "" };
  }

  if (value < 70) {
    return {
      label: "Unusually Dry",
      color: "#0ea5e9",
      detail: "Low for Sri Lanka — likely strong AC.",
    };
  }
  if (value >= 70 && value <= 85) {
    return {
      label: "Normal",
      color: "#22c55e",
      detail: "Typical indoor humidity for Sri Lanka.",
    };
  }
  if (value > 85 && value <= 95) {
    return {
      label: "Humid",
      color: "#f59e0b",
      detail: "Common in mornings / rainy days.",
    };
  }
  return {
    label: "Very Humid",
    color: "#ef4444",
    detail: "Risk of condensation & discomfort.",
  };
}

// Air quality status (using inverted score: higher = better)
function getAirQualityStatus(score) {
  if (typeof score !== "number") {
    return { label: "No data", color: "#6b7280", detail: "" };
  }

  if (score >= 80) {
    return {
      label: "Good",
      color: "#22c55e",
      detail: "Clean air, low gas levels detected.",
    };
  }
  if (score >= 50) {
    return {
      label: "Moderate",
      color: "#f59e0b",
      detail: "Some gas detected — keep ventilated.",
    };
  }
  return {
    label: "Poor",
    color: "#ef4444",
    detail: "High gas levels — check ventilation / sources.",
  };
}

// Small reusable status badge
function StatusBadge({ label, detail, color }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: 9999,
          backgroundColor: `${color}22`, // light background
          color,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      {detail && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "#6b7280",
            maxWidth: 220,
          }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}

export default function Sensorreading({ idPrefix = "sensor" }) {
  const [connected, setConnected] = useState(false);
  const [sensors, setSensors] = useState({
    temperature: null,
    humidity: null,
    mqPct: null, // pollution % from MQ sensor
    mqRaw: null,
    co2: null,
    o3: null,
    noise: null,
  });

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket"] });

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    // Listen for sensor updates emitted by server (/api/sensor)
    s.on("sensor", (payload) => {
      // payload: { deviceId, temperature, humidity, mqRaw, mqPct, meta, ts }
      setSensors((prev) => ({
        ...prev,
        temperature:
          typeof payload.temperature !== "undefined"
            ? payload.temperature
            : prev.temperature,
        humidity:
          typeof payload.humidity !== "undefined"
            ? payload.humidity
            : prev.humidity,
        mqRaw:
          typeof payload.mqRaw !== "undefined" ? payload.mqRaw : prev.mqRaw,
        mqPct:
          typeof payload.mqPct !== "undefined" ? payload.mqPct : prev.mqPct,
        // co2, o3, noise can be wired later if you add them on the server
      }));
    });

    return () => s.disconnect();
  }, []);

  // ---- derive display values ----
  const d = {
    temperature: sensors.temperature ?? "--",
    humidity: sensors.humidity ?? "--",
    co2: sensors.co2 ?? "--",
    o3: sensors.o3 ?? "--",
    noise: sensors.noise ?? "--",
  };

  // Convert pollution % (mqPct) into Air Quality Score (higher = better)
  if (typeof sensors.mqPct === "number") {
    const pollution = Math.max(0, Math.min(100, sensors.mqPct)); // clamp 0–100
    d.airQuality = 100 - pollution; // 0 = terrible, 100 = perfect
  } else {
    d.airQuality = "--";
  }

  // Calculate status objects
  const tempStatus = getTemperatureStatus(sensors.temperature);
  const humidityStatus = getHumidityStatus(sensors.humidity);
  const airStatus =
    typeof d.airQuality === "number"
      ? getAirQualityStatus(d.airQuality)
      : { label: "No data", color: "#6b7280", detail: "" };

  return (
    <div className="sensor-container">
      <div
        style={{
          marginBottom: 8,
          color: connected ? "#16a34a" : "#b91c1c",
        }}
      >
        Socket: {connected ? "Connected" : "Disconnected"}
      </div>

      <div className="sensor-grid">
        {/* Temperature */}
        <div className="sensor-card">
          <Meter
            idPrefix={idPrefix}
            title="Temperature"
            value={d.temperature}
            unit="°C"
            min={0}
            max={50}
          />
          <StatusBadge
            label={tempStatus.label}
            detail={tempStatus.detail}
            color={tempStatus.color}
          />
        </div>

        {/* Humidity */}
        <div className="sensor-card">
          <Meter
            idPrefix={idPrefix}
            title="Humidity"
            value={d.humidity}
            unit="%"
            min={0}
            max={100}
          />
          <StatusBadge
            label={humidityStatus.label}
            detail={humidityStatus.detail}
            color={humidityStatus.color}
          />
        </div>

        {/* Air Quality */}
        <div className="sensor-card">
          <Meter
            idPrefix={idPrefix}
            title="Air Quality"
            value={d.airQuality}
            unit="%"
            min={0}
            max={100}
          />
          <StatusBadge
            label={airStatus.label}
            detail={airStatus.detail}
            color={airStatus.color}
          />
          {/* Optional: raw pollution info */}
          {/* <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
            Pollution: {typeof sensors.mqPct === "number" ? `${sensors.mqPct}% of threshold` : "--"}
          </div> */}
        </div>

        {/* CO2 */}
        <div className="sensor-card">
          <Meter
            idPrefix={idPrefix}
            title="CO2 Level"
            value={d.co2}
            unit="ppm"
            min={0}
            max={2000}
          />
        </div>

        {/* Noise */}
        <div className="sensor-card">
          <Meter
            idPrefix={idPrefix}
            title="Noise Level"
            value={d.noise}
            unit="dB"
            min={0}
            max={120}
          />
        </div>

        {/* Ozone */}
        <div className="sensor-card">
          <Meter
            idPrefix={idPrefix}
            title="Ozone Level"
            value={d.o3}
            unit="ppb"
            min={0}
            max={200}
          />
        </div>
      </div>
    </div>
  );
}
