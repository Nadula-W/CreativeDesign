// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH"],
  },
});

// ---------- Middleware ----------
app.use(express.json());
app.use(cors());

// ---------- Database ----------
mongoose
  .connect("mongodb://127.0.0.1:27017/testdb")
  .then(() => console.log("✅ Database Connected Successfully"))
  .catch((err) => console.error("❌ Error connecting to DB:", err));

// ---------- Schemas & Models ----------
const LoginSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
});
const User = mongoose.model("users", LoginSchema);

const AlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["FIRE", "ELECTRICAL", "MEDICAL", "WORKER_TIMEOUT"],
      required: true,
    },
    deviceId: { type: String, default: "unknown" },
    acknowledged: { type: Boolean, default: false },
    meta: { type: Object, default: {} },
    ts: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
const Alert = mongoose.model("alerts", AlertSchema);

// --------- Sensor schema & model ----------
const SensorSchema = new mongoose.Schema(
  {
    deviceId: { type: String, default: "unknown", index: true },
    temperature: { type: Number, default: null },
    humidity: { type: Number, default: null },
    mqRaw: { type: Number, default: null },
    mqPct: { type: Number, default: null },
    meta: { type: Object, default: {} },
    ts: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
const Sensor = mongoose.model("sensors", SensorSchema);

// --------- Worker schema & model ----------
const WorkerSchema = new mongoose.Schema(
  {
    workerId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    deviceId: { type: String, default: "" },

    isActive: { type: Boolean, default: true }, // timer on/off

    lastPingTs: { type: Date, default: null },
    status: {
      type: String,
      enum: ["OK", "MISSED", "INACTIVE"],
      default: "OK",
    },

    timeoutMs: { type: Number, default: 60000 }, // default 60s
  },
  { timestamps: true }
);
const Worker = mongoose.model("workers", WorkerSchema);

// Helper function to safely parse sensor values
const parseSensorValue = (value) => {
  if (typeof value !== "undefined" && value !== null) {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }
  return null;
};

// ---------- Routes ----------
app.get("/", (_req, res) =>
  res.json({ ok: true, name: "Workshop Safety API", time: Date.now() })
);

// ---------- Login ----------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user || user.password !== password)
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });

    return res.json({ success: true, user: { username: user.username } });
  } catch (err) {
    console.error("Login error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
});

// ---------- Alert routes ----------
app.post("/api/alert", async (req, res) => {
  try {
    const { type, deviceId, meta } = req.body || {};
    if (!type)
      return res.status(400).json({ ok: false, error: "type is required" });

    const alertDoc = await Alert.create({
      type: String(type).toUpperCase(),
      deviceId: deviceId || "unknown",
      meta: meta || {},
      ts: new Date(),
    });

    io.emit("alert", {
      id: alertDoc._id.toString(),
      type: alertDoc.type,
      deviceId: alertDoc.deviceId,
      ts: alertDoc.ts.getTime(),
      meta: alertDoc.meta,
    });

    console.log("⚠️ ALERT:", alertDoc.type, "device:", alertDoc.deviceId);
    return res.json({ ok: true, id: alertDoc._id });
  } catch (err) {
    console.error("POST /api/alert error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.post("/api/alerts/:id/ack", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Alert.findByIdAndUpdate(
      id,
      { acknowledged: true },
      { new: true }
    );
    if (!updated)
      return res.status(404).json({ ok: false, error: "Not found" });

    io.emit("alert-ack", { id: updated._id.toString(), acknowledged: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error("ACK error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/api/alerts", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const items = await Alert.find().sort({ ts: -1 }).limit(limit);
    return res.json({
      ok: true,
      items: items.map((a) => ({
        id: a._id.toString(),
        type: a.type,
        deviceId: a.deviceId,
        acknowledged: a.acknowledged,
        ts: a.ts.getTime(),
        meta: a.meta,
      })),
    });
  } catch (err) {
    console.error("GET /api/alerts error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ---------- Test Route ----------
app.post("/api/test-alert/:type", async (req, res) => {
  try {
    const type = String(req.params.type).toUpperCase();
    if (!["FIRE", "ELECTRICAL", "MEDICAL", "WORKER_TIMEOUT"].includes(type)) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid alert type. Use FIRE, ELECTRICAL, MEDICAL, or WORKER_TIMEOUT.",
      });
    }

    const alertDoc = await Alert.create({
      type: type,
      deviceId: "TEST-HARNESS",
      meta: { test: true, triggeredBy: "API" },
      ts: new Date(),
    });

    io.emit("alert", {
      id: alertDoc._id.toString(),
      type: alertDoc.type,
      deviceId: alertDoc.deviceId,
      ts: alertDoc.ts.getTime(),
      meta: alertDoc.meta,
    });

    console.log("✅ TEST ALERT TRIGGERED:", alertDoc.type);
    return res.json({
      ok: true,
      message: `Test alert '${type}' sent to dashboard.`,
      id: alertDoc._id,
    });
  } catch (err) {
    console.error("POST /api/test-alert error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Server error during test" });
  }
});

// ---------- Sensor endpoints ----------
app.post("/api/sensor", async (req, res) => {
  try {
    const { deviceId, temperature, humidity, mqRaw, mqPct, ts, meta } =
      req.body || {};

    if (
      typeof temperature === "undefined" &&
      typeof humidity === "undefined" &&
      typeof mqRaw === "undefined" &&
      typeof mqPct === "undefined"
    ) {
      return res
        .status(400)
        .json({ ok: false, error: "No sensor data provided" });
    }

    let finalTs = new Date();
    if (ts) {
      const parsedTs = Number(ts);
      if (!isNaN(parsedTs) && parsedTs > 0) {
        finalTs = new Date(parsedTs);
        if (isNaN(finalTs.getTime())) {
          console.warn(
            `⚠️ Received TS: ${ts} failed to parse. Falling back to server time.`
          );
          finalTs = new Date();
        }
      }
    }

    const doc = await Sensor.create({
      deviceId: deviceId || "unknown",
      temperature: parseSensorValue(temperature),
      humidity: parseSensorValue(humidity),
      mqRaw: parseSensorValue(mqRaw),
      mqPct: parseSensorValue(mqPct),
      meta: meta || {},
      ts: finalTs,
    });

    io.emit("sensor", {
      id: doc._id.toString(),
      deviceId: doc.deviceId,
      temperature: doc.temperature,
      humidity: doc.humidity,
      mqRaw: doc.mqRaw,
      mqPct: doc.mqPct,
      meta: doc.meta,
      ts: doc.ts.getTime(),
    });

    console.log(
      "📡 Sensor update from",
      doc.deviceId,
      "temp:",
      doc.temperature,
      "humid:",
      doc.humidity,
      "mqPct:",
      doc.mqPct
    );

    return res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error("POST /api/sensor error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/api/sensors/latest", async (_req, res) => {
  try {
    const item = await Sensor.findOne().sort({ ts: -1 });

    if (!item) {
      return res.json({
        ok: true,
        item: { temperature: 0, humidity: 0, mqPct: 0, ts: Date.now() },
      });
    }

    return res.json({
      ok: true,
      item: {
        id: item._id.toString(),
        deviceId: item.deviceId,
        temperature: item.temperature || 0,
        humidity: item.humidity || 0,
        mqRaw: item.mqRaw || 0,
        mqPct: item.mqPct || 0,
        meta: item.meta,
        ts: item.ts.getTime(),
      },
    });
  } catch (err) {
    console.error("GET /api/sensors/latest error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/api/sensors", async (req, res) => {
  try {
    const limit = Math.min(500, Number(req.query.limit || 50));
    const items = await Sensor.find().sort({ ts: -1 }).limit(limit);
    return res.json({
      ok: true,
      items: items.map((s) => ({
        id: s._id.toString(),
        deviceId: s.deviceId,
        temperature: s.temperature || 0,
        humidity: s.humidity || 0,
        mqRaw: s.mqRaw || 0,
        mqPct: s.mqPct || 0,
        meta: s.meta,
        ts: s.ts.getTime(),
      })),
    });
  } catch (err) {
    console.error("GET /api/sensors error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ---------- Worker management endpoints ----------

// Create or update a worker (name/deviceId/timeout)
app.post("/api/workers", async (req, res) => {
  try {
    const { workerId, name, deviceId, timeoutMs } = req.body || {};
    if (!workerId) {
      return res.status(400).json({ ok: false, error: "workerId is required" });
    }

    const update = {
      $set: {
        name: name || workerId,
        deviceId: deviceId || "",
      },
    };

    if (typeof timeoutMs !== "undefined") {
      const t = Number(timeoutMs);
      if (!isNaN(t) && t > 0) {
        update.$set.timeoutMs = t;
      }
    }

    const worker = await Worker.findOneAndUpdate({ workerId }, update, {
      new: true,
      upsert: true,
    });

    return res.json({ ok: true, worker });
  } catch (err) {
    console.error("POST /api/workers error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// List workers
app.get("/api/workers", async (_req, res) => {
  try {
    const workers = await Worker.find().sort({ workerId: 1 });
    return res.json({ ok: true, workers });
  } catch (err) {
    console.error("GET /api/workers error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// Worker config for hardware
app.get("/api/workers/:workerId/config", async (req, res) => {
  try {
    const { workerId } = req.params;
    if (!workerId) {
      return res.status(400).json({ ok: false, error: "workerId is required" });
    }

    const worker = await Worker.findOne({ workerId });

    if (!worker) {
      return res.json({
        ok: true,
        workerId,
        timeoutMs: 30000,
        isActive: true,
        status: "INACTIVE",
      });
    }

    return res.json({
      ok: true,
      workerId: worker.workerId,
      timeoutMs: worker.timeoutMs || 60000,
      isActive: worker.isActive,
      status: worker.status,
    });
  } catch (err) {
    console.error("GET /api/workers/:workerId/config error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// Worker ping
app.post("/api/workers/ping/:workerId", async (req, res) => {
  try {
    const { workerId } = req.params;
    const { deviceId, name, timeoutMs } = req.body || {};
    if (!workerId) {
      return res.status(400).json({ ok: false, error: "workerId is required" });
    }

    const now = new Date();

    const update = {
      $set: {
        lastPingTs: now,
        status: "OK",
        isActive: true,
      },
      $setOnInsert: {
        workerId,
        name: name || workerId,
      },
    };

    if (deviceId) update.$set.deviceId = deviceId;

    if (typeof timeoutMs !== "undefined") {
      const t = Number(timeoutMs);
      if (!isNaN(t) && t > 0) {
        update.$set.timeoutMs = t;
      }
    }

    const worker = await Worker.findOneAndUpdate({ workerId }, update, {
      new: true,
      upsert: true,
    });

    io.emit("worker-ping", {
      workerId: worker.workerId,
      deviceId: worker.deviceId,
      status: worker.status,
      isActive: worker.isActive,
      lastPingTs: worker.lastPingTs ? worker.lastPingTs.getTime() : null,
      timeoutMs: worker.timeoutMs,
    });

    console.log(`✅ Worker ping: ${worker.workerId} at ${worker.lastPingTs}`);

    return res.json({ ok: true, worker });
  } catch (err) {
    console.error("POST /api/workers/ping error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// Stop timer / deactivate worker monitoring
app.post("/api/workers/stop/:workerId", async (req, res) => {
  try {
    const { workerId } = req.params;
    if (!workerId) {
      return res.status(400).json({ ok: false, error: "workerId is required" });
    }

    const worker = await Worker.findOneAndUpdate(
      { workerId },
      {
        $set: {
          isActive: false,
          status: "INACTIVE",
        },
      },
      { new: true }
    );

    if (!worker) {
      return res.status(404).json({ ok: false, error: "Worker not found" });
    }

    io.emit("worker-status", {
      workerId: worker.workerId,
      status: worker.status,
      isActive: worker.isActive,
      lastPingTs: worker.lastPingTs ? worker.lastPingTs.getTime() : null,
      timeoutMs: worker.timeoutMs,
    });

    console.log(`⏹ Timer stopped for worker ${worker.workerId}`);

    return res.json({ ok: true, worker });
  } catch (err) {
    console.error("POST /api/workers/stop error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// ---------- Worker safety monitor ----------
const DEFAULT_WORKER_TIMEOUT_MS = 60000;
const WORKER_CHECK_INTERVAL_MS = 5000;

setInterval(async () => {
  try {
    const now = Date.now();
    const workers = await Worker.find({ isActive: true });

    for (const w of workers) {
      if (!w.lastPingTs) continue;

      const diff = now - w.lastPingTs.getTime();
      const timeout = w.timeoutMs || DEFAULT_WORKER_TIMEOUT_MS;

      if (diff > timeout && w.status !== "MISSED") {
        w.status = "MISSED";
        await w.save();

        console.log(`⚠️ Worker ${w.workerId} MISSED check-in (diff=${diff}ms)`);

        const alertDoc = await Alert.create({
          type: "WORKER_TIMEOUT",
          deviceId: w.deviceId || "unknown",
          meta: {
            reason: "WORKER_NO_CHECKIN",
            workerId: w.workerId,
            lastPingTs: w.lastPingTs,
            timeoutMs: timeout,
            overdueMs: diff,
          },
          ts: new Date(),
        });

        io.emit("alert", {
          id: alertDoc._id.toString(),
          type: alertDoc.type,
          deviceId: alertDoc.deviceId,
          ts: alertDoc.ts.getTime(),
          meta: alertDoc.meta,
        });

        io.emit("worker-status", {
          workerId: w.workerId,
          status: w.status,
          isActive: w.isActive,
          lastPingTs: w.lastPingTs.getTime(),
          timeoutMs: w.timeoutMs,
        });
      }

      if (diff <= timeout && w.status === "MISSED") {
        w.status = "OK";
        await w.save();

        console.log(`✅ Worker ${w.workerId} back to OK`);

        io.emit("worker-status", {
          workerId: w.workerId,
          status: w.status,
          isActive: w.isActive,
          lastPingTs: w.lastPingTs.getTime(),
          timeoutMs: w.timeoutMs,
        });
      }
    }
  } catch (err) {
    console.error("Worker safety monitor error:", err);
  }
}, WORKER_CHECK_INTERVAL_MS);

// ---------- Socket.IO ----------
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);
  socket.on("disconnect", () =>
    console.log("🔴 Client disconnected:", socket.id)
  );
});

// ---------- Start Server ----------
const PORT = 3000;
server.listen(PORT, () =>
  console.log(`🚀 API + Socket.IO running on http://0.0.0.0:${PORT}`)
);

module.exports = app;
