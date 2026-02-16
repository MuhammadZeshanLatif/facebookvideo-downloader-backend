const express = require("express");
const router = express.Router();
const {
  handleFacebookInstaDownload,
  handleMediaFileDownload,
  handleMediaStream,
} = require("../controllers/facebookInstaController");

router.get("/download", handleFacebookInstaDownload);
router.get("/file", handleMediaFileDownload);
router.get("/stream", handleMediaStream);

module.exports = router;
