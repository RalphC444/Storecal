require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");

const providersRouter = require("./routes/providers");
const availabilityRouter = require("./routes/availability");
const timeoffRouter = require("./routes/timeoff");
const appointmentsRouter = require("./routes/appointments");
const shopConfigRouter = require("./routes/shopConfig");

const app = express();

// Allow any localhost origin in dev (Vite picks whatever port is free).
// In production, replace with the salon's real site origin(s).
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    cb(null, false);
  },
}));
app.use(express.json());

app.use("/api/providers", providersRouter);
app.use("/api/availability", availabilityRouter);
app.use("/api/timeoff", timeoffRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/shop-config", shopConfigRouter);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Admin API → http://localhost:${PORT}`);
});
