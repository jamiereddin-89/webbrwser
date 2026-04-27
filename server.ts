import express from "express";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/browser/run", async (req, res) => {
    const { task } = req.body;
    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "BROWSER_USE_API_KEY is not set" });
    }

    try {
      const response = await fetch("https://api.browser-use.com/api/v3/sessions", {
        method: "POST",
        headers: {
          "X-Browser-Use-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/browser/session/:id", async (req, res) => {
    const { id } = req.params;
    const apiKey = process.env.BROWSER_USE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "BROWSER_USE_API_KEY is not set" });
    }

    try {
      const response = await fetch(`https://api.browser-use.com/api/v3/sessions/${id}`, {
        headers: {
          "X-Browser-Use-API-Key": apiKey,
        },
      });

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // @ts-ignore
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
