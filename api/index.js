import { createApp } from "../dist/server/src/app.js";

let appInstance = null;

function getApp() {
  if (!appInstance) {
    appInstance = createApp();
  }
  return appInstance;
}

export default async function handler(req, res) {
  try {
    const app = getApp();
    return app(req, res);
  } catch (err) {
    console.error("Vercel Serverless Function error:", err);
    res.status(500).json({
      error: {
        code: "INTERNAL",
        message: err?.message || "Internal server error",
      },
    });
  }
}
