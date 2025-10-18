const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 1) Connect to MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/testdb", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Database Connected Successfully"))
  .catch((err) => console.error("Error connecting to DB:", err));

// 2) Schema & Model
const LoginSchema = new mongoose.Schema({
  username: {
     type: String,
     required: true 
  }, 
  password: { 
    type: String, 
    required: true
 },
});

const User = mongoose.model("users", LoginSchema);

// 3) Login route 
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // basic input guard
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    // find user
    const user = await User.findOne({ username });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    // compare (plaintext demo only)
    if (user.password !== password) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    // success
    return res.json({ success: true, user: { username: user.username } });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


// 5) Start server
const PORT = 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));

module.exports = app; 