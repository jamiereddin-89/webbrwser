import axios from 'axios';
import { BrowserSession } from '../types';

export const browserApi = {
  async runTask(task: string): Promise<BrowserSession> {
    const response = await axios.post('/api/browser/run', { task });
    return response.data;
  },

  async getSession(id: string): Promise<BrowserSession> {
    const response = await axios.get(`/api/browser/session/${id}`);
    return response.data;
  }
};
