import express from "express";
import path from "path";
import dotenv from "dotenv";
import { LocalBrowserAgent } from './server/agent';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const defaultKey = process.env.GEMINI_API_KEY;
  if (!defaultKey) {
    console.warn("WARNING: No GEMINI_API_KEY found in environment. Local browser agent may require manual key entry in Settings.");
  }
  const agent = new LocalBrowserAgent(defaultKey || '');

  // API Routes
  app.post("/api/browser/run", async (req, res) => {
    const { task } = req.body;
    const geminiKey = req.headers["x-gemini-api-key"] as string;
    
    try {
      const sessionId = await agent.createSession(task, geminiKey);
      const session = agent.getSession(sessionId);
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Execution Error", 
        message: "Failed to start local browser agent.",
        details: error.message 
      });
    }
  });

  app.get("/api/browser/session/:id", async (req, res) => {
    const { id } = req.params;
    const session = agent.getSession(id);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(session);
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
