const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

app.use(cors());
app.use(express.json());
app.set("json spaces", 2);
app.use(morgan("dev"));
app.use("/api/meta", require("./routes/facebookInsta"));
const endpoints = [
  "/api/meta",
];

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    author: "MMuhammad Zeeshan",
    contact: "https://www.milanb.com.np/",
    message: "Universal Downloader API is running",
    endpoints,
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
  });
});

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_RETRIES = 5;

const startServer = (port, attempt = 0) => {
  const server = app
    .listen(port, () => {
      if (attempt > 0) {
        console.log(`Port ${DEFAULT_PORT} busy. Server running on fallback port ${port}`);
      } else {
        console.log(`Server running on port ${port}`);
      }
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE" && attempt < MAX_PORT_RETRIES) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is in use, retrying on ${nextPort}...`);
        return startServer(nextPort, attempt + 1);
      }

      console.error(`Failed to start server on port ${port}:`, err.message);
      process.exit(1);
    });

  return server;
};

if (require.main === module && process.env.VERCEL !== "1") {
  startServer(DEFAULT_PORT);
}

module.exports = app;
