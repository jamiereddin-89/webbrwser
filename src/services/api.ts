import axios from 'axios';
import { BrowserSession } from '../types';

export const browserApi = {
  async runTask(task: string, apiKey?: string, options?: { profileId?: string, proxyCountry?: string, geminiApiKey?: string }): Promise<BrowserSession> {
    const headers: Record<string, string> = {};
    if (apiKey) headers['x-browser-use-api-key'] = apiKey;
    if (options?.geminiApiKey) headers['x-gemini-api-key'] = options.geminiApiKey;
    
    const response = await axios.post('/api/browser/run', { 
      task, 
      profileId: options?.profileId, 
      proxyCountry: options?.proxyCountry 
    }, { headers });
    return response.data;
  },

  async getSession(id: string, apiKey?: string): Promise<BrowserSession> {
    const headers: Record<string, string> = {};
    if (apiKey) headers['x-browser-use-api-key'] = apiKey;

    const response = await axios.get(`/api/browser/session/${id}`, { headers });
    return response.data;
  }
};
