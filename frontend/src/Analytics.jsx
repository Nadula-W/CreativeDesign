import React, { useMemo, useState, useEffect } from "react";
import {
  Container, Row, Col, Card, Button, Form, Table, Badge,
} from "react-bootstrap";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import "./Analytics.css";

// NOTE: Departments are renamed here.
const DEPARTMENTS = ["Department 1", "Department 2", "Department 3", "Department 4"];

const LINE_COLORS = [
  "#00aa33", "#0077ff", "#ff6b6b", "#ffa600", "#8e44ad", "#16a085", "#c0392b"
];

/* ===========================
    DEMO DATA HELPERS
    =========================== */

// time axis helper (returns ['00:00','00:10',...])
const buildTimeAxis = (points = 72, stepMin = 10) =>
  Array.from({ length: points }, (_, i) => {
    const m = i * stepMin;
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  });

// generate a noisy time series around a baseline
const series = (axis, base, noise = 2, drift = 0, machineIndex = 0) =>
  axis.map((t, i) => ({
    time: t,
    // Using (i + machineIndex) ensures a unique time offset for the sine wave
    value: Math.round((base + Math.sin((i + machineIndex) / 6) * noise + (Math.random() - 0.5) * noise + i * drift) * 10) / 10,
  }));

// make department dataset for a sensor
const makeDeptData = (axis, sensor) => {
  // tweaked baselines (now corresponding to Dept 1, 2, 3, 4)
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
    data: series(axis, b[i], 1.6),
  }));
};

// make machines dataset within a department
const makeMachineData = (axis, sensor, departmentName, machineCount = 5) => {
  const base = sensor === "temperature" ? 29 : sensor === "humidity" ? 60 : sensor === "air" ? 36 : sensor === "vibration" ? 1.6 : 2.0;

  return Array.from({ length: machineCount }, (_, i) => ({
    id: `m${i + 1}`,
    name: `Machine ${i + 1}`,
    // Pass the machine index (i) to the series generator to ensure uniqueness
    data: series(axis, base + i * (sensor === "vibration" ? 0.2 : 0.5), 1.5, 0, i),
  }));
};

// KPI & % out-of-range helpers
const avgOf = (arr) => (arr.reduce((a, b) => a + b, 0) / (arr.length || 1));
const pctOutOfRange = (arr, warn) => {
  const n = arr.length || 1;
  const out = arr.filter((v) => v > warn).length;
  return Math.round((out / n) * 100);
};

// default thresholds per sensor (adjust to your site)
const THRESHOLDS = {
  temperature: { warn: 30, crit: 35, unit: "°C", label: "Temperature" },
  humidity:    { warn: 70, crit: 80, unit: "%RH", label: "Humidity" },
  air:         { warn: 60, crit: 100, unit: "AQI", label: "Air Quality" },
  vibration:   { warn: 2.5, crit: 3.5, unit: "mm/s", label: "Vibration" },
  power:       { warn: 3.0, crit: 4.0, unit: "kW", label: "Power" },
};

/* ===========================
    MAIN COMPONENT
    =========================== */

const MACHINE_SENSORS = ["vibration", "power"];

export default function Analytics() {
  const [sensor, setSensor] = useState("power");
  const [compare, setCompare] = useState("departments");
  const [deptKey, setDeptKey] = useState(DEPARTMENTS[0]);
  const [activeMachineId, setActiveMachineId] = useState("m1");

  const [machineCountMap] = useState({
    [DEPARTMENTS[0]]: 4,
    [DEPARTMENTS[1]]: 3,
    [DEPARTMENTS[2]]: 5,
    [DEPARTMENTS[3]]: 4,
  });
  const [timePoints] = useState(72);

  const axis = useMemo(() => buildTimeAxis(timePoints, 10), [timePoints]);
  const thresholds = THRESHOLDS[sensor];

  // Determine if machine comparison is allowed for the current sensor
  const isMachineComparisonAllowed = MACHINE_SENSORS.includes(sensor);

  // useEffect to enforce 'departments' or 'department-deep' comparison mode when a non-machine sensor is selected
  useEffect(() => {
    if (!isMachineComparisonAllowed && (compare === 'machines' || compare === 'machine-deep')) {
        // If the user was in a machine view, default them back to department comparison
        setCompare('departments');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensor]);

  // data
  const deptSeries = useMemo(() => makeDeptData(axis, sensor), [axis, sensor]);
  const machineSeries = useMemo(
    () => makeMachineData(axis, sensor, deptKey, machineCountMap[deptKey] ?? 4),
    [axis, sensor, deptKey, machineCountMap]
  );

  // Find the active department for deep-dive
  const activeDepartment = useMemo(
    () => deptSeries.find(d => d.name === deptKey),
    [deptSeries, deptKey]
  );

  // Find the currently active machine based on state
  const activeMachine = useMemo(
    () => machineSeries.find(m => m.id === activeMachineId),
    [machineSeries, activeMachineId]
  );


  // Derived (KPI strip) for the current compare view
  const kpi = useMemo(() => {
    // --- Department Deep-Dive ---
    if (compare === "department-deep" && activeDepartment) {
        const allVals = activeDepartment.data.map((p) => p.value);
        return {
            merged: activeDepartment.data,
            avg: avgOf(allVals),
            peak: Math.max(...allVals),
            por: pctOutOfRange(allVals, thresholds.warn),
            activeName: activeDepartment.name
        };
    }

    // --- Department Comparison ---
    if (compare === "departments") {
      const merged = axis.map((t, idx) => {
        const row = { time: t };
        deptSeries.forEach((d) => (row[d.name] = d.data[idx].value));
        return row;
      });

      const allVals = deptSeries.flatMap((d) => d.data.map((p) => p.value));
      const avg = avgOf(allVals);
      const peak = Math.max(...allVals);
      const por = pctOutOfRange(allVals, thresholds.warn);

      return { merged, avg, peak, por };
    }

    // --- Machine Comparison ---
    if (compare === "machines") {
      const merged = axis.map((t, idx) => {
        const row = { time: t };
        machineSeries.forEach((m) => (row[m.name] = m.data[idx].value));
        return row;
      });

      const allVals = machineSeries.flatMap((m) => m.data.map((p) => p.value));
      const avg = avgOf(allVals);
      const peak = Math.max(...allVals);
      const por = pctOutOfRange(allVals, thresholds.warn);

      return { merged, avg, peak, por };
    }

    // --- Machine Deep-Dive ---
    if (compare === "machine-deep" && activeMachine) {
        const allVals = activeMachine.data.map((p) => p.value);
        return {
            merged: activeMachine.data,
            avg: avgOf(allVals),
            peak: Math.max(...allVals),
            por: pctOutOfRange(allVals, thresholds.warn),
            activeName: activeMachine.name
        };
    }
    return { merged: [], avg: 0, peak: 0, por: 0, activeName: "N/A" };
  }, [axis, compare, deptSeries, machineSeries, thresholds, activeMachine, activeDepartment]);

  // Bar chart: time above warn threshold (minutes) per series
  const bars = useMemo(() => {
    const stepMin = 10;
    if (compare === "departments") {
      return deptSeries.map((d) => ({
        name: d.name,
        above: d.data.filter((p) => p.value > thresholds.warn).length * stepMin,
      }));
    }
    if (compare === "machines") {
      return machineSeries.map((m) => ({
        name: m.name,
        above: m.data.filter((p) => p.value > thresholds.warn).length * stepMin,
      }));
    }
    return [];
  }, [compare, deptSeries, machineSeries, thresholds]);

  // Determine which series to show in the Summary table
  const summarySeries = useMemo(() => {
    // Show department data for department views or if machine views are not allowed
    if (compare === "departments" || compare === "department-deep" || !isMachineComparisonAllowed) {
        return deptSeries;
    }
    // Show machine data for machine views
    return machineSeries;
  }, [compare, isMachineComparisonAllowed, deptSeries, machineSeries]);


  return (
    <Container fluid className="analytics-wrap">
      {/* Header controls */}
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
            <option
                value="machines"
                disabled={!isMachineComparisonAllowed}
            >
                Machines Comparison
            </option>
            <option
                value="machine-deep"
                disabled={!isMachineComparisonAllowed}
            >
                Machine Deep-Dive
            </option>
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Label>Department</Form.Label>
          <Form.Select
            value={deptKey}
            onChange={(e) => {
                setDeptKey(e.target.value);
                setActiveMachineId("m1"); // Reset machine when dept changes
            }}
            disabled={compare === "departments"}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Form.Select>
        </Col>

        {/* Machine Selector: Only appears in machine deep-dive mode, AND if the sensor is machine-enabled */}
        {isMachineComparisonAllowed && compare === "machine-deep" && (
          <Col md={3}>
            <Form.Label>Machine</Form.Label>
            <Form.Select
              value={activeMachineId}
              onChange={(e) => setActiveMachineId(e.target.value)}
            >
              {machineSeries.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Form.Select>
          </Col>
        )}

        {/* Render buttons in the appropriate column */}
        <Col md={isMachineComparisonAllowed && compare === "machine-deep" ? 3 : 6} className="text-md-end mt-3 mt-md-0 d-flex align-items-end justify-content-end">
            <Button variant="outline-secondary" className="me-2">Export CSV</Button>
            <Button variant="success">Download PNG</Button>
        </Col>
      </Row>

      {/* KPI strip (unchanged) */}
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

      {/* Main comparison chart */}
      <Card className="panel-card mb-3">
        <Card.Body>
          <div className="panel-title mb-2">
            {compare === "departments" && "Department Comparison"}
            {compare === "department-deep" && `Deep-Dive: ${activeDepartment?.name || "N/A"}`}
            {compare === "machines" && `Machines in ${deptKey}`}
            {compare === "machine-deep" && `Deep-Dive: ${activeMachine?.name || "N/A"}`}
          </div>

          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              {compare === "machine-deep" || compare === "department-deep" ? (
                // Deep-Dive Charts (Single Line)
                <LineChart data={kpi.merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line
                        type="monotone"
                        dataKey="value"
                        name={THRESHOLDS[sensor].label}
                        stroke="#00aa33"
                        dot={false}
                    />
                </LineChart>
              ) : (
                // Comparison Charts (Multiple Lines)
                <LineChart data={kpi.merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {/* Build lines dynamically */}
                  {Object.keys(kpi.merged?.[0] || {})
                    .filter((k) => k !== "time")
                    .map((key, idx) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                        dot={false}
                      />
                    ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card.Body>
      </Card>

      {/* Time above threshold bar chart (hidden for all deep-dive modes) */}
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

      {/* Summary table */}
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

                // Only show the active department in department deep-dive mode
                if (compare === "department-deep" && s.name !== deptKey) return null;

                // Only show the active machine in machine deep-dive mode
                if (compare === "machine-deep" && s.id !== activeMachineId) return null;

                return (
                  <tr key={s.name}>
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