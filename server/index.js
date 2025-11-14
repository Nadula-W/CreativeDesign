// server.js (UPDATED with Date Parsing Fix)
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
      enum: ["FIRE", "ELECTRICAL", "MEDICAL"],
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

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user || user.password !== password)
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });

    return res.json({ success: true, user: { username: user.username } });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------- Existing alert routes (unchanged) ----------
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

// ---------- Test Route (Manually trigger alert for debugging) ----------
app.post("/api/test-alert/:type", async (req, res) => {
  try {
    const type = String(req.params.type).toUpperCase();
    if (!["FIRE", "ELECTRICAL", "MEDICAL"].includes(type)) {
      return res.status(400).json({ ok: false, error: "Invalid alert type. Use FIRE, ELECTRICAL, or MEDICAL." });
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
    return res.json({ ok: true, message: `Test alert '${type}' sent to dashboard.`, id: alertDoc._id });

  } catch (err) {
    console.error("POST /api/test-alert error:", err);
    return res.status(500).json({ ok: false, error: "Server error during test" });
  }
});

// ---------- NEW: Sensor endpoints ----------

/**
 * POST /api/sensor
 * FIX: Includes robust timestamp parsing to resolve the Mongoose CastError.
 */
app.post("/api/sensor", async (req, res) => {
    try {
        // Line 255 in your old code likely starts here:
        const { deviceId, temperature, humidity, mqRaw, mqPct, ts, meta } = req.body || {};

        // basic validation: ensure at least one reading present
        if (
            typeof temperature === "undefined" &&
            typeof humidity === "undefined" &&
            typeof mqRaw === "undefined" &&
            typeof mqPct === "undefined"
        ) {
            return res.status(400).json({ ok: false, error: "No sensor data provided" });
        }

        // 🛑 CRITICAL FIX FOR THE "Invalid Date" ERROR
        let finalTs = new Date(); 
        if (ts) {
            const parsedTs = Number(ts);
            
            if (!isNaN(parsedTs) && parsedTs > 0) {
                finalTs = new Date(parsedTs); 
                
                // If the resulting date is invalid (which is what Mongoose rejects)
                if (isNaN(finalTs.getTime())) {
                    console.warn(`⚠️ Received TS: ${ts} failed to parse. Falling back to server time.`);
                    finalTs = new Date(); 
                }
            }
        }
        // ------------------------------------------

        const doc = await Sensor.create({ // This is likely line 255 in your old code
            deviceId: deviceId || "unknown",
            temperature: parseSensorValue(temperature),
            humidity: parseSensorValue(humidity),
            mqRaw: parseSensorValue(mqRaw),
            mqPct: parseSensorValue(mqPct),
            meta: meta || {},
            ts: finalTs, // Use the safely parsed timestamp
        });

        // Emit minimal payload to clients (Socket.IO part)
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
/**
 * GET /api/sensors/latest (NEW ROUTE for easy dashboard refresh)
 */
app.get("/api/sensors/latest", async (_req, res) => {
    try {
        const item = await Sensor.findOne().sort({ ts: -1 });

        if (!item) {
            return res.json({
                ok: true,
                item: { temperature: 0, humidity: 0, mqPct: 0, ts: Date.now() }
            });
        }

        return res.json({
            ok: true,
            item: {
                id: item._id.toString(),
                deviceId: item.deviceId,
                // Fallback to 0 to prevent nulls from breaking front-end charts/displays
                temperature: item.temperature || 0,
                humidity: item.humidity || 0,
                mqRaw: item.mqRaw || 0,
                mqPct: item.mqPct || 0,
                meta: item.meta,
                ts: item.ts.getTime(),
            }
        });
    } catch (err) {
        console.error("GET /api/sensors/latest error:", err);
        return res.status(500).json({ ok: false, error: "Server error" });
    }
});


/**
 * GET /api/sensors?limit=50
 */
app.get("/api/sensors", async (req, res) => {
  try {
    const limit = Math.min(500, Number(req.query.limit || 50));
    const items = await Sensor.find().sort({ ts: -1 }).limit(limit);
    return res.json({
      ok: true,
      items: items.map((s) => ({
        id: s._id.toString(),
        deviceId: s.deviceId,
        // Fallback to 0 to prevent nulls from breaking front-end charts/displays
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

// ---------- Socket.IO ----------
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);
  socket.on("disconnect", () =>
    console.log("🔴 Client disconnected:", socket.id)
  );
});

// ---------- Start Server ----------
const PORT = 3000;
// IP 192.168.1.32 replaced with your actual laptop IP 192.168.0.101
const SERVER_IP = "192.168.1.32";
server.listen(PORT, SERVER_IP, () =>
  console.log(`🚀 API + Socket.IO running on http://${SERVER_IP}:${PORT}`)
);

module.exports = app;