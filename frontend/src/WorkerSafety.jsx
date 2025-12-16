// WorkerSafety.jsx
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import io from "socket.io-client";

// --- COLORS ---
const COLOR_PRIMARY = "#1E3A8A";
const COLOR_SECONDARY = "#4B5563";
const COLOR_SUCCESS = "#10B981";
const COLOR_DANGER = "#EF4444";
const COLOR_WARNING = "#F59E0B";
const COLOR_BACKGROUND = "#F9FAFB";
const COLOR_WHITE = "#FFFFFF";
// ---------------

// NOTE: change IP if needed
const SERVER_IP = "192.168.0.102";
const API_URL = `http://${SERVER_IP}:3000/api`;
const SOCKET_URL = `http://${SERVER_IP}:3000`;

// axios + socket created ONCE
const api = axios.create({ baseURL: API_URL });
const socket = io(SOCKET_URL, { autoConnect: true });

const WorkerSafety = () => {
  const [workers, setWorkers] = useState({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [timeoutInputs, setTimeoutInputs] = useState({}); // seconds

  // Tick every second for live timers
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch all workers
  const fetchWorkers = useCallback(async () => {
    try {
      const res = await api.get("/workers");
      const list = res.data.workers || [];

      const map = {};
      const ti = {};
      list.forEach((w) => {
        const lastPingTs = w.lastPingTs ? new Date(w.lastPingTs).getTime() : null;
        const timeoutMs = typeof w.timeoutMs === "number" ? w.timeoutMs : 60000;
        map[w.workerId] = { ...w, lastPingTs, timeoutMs };
        ti[w.workerId] = Math.floor(timeoutMs / 1000); // store seconds
      });

      setWorkers(map);
      setTimeoutInputs(ti);
    } catch (err) {
      console.error("Error fetching workers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + socket listeners
  useEffect(() => {
    fetchWorkers();

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    // When backend sends new ping
    socket.on("worker-ping", (payload) => {
      setWorkers((prev) => {
        const id = payload.workerId;
        const existing = prev[id] || {};
        const timeoutMs =
          typeof payload.timeoutMs === "number"
            ? payload.timeoutMs
            : existing.timeoutMs || 60000;
        const lastPingTs =
          typeof payload.lastPingTs === "number"
            ? payload.lastPingTs
            : existing.lastPingTs ?? null;

        const updated = {
          ...existing,
          ...payload,
          timeoutMs,
          lastPingTs,
        };

        setTimeoutInputs((prevT) => ({
          ...prevT,
          [id]: Math.floor(timeoutMs / 1000),
        }));

        return { ...prev, [id]: updated };
      });
    });

    // When backend changes status (OK / MISSED / INACTIVE)
    socket.on("worker-status", (payload) => {
      setWorkers((prev) => {
        const id = payload.workerId;
        const existing = prev[id] || {};
        const lastPingTs =
          typeof payload.lastPingTs === "number"
            ? payload.lastPingTs
            : existing.lastPingTs ?? null;

        const updated = {
          ...existing,
          ...payload,
          lastPingTs,
        };

        return { ...prev, [id]: updated };
      });
    });

    socket.on("alert", (payload) => {
      console.log("alert:", payload);
    });

    return () => {
      socket.off("connect");
      socket.off("worker-ping");
      socket.off("worker-status");
      socket.off("alert");
    };
  }, [fetchWorkers]);

  // ---- Actions ----

  // Manual check-in (starts or resets timer, sets isActive = true on backend)
  const handleCheckIn = async (workerId) => {
    try {
      await api.post(`/workers/ping/${workerId}`, {
        deviceId: "DASHBOARD",
      });
    } catch (err) {
      console.error("Error sending check-in:", err);
      alert(`Failed to send check-in for ${workerId}`);
    }
  };

  // Stop timer
  const handleStopTimer = async (workerId) => {
    try {
      await api.post(`/workers/stop/${workerId}`);
    } catch (err) {
      console.error("Error stopping timer:", err);
      alert(`Failed to stop timer for ${workerId}`);
    }
  };

  // Create worker
  const createTestWorker = async () => {
    const workerId = prompt("Enter a unique Worker ID (e.g., 'W001'):");
    if (!workerId) return;
    const name = prompt("Enter Worker Name:");
    if (!name) return;

    const timeoutSecStr = prompt("Enter timeout in seconds (default 30):", "30");
    const timeoutSec = Number(timeoutSecStr);
    const timeoutMs =
      !isNaN(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : 30000;

    try {
      const res = await api.post("/workers", { workerId, name, timeoutMs });
      const w = res.data.worker;
      const lastPingTs = w.lastPingTs ? new Date(w.lastPingTs).getTime() : null;

      setWorkers((prev) => ({
        ...prev,
        [workerId]: { ...w, lastPingTs, timeoutMs },
      }));
      setTimeoutInputs((prev) => ({
        ...prev,
        [workerId]: Math.floor(timeoutMs / 1000),
      }));

      alert(
        `Worker ${workerId} (${name}) created with timeout ${Math.floor(
          timeoutMs / 1000
        )}s`
      );
    } catch (err) {
      console.error("Error creating worker:", err);
      alert(
        `Failed to create worker. ${
          err?.response?.data?.error || "Server error."
        }`
      );
    }
  };

  // UI input for timeout
  const handleTimeoutInputChange = (workerId, value) => {
    setTimeoutInputs((prev) => ({
      ...prev,
      [workerId]: value,
    }));
  };

  // Send timeout update to backend
  const handleTimeoutUpdate = async (workerId) => {
    const secStr = timeoutInputs[workerId];
    const sec = Number(secStr);

    if (isNaN(sec) || sec <= 0) {
      alert("Please enter a valid timeout in seconds (> 0).");
      return;
    }

    const timeoutMs = sec * 1000;
    console.log("Updating timeout for", workerId, "to", timeoutMs, "ms");

    try {
      await api.post("/workers", { workerId, timeoutMs });

      // update local state immediately
      setWorkers((prev) => {
        const w = prev[workerId];
        if (!w) return prev;
        return {
          ...prev,
          [workerId]: { ...w, timeoutMs },
        };
      });

      alert(`Timeout for ${workerId} updated to ${sec}s`);
    } catch (err) {
      console.error("Error updating timeout:", err);
      alert(`Failed to update timeout for ${workerId}`);
    }
  };

  // ---- Rendering helpers ----

  const renderStatus = (worker) => {
    const timeoutMs = worker.timeoutMs || 60000;
    const lastPing = worker.lastPingTs;

    if (!worker.isActive || worker.status === "INACTIVE") {
      return (
        <span style={{ color: COLOR_SECONDARY, fontWeight: 600 }}>
          ⏸ Timer Stopped
        </span>
      );
    }

    if (!lastPing) {
      return (
        <span style={{ color: COLOR_SECONDARY, fontWeight: 500 }}>
          No check-in yet
        </span>
      );
    }

    const diffMs = now - lastPing;
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const remainingSec = Math.max(0, Math.floor((timeoutMs - diffMs) / 1000));

    let color = COLOR_SUCCESS;
    let label = `OK — ${diffSec}s since last press`;

    if (diffMs >= timeoutMs * 0.8 && diffMs < timeoutMs) {
      color = COLOR_WARNING;
      label = `⚠ ${remainingSec}s until timeout`;
    }

    if (diffMs >= timeoutMs || worker.status === "MISSED") {
      color = COLOR_DANGER;
      const overdue = Math.max(0, Math.floor((diffMs - timeoutMs) / 1000));
      label = `🚨 MISSED — ${overdue}s overdue`;
    }

    return <span style={{ color, fontWeight: 600 }}>{label}</span>;
  };

  const renderLastPing = (worker) => {
    if (!worker.lastPingTs) {
      return <span style={{ color: COLOR_SECONDARY }}>—</span>;
    }

    const diffMs = now - worker.lastPingTs;
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    let label = `${diffSec}s ago`;
    if (diffSec >= 60) {
      const minutes = Math.floor(diffSec / 60);
      const seconds = diffSec % 60;
      label = `${minutes}m ${seconds}s ago`;
    }

    return (
      <span style={{ color: COLOR_SECONDARY, fontWeight: 500 }}>{label}</span>
    );
  };

  if (loading) {
    return <div style={styles.container}>Loading worker data...</div>;
  }

  const workerList = Object.values(workers);

  return (
    <div style={styles.container}>
      <h2 style={styles.h2}>👷 Workshop Safety Monitoring</h2>
      <p style={styles.p}>
        Each worker must press their safety button within their timeout. You can
        change the timeout, start/stop the timer, and send a manual check-in.
      </p>

      <button onClick={createTestWorker} style={styles.createButton}>
        + Add New Worker
      </button>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Worker ID</th>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Status / Timer</th>
            <th style={styles.th}>Last Check-in</th>
            <th style={styles.th}>Timeout (sec)</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workerList.map((worker) => {
            const timeoutSec =
              timeoutInputs[worker.workerId] ??
              Math.floor((worker.timeoutMs || 60000) / 1000);

            return (
              <tr
                key={worker.workerId}
                style={{
                  backgroundColor:
                    worker.status === "MISSED"
                      ? "rgba(239,68,68,0.06)"
                      : COLOR_WHITE,
                  color: COLOR_SECONDARY,
                }}
              >
                <td style={styles.td}>{worker.workerId}</td>
                <td style={styles.td}>{worker.name}</td>
                <td style={styles.td}>{renderStatus(worker)}</td>
                <td style={styles.td}>{renderLastPing(worker)}</td>
                <td style={styles.td}>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={timeoutSec}
                    onChange={(e) =>
                      handleTimeoutInputChange(
                        worker.workerId,
                        Number(e.target.value)
                      )
                    }
                    style={styles.timeoutInput}
                  />
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleTimeoutUpdate(worker.workerId)}
                    style={styles.timeoutButton}
                  >
                    Update Timeout
                  </button>
                  {worker.isActive ? (
                    <button
                      onClick={() => handleStopTimer(worker.workerId)}
                      style={styles.stopButton}
                    >
                      ⏸ Stop Timer
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCheckIn(worker.workerId)}
                      style={styles.checkinButton}
                    >
                      ▶ Start / Check-in
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// --- styles ---
const styles = {
  container: {
    padding: "30px",
    fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: COLOR_BACKGROUND,
    minHeight: "100vh",
  },
  h2: {
    color: COLOR_PRIMARY,
    borderBottom: `2px solid ${COLOR_PRIMARY}`,
    paddingBottom: "10px",
    fontWeight: "700",
  },
  p: {
    color: COLOR_SECONDARY,
    marginBottom: "20px",
  },
  createButton: {
    padding: "10px 18px",
    backgroundColor: COLOR_PRIMARY,
    color: COLOR_WHITE,
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    marginBottom: "25px",
    fontWeight: "600",
    transition: "background-color 0.2s",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: "0",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    backgroundColor: COLOR_WHITE,
  },
  th: {
    backgroundColor: COLOR_PRIMARY,
    color: COLOR_WHITE,
    padding: "12px 15px",
    textAlign: "left",
    fontWeight: "700",
  },
  td: {
    borderBottom: `1px solid COLOR_BACKGROUND`,
    padding: "12px 15px",
    textAlign: "left",
    verticalAlign: "middle",
  },
  timeoutInput: {
    width: "80px",
    padding: "4px 6px",
    borderRadius: "4px",
    border: `1px solid ${COLOR_SECONDARY}33`,
    fontSize: "14px",
  },
  timeoutButton: {
    padding: "6px 10px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "13px",
    marginRight: "8px",
    backgroundColor: COLOR_PRIMARY,
    color: COLOR_WHITE,
  },
  checkinButton: {
    padding: "6px 10px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "13px",
    backgroundColor: COLOR_SUCCESS,
    color: COLOR_WHITE,
  },
  stopButton: {
    padding: "6px 10px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "13px",
    backgroundColor: COLOR_DANGER,
    color: COLOR_WHITE,
  },
};

export default WorkerSafety;
