export interface BrowserSession {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  task: string;
  steps: BrowserStep[];
  created_at: string;
  updated_at: string;
}

export interface BrowserStep {
  index: number;
  action: string;
  description: string;
  screenshot?: string; // base64 or URL
  status: 'success' | 'failed';
  url?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sessionId?: string;
}
