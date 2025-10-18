
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Row, Col, Badge, Button, Table, ProgressBar } from "react-bootstrap";
export default function PowerPanel({
  deptName = "Department",
  machineCount = 5,         // number of machines in this department
  onClose = () => {},       // callback to hide panel
  simulate = true           // true = random demo readings
}) {
  // Build machine list once
  const machines = useMemo(
    () =>
      Array.from({ length: machineCount }, (_, i) => ({
        id: `${deptName}-m${i + 1}`,
        name: `Machine ${i + 1}`,
      })),
    [deptName, machineCount]
  );

  // Per-machine states
  const [powerW, setPowerW] = useState(() =>
    Object.fromEntries(machines.map((m) => [m.id, 0]))
  );
  const [energyWh, setEnergyWh] = useState(() =>
    Object.fromEntries(machines.map((m) => [m.id, 0]))
  );
  const [lastTs, setLastTs] = useState(() =>
    Object.fromEntries(machines.map((m) => [m.id, Date.now()]))
  );
  const [lastSeen, setLastSeen] = useState(() =>
    Object.fromEntries(machines.map((m) => [m.id, "—"]))
  );
  const [peakW, setPeakW] = useState(() =>
    Object.fromEntries(machines.map((m) => [m.id, 0]))
  );

  // Dept health
  const [onlinePct, setOnlinePct] = useState(98);

  const timersRef = useRef({});

  useEffect(() => {
    if (!simulate) return;

    // Start a small interval per machine to simulate readings
    machines.forEach((m, idx) => {
      if (timersRef.current[m.id]) return;
      timersRef.current[m.id] = setInterval(() => {
        const watts = Math.round(1200 + Math.random() * 2200 + (idx % 2 ? 300 : 0)); // vary a bit
        handleNewReading(m.id, watts);
      }, 2000 + (idx % 3) * 500); // stagger intervals slightly
    });

    return () => {
      // clear all timers on unmount
      Object.values(timersRef.current).forEach(clearInterval);
      timersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate, machines]);

  function handleNewReading(machineId, watts) {
    const now = Date.now();
    const prevTs = lastTs[machineId] ?? now;
    const dtHours = Math.max(0, (now - prevTs) / 3600000);

    setEnergyWh((prev) => ({ ...prev, [machineId]: prev[machineId] + watts * dtHours }));
    setPowerW((prev) => ({ ...prev, [machineId]: watts }));
    setLastTs((prev) => ({ ...prev, [machineId]: now }));
    setLastSeen((prev) => ({ ...prev, [machineId]: "Live • just now" }));
    setPeakW((prev) => ({ ...prev, [machineId]: Math.max(prev[machineId] || 0, watts) }));

    // wiggle online health
    setOnlinePct((p) => Math.max(90, Math.min(100, p + (Math.random() - 0.5) * 0.5)));
  }

  // Derived department totals
  const deptPowerNow = machines
    .map((m) => powerW[m.id] || 0)
    .reduce((a, b) => a + b, 0);

  const deptEnergyKWh = (
    machines.map((m) => energyWh[m.id] || 0).reduce((a, b) => a + b, 0) / 1000
  ).toFixed(3);

  const deptPeakW = machines
    .map((m) => peakW[m.id] || 0)
    .reduce((a, b) => a + b, 0);

  // Simple status per machine
  const getStatus = (w) => (w >= 3200 ? "Critical" : w >= 2600 ? "Warning" : "Normal");
  const statusVariant = (s) => (s === "Critical" ? "danger" : s === "Warning" ? "warning" : "success");

  // Reset counters
  function resetAll() {
    setEnergyWh(Object.fromEntries(machines.map((m) => [m.id, 0])));
    setLastTs(Object.fromEntries(machines.map((m) => [m.id, Date.now()])));
    setPeakW(Object.fromEntries(machines.map((m) => [m.id, powerW[m.id] || 0])));
  }

  return (
    <div className="inline-panel">
      {/* Header */}
      <div className="inline-head">
        <div className="inline-title">
          <span>{deptName} — Power</span>
          <Badge bg="secondary" className="ms-2">{machines.length} machines</Badge>
        </div>
        <div className="inline-actions">
          <Button size="sm" variant="outline-light" onClick={resetAll}>Reset</Button>
          <Button size="sm" variant="success" onClick={onClose}>Close</Button>
        </div>
      </div>

      {/* KPIs */}
      <Row className="g-3">
        <Col md={4}>
          <Card className="kpi-card">
            <Card.Body>
              <Card.Title>Dept Power Now</Card.Title>
              <div className="kpi-value">
                {deptPowerNow.toLocaleString()} <span className="unit">W</span>
              </div>
              <div className="kpi-sub">Live • ~2s</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="kpi-card">
            <Card.Body>
              <Card.Title>Energy Elapsed</Card.Title>
              <div className="kpi-value">
                {deptEnergyKWh} <span className="unit">kWh</span>
              </div>
              <div className="kpi-sub">Since open/reset</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="kpi-card">
            <Card.Body>
              <Card.Title>Dept Peak Power</Card.Title>
              <div className="kpi-value">
                {deptPeakW.toLocaleString()} <span className="unit">W</span>
              </div>
              <div className="kpi-sub">Max since open</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Health */}
      <Card className="panel-card mt-3">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="panel-title">Device Health</div>
            <Badge bg="secondary">Gateway</Badge>
          </div>
          <div className="small text-muted mb-1">Online</div>
          <ProgressBar now={onlinePct} label={`${Math.round(onlinePct)}%`} />
        </Card.Body>
      </Card>

      {/* Machines Table */}
      <Card className="panel-card mt-3">
        <Card.Body>
          <div className="panel-title mb-2">Machines</div>
          <Table responsive borderless size="sm" className="machine-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th className="text-end">Power (W)</th>
                <th className="text-end">Energy (kWh)</th>
                <th>Status</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const w = powerW[m.id] || 0;
                const kwh = ((energyWh[m.id] || 0) / 1000).toFixed(3);
                const stat = getStatus(w);
                return (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="text-end">{w.toLocaleString()}</td>
                    <td className="text-end">{kwh}</td>
                    <td>
                      <Badge bg={statusVariant(stat)}>{stat}</Badge>
                    </td>
                    <td className="text-muted small">{lastSeen[m.id]}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
}
