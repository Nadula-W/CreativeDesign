// src/Analytics.jsx
import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import { io as ioClient } from "socket.io-client";
import {
  Container, Row, Col, Card, Button, Form, Table, Badge,
} from "react-bootstrap";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import "./Analytics.css";

// ======= CONFIG =======
const SOCKET_URL = "http://192.168.0.100:3000";
const API_BASE = "http://192.168.0.100:3000";
const HISTORY_LIMIT = 72; // points to keep (matches axis default)
const DEPARTMENTS = ["Department 1", "Department 2", "Department 3", "Department 4"];
const MACHINE_SENSORS = ["vibration", "power"];
const LINE_COLORS = [
  "#00aa33", "#0077ff", "#ff6b6b", "#ffa600", "#8e44ad", "#16a085", "#c0392b"
];

const THRESHOLDS = {
  temperature: { warn: 30, crit: 35, unit: "°C", label: "Temperature" },
  humidity:    { warn: 70, crit: 80, unit: "%RH", label: "Humidity" },
  air:         { warn: 60, crit: 100, unit: "AQI", label: "Air Quality" },
  vibration:   { warn: 2.5, crit: 3.5, unit: "mm/s", label: "Vibration" },
  power:       { warn: 3.0, crit: 4.0, unit: "kW", label: "Power" },
};


const DEVICE_REGISTRY = {
  "esp32-01": { deptIndex: 0, machineId: "m1" },
};           

// ---------------- demo helpers (kept for graceful fallback) ----------------
const series = (axisLength, base, noise = 2, drift = 0, machineIndex = 0) =>
  Array.from({ length: axisLength }, (_, i) => ({
    time: `Demo ${i}`, // Use synthetic time for demo only
    value: Math.round((base + Math.sin((i + machineIndex) / 6) * noise + (Math.random() - 0.5) * noise + i * drift) * 10) / 10,
  }));

const makeDeptData = (axisLength, sensor) => {
  const baselines = {
    temperature: [27, 29, 31, 28],
    humidity: [58, 62, 55, 60],
    air: [35, 42, 28, 30],
    vibration: [1.4, 1.8, 2.2, 1.1],
    power: [2.1, 1.8, 2.6, 1.7],
  };
  const b = baselines[sensor] ?? [25, 25, 25, 25];
  return DEPARTMENTS.map((deptName, i) => ({
    name: deptName,
    data: series(axisLength, b[i], 1.6),
  }));
};

const makeMachineData = (axisLength, sensor, departmentName, machineCount = 5) => {
  const base = sensor === "temperature" ? 29 : sensor === "humidity" ? 60 : sensor === "air" ? 36 : sensor === "vibration" ? 1.6 : 2.0;
  return Array.from({ length: machineCount }, (_, i) => ({
    id: `m${i + 1}`,
    name: `Machine ${i + 1}`,
    data: series(axisLength, base + i * (sensor === "vibration" ? 0.2 : 0.5), 1.5, 0, i),
  }));
};

// KPI helpers
const avgOf = (arr) => (arr.reduce((a, b) => a + b, 0) / (arr.length || 1));
const pctOutOfRange = (arr, warn) => {
  const n = arr.length || 1;
  const out = arr.filter((v) => v > warn).length;
  return Math.round((out / n) * 100);
};

// ---------------- mapping helper (uses DEVICE_REGISTRY) ----------------
function mapDeviceToDeptMachine(deviceId = "unknown") {
  if (DEVICE_REGISTRY[deviceId]) {
    const { deptIndex, machineId } = DEVICE_REGISTRY[deviceId];
    const dept = DEPARTMENTS[deptIndex] || DEPARTMENTS[0];
    return { dept, machineId: machineId || "m1" };
  }
  // fallback: place unknown devices in Department 1
  return { dept: DEPARTMENTS[0], machineId: `m_unknown` };
}

// ---------------- build series from liveHistory ----------------
function buildSeriesFromHistory(historyMap, deptKey, sensorField = "temperature", historyLimit = HISTORY_LIMIT) {
  const deptResult = DEPARTMENTS.map((deptName) => {
    const machines = historyMap[deptName] || {};
    const machineArrays = Object.values(machines);
    
    // Find a machine array with data to determine the length and time points
    const referenceArray = machineArrays.find(arr => arr.length > 0) || Array.from({ length: historyLimit });

    const data = Array.from({ length: historyLimit }, (_, idx) => {
      const start = Math.max(0, referenceArray.length - historyLimit);
      
      const vals = machineArrays.map((arr) => {
        const item = arr[start + idx] || null;
        return item && typeof item[sensorField] === "number" ? item[sensorField] : null;
      }).filter((v) => v !== null);
      
      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      
      // Use the time from the reference array (if available) or a placeholder
      const time = referenceArray[start + idx]?.time || `T ${idx}`; 

      return { time, value: Math.round(avg * 10) / 10 };
    });

    return { name: deptName, data };
  });

  const machinesInDept = historyMap[deptKey] || {};
  const machineResult = Object.keys(machinesInDept).map((mid) => {
    const arr = machinesInDept[mid] || [];
    const start = Math.max(0, arr.length - historyLimit);
    const data = Array.from({ length: historyLimit }, (_, i) => {
      const item = arr[start + i] || {};
      return { time: item.time || `T ${i}`, value: typeof item[sensorField] === "number" ? item[sensorField] : 0 };
    });
    return { id: mid, name: mid.replace(/^m/, "Machine "), data };
  });

  return { deptResult, machineResult };
}

// ---------------- MAIN COMPONENT ----------------
export default function Analytics() {
  // UI State
  const [sensor, setSensor] = useState("power");
  const [compare, setCompare] = useState("departments");
  const [deptKey, setDeptKey] = useState(DEPARTMENTS[0]);
  const [activeMachineId, setActiveMachineId] = useState("m1");

  // Internal live history state
  const [liveHistory, setLiveHistory] = useState({});
  const timePoints = HISTORY_LIMIT; // Fixed points for demo fallback

  const thresholds = THRESHOLDS[sensor];
  const isMachineComparisonAllowed = MACHINE_SENSORS.includes(sensor);

  useEffect(() => {
    if (!isMachineComparisonAllowed && (compare === 'machines' || compare === 'machine-deep')) {
      setCompare('departments');
    }
  }, [sensor, compare, isMachineComparisonAllowed]);

  // push reading helper - keeps a capped ring buffer for each machine
  const pushReadingToHistory = (reading) => {
    // reading: { deviceId, temperature, humidity, mqPct, ts }
    const { deviceId, ts: tsRaw, temperature, humidity, mqPct } = reading;
    const ts = tsRaw ? Number(tsRaw) : Date.now();
    const p = mapDeviceToDeptMachine(deviceId || "unknown");
    const dept = p.dept;
    const machineId = p.machineId;
    const time = new Date(ts).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });

    const point = {
      ts,
      time,
      temperature: (typeof temperature === "number") ? temperature : (typeof temperature === "string" ? parseFloat(temperature) : null),
      humidity: (typeof humidity === "number") ? humidity : (typeof humidity === "string" ? parseFloat(humidity) : null),
      mqPct: (typeof mqPct === "number") ? mqPct : (typeof mqPct === "string" ? parseFloat(mqPct) : null),
    };
    
    // Use functional update to safely append the new point
    setLiveHistory((prev) => {
      const prevDept = prev[dept] || {};
      // Create a copy of the existing array and push the new point
      const prevMachineArr = prevDept[machineId] ? [...prevDept[machineId]] : [];
      
      prevMachineArr.push(point);
      
      // Cap the history
      while (prevMachineArr.length > HISTORY_LIMIT) prevMachineArr.shift();

      return {
        ...prev,
        [dept]: {
          ...prevDept,
          [machineId]: prevMachineArr,
        },
      };
    });
  };

  // Fetch initial history + connect socket
  useEffect(() => {
    let socket;
    let mounted = true;

    (async () => {
      try {
        const limit = 300;
        const resp = await axios.get(`${API_BASE}/api/sensors?limit=${limit}`);
        if (!mounted) return;
        if (resp.data && resp.data.items) {
          const items = resp.data.items.slice().reverse();
          const initialHistory = {}; // Consolidate all updates here first

          items.forEach((it) => {
            const reading = {
              deviceId: it.deviceId || "unknown",
              temperature: it.temperature,
              humidity: it.humidity,
              mqPct: it.mqPct,
              ts: it.ts || Date.now(),
            };

            const { dept, machineId } = mapDeviceToDeptMachine(reading.deviceId);
            const time = new Date(Number(reading.ts)).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });

            const point = {
              ts: Number(reading.ts),
              time,
              temperature: typeof reading.temperature === "number" ? reading.temperature : parseFloat(reading.temperature),
              humidity: typeof reading.humidity === "number" ? reading.humidity : parseFloat(reading.humidity),
              mqPct: typeof reading.mqPct === "number" ? reading.mqPct : parseFloat(reading.mqPct),
            };

            initialHistory[dept] = initialHistory[dept] || {};
            initialHistory[dept][machineId] = initialHistory[dept][machineId] || [];
            initialHistory[dept][machineId].push(point);
          });
          
          // Cap the history for each machine before setting state
          Object.values(initialHistory).forEach(deptData => {
            Object.keys(deptData).forEach(machineId => {
              const arr = deptData[machineId];
              if (arr.length > HISTORY_LIMIT) {
                deptData[machineId] = arr.slice(arr.length - HISTORY_LIMIT);
              }
            });
          });
          
          setLiveHistory(initialHistory); // Set state once with consolidated data
        }
      } catch (err) {
        console.error("Failed to load sensor history:", err);
      }
    })();

    try {
      socket = ioClient(SOCKET_URL, { transports: ["websocket"] });
      socket.on("connect", () => console.log("Analytics socket connected", socket.id));
      socket.on("sensor", (payload) => {
        // Real-time updates use the functional setter form safely
        pushReadingToHistory({
          deviceId: payload.deviceId || "unknown",
          temperature: payload.temperature,
          humidity: payload.humidity,
          mqPct: payload.mqPct,
          ts: payload.ts || Date.now(),
        });
      });
      socket.on("disconnect", () => console.log("Analytics socket disconnected"));
    } catch (err) {
      console.error("Socket error", err);
    }

    return () => {
      mounted = false;
      if (socket) socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build series: prefer liveHistory; fallback to demo generators
  const { deptSeries, machineSeries } = useMemo(() => {
    const hasAny = Object.keys(liveHistory).length > 0;
    if (!hasAny) {
      // Use fixed HISTORY_LIMIT for demo data array length
      return {
        deptSeries: makeDeptData(timePoints, sensor),
        machineSeries: makeMachineData(timePoints, sensor, deptKey, 4),
      };
    }
    const sensorField = sensor === "air" ? "mqPct" : sensor;
    const { deptResult, machineResult } = buildSeriesFromHistory(liveHistory, deptKey, sensorField, HISTORY_LIMIT);
    return { deptSeries: deptResult, machineSeries: machineResult };
  }, [liveHistory, sensor, deptKey, timePoints]); // Removed 'axis' dependency

  // KPI derived
  const kpi = useMemo(() => {
    const getAxis = () => {
      // Get the time points from the first series for merging
      const seriesToUse = compare === "machines" || compare === "machine-deep" ? machineSeries : deptSeries;
      return seriesToUse.length > 0 ? seriesToUse[0].data.map(p => p.time) : [];
    };

    if (compare === "department-deep") {
      const active = deptSeries.find(d => d.name === deptKey);
      if (!active) return { merged: [], avg: 0, peak: 0, por: 0, activeName: deptKey };
      const allVals = active.data.map((p) => p.value);
      return { merged: active.data, avg: avgOf(allVals), peak: Math.max(...allVals), por: pctOutOfRange(allVals, thresholds.warn), activeName: active.name };
    }

    if (compare === "departments") {
      const currentAxis = getAxis();
      const merged = currentAxis.map((t, idx) => {
        const row = { time: t };
        deptSeries.forEach((d) => (row[d.name] = d.data[idx]?.value || 0));
        return row;
      });
      const allVals = deptSeries.flatMap((d) => d.data.map((p) => p.value));
      return { merged, avg: avgOf(allVals), peak: Math.max(...allVals), por: pctOutOfRange(allVals, thresholds.warn) };
    }

    if (compare === "machines") {
      const currentAxis = getAxis();
      const merged = currentAxis.map((t, idx) => {
        const row = { time: t };
        machineSeries.forEach((m) => (row[m.name] = m.data[idx]?.value || 0));
        return row;
      });
      const allVals = machineSeries.flatMap((m) => m.data.map((p) => p.value));
      return { merged, avg: avgOf(allVals), peak: Math.max(...allVals), por: pctOutOfRange(allVals, thresholds.warn) };
    }

    if (compare === "machine-deep") {
      const active = machineSeries.find(m => m.id === activeMachineId);
      if (!active) return { merged: [], avg: 0, peak: 0, por: 0, activeName: activeMachineId };
      const allVals = active.data.map((p) => p.value);
      return { merged: active.data, avg: avgOf(allVals), peak: Math.max(...allVals), por: pctOutOfRange(allVals, thresholds.warn), activeName: active.name };
    }

    return { merged: [], avg: 0, peak: 0, por: 0, activeName: "N/A" };
  }, [compare, deptSeries, machineSeries, thresholds, deptKey, activeMachineId]);

  // bars
  const bars = useMemo(() => {
    const stepMin = 10;
    if (compare === "departments") {
      return deptSeries.map((d) => ({ name: d.name, above: d.data.filter((p) => p.value > thresholds.warn).length * stepMin }));
    }
    if (compare === "machines") {
      return machineSeries.map((m) => ({ name: m.name, above: m.data.filter((p) => p.value > thresholds.warn).length * stepMin }));
    }
    return [];
  }, [compare, deptSeries, machineSeries, thresholds]);

  const summarySeries = useMemo(() => {
    // Filter summary series for deep dives to only show the relevant item
    if (compare === "department-deep") {
        return deptSeries.filter(s => s.name === deptKey);
    }
    if (compare === "machine-deep") {
        return machineSeries.filter(s => s.id === activeMachineId);
    }
    
    // For comparison views, show all relevant series (departments or machines)
    if (compare === "departments") {
        return deptSeries;
    }
    if (compare === "machines") {
        return machineSeries;
    }
    
    return [];
  }, [compare, deptSeries, machineSeries, deptKey, activeMachineId]);


  return (
    <Container fluid className="analytics-wrap">
      <Row className="mb-3 align-items-end">
        <Col md={3}>
          <Form.Label>Sensor</Form.Label>
          <Form.Select value={sensor} onChange={(e) => setSensor(e.target.value)}>
            <option value="temperature">Temperature</option>
            <option value="humidity">Humidity</option>
            <option value="air">Air Quality</option>
            <option value="vibration">Vibration</option>
            <option value="power">Power</option>
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Label>Compare</Form.Label>
          <Form.Select value={compare} onChange={(e) => setCompare(e.target.value)}>
            <option value="departments">Departments Comparison</option>
            <option value="department-deep">Department Deep-Dive</option>
            <option value="machines" disabled={!isMachineComparisonAllowed}>Machines Comparison</option>
            <option value="machine-deep" disabled={!isMachineComparisonAllowed}>Machine Deep-Dive</option>
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Label>Department</Form.Label>
          <Form.Select
            value={deptKey}
            onChange={(e) => { setDeptKey(e.target.value); setActiveMachineId("m1"); }}
            disabled={compare === "departments"}
          >
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Form.Select>
        </Col>

        {isMachineComparisonAllowed && compare === "machine-deep" && (
          <Col md={3}>
            <Form.Label>Machine</Form.Label>
            <Form.Select value={activeMachineId} onChange={(e) => setActiveMachineId(e.target.value)}>
              {machineSeries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Form.Select>
          </Col>
        )}

        <Col md={isMachineComparisonAllowed && compare === "machine-deep" ? 3 : 6} className="text-md-end mt-3 mt-md-0 d-flex align-items-end justify-content-end">
          <Button variant="outline-secondary" className="me-2">Export CSV</Button>
          <Button variant="success">Download PNG</Button>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col md={4}>
          <Card className="kpi-card">
            <Card.Body>
              <Card.Title>Average</Card.Title>
              <div className="kpi-value">
                {kpi.avg?.toFixed(1)} <span className="unit">{thresholds.unit}</span>
              </div>
              <div className="kpi-sub">{THRESHOLDS[sensor].label}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="kpi-card">
            <Card.Body>
              <Card.Title>Peak</Card.Title>
              <div className="kpi-value">
                {kpi.peak?.toFixed?.(1) ?? kpi.peak} <span className="unit">{thresholds.unit}</span>
              </div>
              <div className="kpi-sub">Max within range</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="kpi-card">
            <Card.Body>
              <Card.Title>% Out of Range</Card.Title>
              <div className="kpi-value">
                {kpi.por || 0} <span className="unit">%</span>
              </div>
              <div className="kpi-sub">&gt; {thresholds.warn} {thresholds.unit}</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="panel-card mb-3">
        <Card.Body>
          <div className="panel-title mb-2">
            {compare === "departments" && "Department Comparison"}
            {compare === "department-deep" && `Deep-Dive: ${deptKey}`}
            {compare === "machines" && `Machines in ${deptKey}`}
            {compare === "machine-deep" && `Deep-Dive: ${activeMachineId}`}
          </div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              {compare === "machine-deep" || compare === "department-deep" ? (
                <LineChart data={kpi.merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" name={THRESHOLDS[sensor].label} stroke="#00aa33" dot={false} />
                </LineChart>
              ) : (
                <LineChart data={kpi.merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {Object.keys(kpi.merged?.[0] || {}).filter((k) => k !== "time").map((key, idx) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={LINE_COLORS[idx % LINE_COLORS.length]} dot={false} />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card.Body>
      </Card>

      {compare !== "machine-deep" && compare !== "department-deep" && (
        <Card className="panel-card mb-3">
          <Card.Body>
            <div className="panel-title mb-2">Time Above {thresholds.warn} {thresholds.unit}</div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={bars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `${v}m`} />
                  <Tooltip formatter={(v) => [`${v} minutes`, "Above Threshold"]} />
                  <Bar dataKey="above" fill="#00cc55" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card.Body>
        </Card>
      )}

      <Card className="panel-card">
        <Card.Body>
          <div className="panel-title mb-2">Summary</div>
          <Table hover responsive className="summary-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-end">Average</th>
                <th className="text-end">Peak</th>
                <th className="text-end">% Out of Range</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summarySeries.map((s) => {
                const vals = s.data.map((p) => p.value);
                const avg = avgOf(vals);
                const peak = Math.max(...vals);
                const por = pctOutOfRange(vals, thresholds.warn);
                const status = peak >= thresholds.crit ? "Critical" : peak >= thresholds.warn ? "Warning" : "Normal";
                const variant = status === "Critical" ? "danger" : status === "Warning" ? "warning" : "success";

                return (
                  <tr key={s.id || s.name}>
                    <td>{s.name}</td>
                    <td className="text-end">{avg.toFixed(1)} {thresholds.unit}</td>
                    <td className="text-end">{peak.toFixed(1)} {thresholds.unit}</td>
                    <td className="text-end">{por}%</td>
                    <td><Badge bg={variant}>{status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Container>
  );
}