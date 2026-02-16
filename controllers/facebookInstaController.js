const path = require("path");
const fs = require("fs");
const axios = require("axios");
const facebookInsta = require("../services/facebookInstaService");

const DOWNLOAD_DIR = path.join(__dirname, "..", "downloads");

const sanitizeFilename = (name) =>
  name
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");

const cleanupDownloadsDir = () => {
  try {
    if (!fs.existsSync(DOWNLOAD_DIR)) return;
    const files = fs.readdirSync(DOWNLOAD_DIR);
    files.forEach((file) => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      try {
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // Best-effort cleanup: ignore single-file errors.
      }
    });
  } catch (err) {
    // Best-effort cleanup: ignore directory read errors.
  }
};

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  const base64Payload = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
  const decoded = Buffer.from(base64Payload, "base64").toString("utf8");
  return JSON.parse(decoded);
};

const parseTokenHeaders = (mediaUrl) => {
  try {
    const parsedUrl = new URL(mediaUrl);
    const token = parsedUrl.searchParams.get("token");
    if (!token) return {};
    const payload = decodeJwtPayload(token);

    if (payload && typeof payload.headers === "object" && payload.headers) {
      return payload.headers;
    }
  } catch (err) {
    return {};
  }

  return {};
};

const resolveMediaUrl = (mediaUrl) => {
  try {
    const parsedUrl = new URL(mediaUrl);
    const token = parsedUrl.searchParams.get("token");
    if (!token) return mediaUrl;

    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload !== "object") return mediaUrl;

    // Keep render.php URLs intact because provider often muxes audio/video there.
    if (parsedUrl.pathname.endsWith("/render.php")) {
      return mediaUrl;
    }

    return mediaUrl;
  } catch (err) {
    return mediaUrl;
  }
};

const buildUpstreamHeaders = (rawMediaUrl, resolvedMediaUrl) => {
  const tokenHeaders = {
    ...parseTokenHeaders(rawMediaUrl),
    ...parseTokenHeaders(resolvedMediaUrl),
  };
  return {
    "User-Agent": "Mozilla/5.0",
    Accept: "*/*",
    Referer: "https://www.facebook.com/",
    ...tokenHeaders,
  };
};

async function handleFacebookInstaDownload(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter." });
  }

  try {
    const data = await facebookInsta(url);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function handleMediaFileDownload(req, res) {
  const { mediaUrl, filename } = req.query;

  if (!mediaUrl) {
    return res.status(400).json({ success: false, error: "Missing 'mediaUrl' query parameter." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(resolveMediaUrl(mediaUrl));
  } catch (err) {
    return res.status(400).json({ success: false, error: "Invalid mediaUrl." });
  }

  const originalBase = path.basename(parsedUrl.pathname) || "media";
  const safeBase = sanitizeFilename(filename || originalBase) || "media";
  const extension = path.extname(safeBase) || path.extname(originalBase) || ".mp4";
  const finalName = `${safeBase.replace(path.extname(safeBase), "")}${extension}`;

  try {
    const resolvedMediaUrl = parsedUrl.toString();
    const response = await axios.get(resolvedMediaUrl, {
      responseType: "stream",
      headers: buildUpstreamHeaders(mediaUrl, resolvedMediaUrl),
      maxRedirects: 5,
    });

    let cleaned = false;
    const finalizeCleanup = () => {
      if (cleaned) return;
      cleaned = true;
      cleanupDownloadsDir();
    };
    res.once("finish", finalizeCleanup);
    res.once("close", finalizeCleanup);

    res.setHeader("Content-Disposition", `attachment; filename="${finalName}"`);
    res.setHeader("Content-Type", response.headers["content-type"] || "application/octet-stream");
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }

    response.data.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Failed to send file." });
      } else {
        res.end();
      }
    });

    return response.data.pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to download media." });
  }
}

async function handleMediaStream(req, res) {
  const { mediaUrl } = req.query;

  if (!mediaUrl) {
    return res.status(400).json({ success: false, error: "Missing 'mediaUrl' query parameter." });
  }

  try {
    const resolvedMediaUrl = resolveMediaUrl(mediaUrl);

    // Keep stream on backend so browser can play cross-origin protected media.
    const response = await axios.get(resolvedMediaUrl, {
      responseType: "stream",
      headers: buildUpstreamHeaders(mediaUrl, resolvedMediaUrl),
      maxRedirects: 5,
    });

    if (response.headers["content-type"]) {
      res.setHeader("Content-Type", response.headers["content-type"]);
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }
    if (response.headers["accept-ranges"]) {
      res.setHeader("Accept-Ranges", response.headers["accept-ranges"]);
    }

    response.data.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Failed to stream media." });
      } else {
        res.end();
      }
    });

    return response.data.pipe(res);
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to stream media." });
  }
}

module.exports = { handleFacebookInstaDownload, handleMediaFileDownload, handleMediaStream };
