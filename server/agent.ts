
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { BrowserSession, BrowserStep } from '../src/types';
import { v4 as uuidv4 } from 'uuid';

export class LocalBrowserAgent {
  private sessions: Map<string, BrowserSession> = new Map();
  private defaultApiKey: string;

  constructor(apiKey: string) {
    this.defaultApiKey = apiKey;
  }

  async createSession(task: string, apiKey?: string): Promise<string> {
    const id = uuidv4();
    const session: BrowserSession = {
      id,
      task,
      status: 'running',
      steps: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.sessions.set(id, session);
    
    // Start background task
    this.runAgent(id, apiKey).catch(err => {
      console.error(`Agent ${id} failed:`, err);
      const s = this.sessions.get(id);
      if (s) {
        s.status = 'failed';
        s.updated_at = new Date().toISOString();
      }
    });

    return id;
  }

  getSession(id: string): BrowserSession | undefined {
    return this.sessions.get(id);
  }

  private async runAgent(id: string, apiKey?: string) {
    const session = this.sessions.get(id);
    if (!session) return;

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // Prioritize the provided apiKey (override), fallback to the one passed in constructor
      let keyToUse = (apiKey && apiKey.trim() !== "") ? apiKey : this.defaultApiKey;
      
      if (!keyToUse || keyToUse === "undefined" || keyToUse === "null" || keyToUse.trim() === "") {
        throw new Error("No valid Gemini API key found. Please check your Settings or environment variables.");
      }

      // Log masked key for debugging
      console.log(`Starting agent session ${id} with key: ${keyToUse.slice(0, 4)}...${keyToUse.slice(-4)}`);

      const currentAI = new GoogleGenerativeAI(keyToUse);
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      page = await context.newPage();

      let stepCount = 0;
      const maxSteps = 20;

      while (stepCount < maxSteps && session.status === 'running') {
        stepCount++;
        const screenshot = await page.screenshot({ type: 'png' });
        const screenshotBase64 = screenshot.toString('base64');
        const url = page.url();

        // Get interactive elements for context
        const elements = await page.evaluate(() => {
          const interactives = Array.from(document.querySelectorAll('button, input, a, select, textarea, [role="button"]'));
          return interactives.map((el, index) => {
            const rect = el.getBoundingClientRect();
            return {
              id: index,
              tag: el.tagName,
              text: el.textContent?.trim().slice(0, 50) || (el as HTMLInputElement).placeholder || (el as HTMLInputElement).value || '',
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              visible: rect.width > 0 && rect.height > 0
            };
          }).filter(e => e.visible);
        });

        const prompt = `
          Task: ${session.task}
          Current URL: ${url}
          Step: ${stepCount}
          
          You are an autonomous web agent. Based on the screenshot and the list of elements below, decide the next action to achieve the task.
          
          Interactive Elements:
          ${elements.map(e => `[${e.id}] ${e.tag}: "${e.text}" at (${e.x}, ${e.y})`).join('\n')}
          
          Rules:
          1. Respond with a JSON object containing:
             - "thought": Your reasoning.
             - "action": One of: "navigate", "click", "type", "scroll_down", "scroll_up", "done".
             - "param": The URL for navigate, index for click, or {index, text} for type.
             - "description": A brief user-friendly message of what you are doing.
          2. Use "done" when the task is finished or the information is found.
          3. If the page is blank or not what you expected, try navigating to a search engine like Google.
          
          Output ONLY the JSON object.
        `;

        const model = currentAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: screenshotBase64,
              mimeType: "image/png"
            }
          }
        ]);

        const responseText = result.response.text();
        let decision;
        try {
          const jsonStr = responseText.match(/\{[\s\S]*\}/)?.[0] || responseText;
          decision = JSON.parse(jsonStr);
        } catch (e) {
          console.error("Failed to parse Gemini decision:", responseText);
          throw new Error("AI Decision Parsing Error");
        }

        // Add step to history
        const step: BrowserStep = {
          index: stepCount,
          action: decision.action,
          description: decision.description,
          screenshot: screenshotBase64,
          status: 'success',
          url
        };
        session.steps.push(step);
        session.updated_at = new Date().toISOString();

        // Execute action
        try {
          if (decision.action === 'navigate') {
            await page.goto(decision.param, { waitUntil: 'networkidle' });
          } else if (decision.action === 'click') {
            const el = elements.find(e => e.id === decision.param);
            if (el) {
              await page.mouse.click(el.x, el.y);
              await page.waitForTimeout(1000);
            }
          } else if (decision.action === 'type') {
            const { index, text } = decision.param;
            const el = elements.find(e => e.id === index);
            if (el) {
              await page.mouse.click(el.x, el.y);
              await page.keyboard.type(text);
              await page.keyboard.press('Enter');
              await page.waitForTimeout(1000);
            }
          } else if (decision.action === 'scroll_down') {
            await page.mouse.wheel(0, 500);
            await page.waitForTimeout(500);
          } else if (decision.action === 'scroll_up') {
            await page.mouse.wheel(0, -500);
            await page.waitForTimeout(500);
          } else if (decision.action === 'done') {
            session.status = 'completed';
            break;
          }
          await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
        } catch (err: any) {
          step.status = 'failed';
          step.description += ` (Error: ${err.message})`;
          session.updated_at = new Date().toISOString();
        }

        // Short sleep between steps
        await new Promise(r => setTimeout(r, 1000));
      }

      if (session.status === 'running') {
        session.status = 'completed';
      }
    } catch (error: any) {
      console.error("Local agent error:", error);
      session.status = 'failed';
      session.steps.push({
        index: session.steps.length + 1,
        action: 'error',
        description: `Agent failed: ${error.message}`,
        status: 'failed'
      });
    } finally {
      session.updated_at = new Date().toISOString();
      if (browser) await browser.close();
    }
  }
}
