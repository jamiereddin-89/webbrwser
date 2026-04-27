/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Send, 
  Globe, 
  RefreshCw, 
  Layout, 
  MessageSquare, 
  History, 
  Settings,
  ChevronRight,
  ExternalLink,
  Terminal,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { browserApi } from './services/api';
import { BrowserSession, BrowserStep, ChatMessage } from './types';
import { cn } from './lib/utils';

// Constants
const SYSTEM_PROMPT = `You are Orbit, a powerful web-browsing AI agent. 
Your goal is to help users browse the web, find information, and perform tasks using the browser-use tool.
When a user gives you a task that involves web browsing:
1. Briefly acknowledge the task.
2. Formulate a precise instruction for the browser.
3. Don't mention the technical details unless asked.
Always stay helpful and concise.`;

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [currentSession, setCurrentSession] = useState<BrowserSession | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Gemini AI initialization
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Polling for session updates
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentSession && (currentSession.status === 'running' || currentSession.status === 'paused')) {
      interval = setInterval(async () => {
        try {
          const updated = await browserApi.getSession(currentSession.id);
          setCurrentSession(updated);
          if (updated.status === 'completed' || updated.status === 'failed') {
            setIsBrowsing(false);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [currentSession]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isBrowsing) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMessage]);
    const userTask = input;
    setInput('');

    try {
      // 1. Get Gemini's response/acknowledgement
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-latest",
        contents: [...messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })), { role: 'user', parts: [{ text: userTask }] }],
        config: { systemInstruction: SYSTEM_PROMPT }
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: geminiResponse.text || "I'll start browsing for you.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);

      // 2. Start the browser task
      setIsBrowsing(true);
      const session = await browserApi.runTask(userTask);
      setCurrentSession(session);
      
    } catch (error: any) {
      console.error('Task error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I encountered an error while trying to browse: " + (error.message || 'Unknown error'),
        timestamp: Date.now()
      }]);
      setIsBrowsing(false);
    }
  };

  const lastStep = currentSession?.steps?.[currentSession.steps.length - 1];

  return (
    <div className="flex h-screen w-full bg-[#E4E3E0] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar - Visible Grid Structure (Recipe 1) */}
      <aside className="w-[380px] flex flex-col border-r border-[#141414] bg-[#E4E3E0]">
        <header className="p-6 border-bottom border-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#141414] rounded-sm flex items-center justify-center">
              <Globe className="text-white w-5 h-5" />
            </div>
            <h1 className="font-serif italic text-xl tracking-tight">WebOrbit AI</h1>
          </div>
          <Settings className="w-5 h-5 opacity-40 cursor-pointer hover:opacity-100 transition-opacity" />
        </header>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#141414]">
          <button 
            onClick={() => setActiveTab('chat')}
            className={cn(
              "flex-1 py-3 text-[11px] font-mono uppercase tracking-widest text-center transition-colors",
              activeTab === 'chat' ? "bg-[#141414] text-white" : "hover:bg-[#d6d5d2]"
            )}
          >
            Terminal Interface
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 py-3 text-[11px] font-mono uppercase tracking-widest text-center transition-colors",
              activeTab === 'history' ? "bg-[#141414] text-white" : "hover:bg-[#d6d5d2]"
            )}
          >
            Log History
          </button>
        </div>

        {/* Chat / History Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'chat' ? (
            <>
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "space-y-1",
                      msg.role === 'user' ? "text-right" : "text-left"
                    )}
                  >
                    <span className="text-[10px] font-mono uppercase opacity-40">
                      {msg.role} // {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <p className={cn(
                      "text-sm leading-relaxed max-w-[90%]",
                      msg.role === 'user' ? "ml-auto" : "mr-auto"
                    )}>
                      {msg.content}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </>
          ) : (
            <div className="space-y-4 opacity-40">
              <p className="text-[11px] font-mono uppercase">No recent sessions found.</p>
            </div>
          )}
        </div>

        {/* Input Area */}
        <footer className="p-6 border-t border-[#141414] bg-[#E4E3E0]">
          <form onSubmit={handleSend} className="relative group">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isBrowsing}
              placeholder={isBrowsing ? "Agent is browsing..." : "Command the browser..."}
              className="w-full bg-white border border-[#141414] p-4 pr-12 text-sm focus:outline-none focus:ring-0 focus:border-black transition-all placeholder:italic placeholder:opacity-50"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isBrowsing}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-[#141414] hover:text-white rounded-sm transition-all"
            >
              {isBrowsing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          </form>
          <p className="mt-2 text-[10px] opacity-40 font-mono italic">
            BROWSER-USE CLOUD // STATUS: {isBrowsing ? 'ACTIVE' : 'READY'}
          </p>
        </footer>
      </aside>

      {/* Main View - Browser Viewport */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        {/* Browser Top Bar */}
        <div className="h-14 border-b border-[#141414] flex items-center px-6 justify-between bg-[#E4E3E0]">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full border border-[#141414]" />
              <div className="w-2.5 h-2.5 rounded-full border border-[#141414]" />
              <div className="w-2.5 h-2.5 rounded-full border border-[#141414]" />
            </div>
            <div className="flex-1 max-w-lg relative">
              <div className="w-full bg-white border border-[#141414] px-4 py-1.5 text-xs font-mono flex items-center gap-2 truncate">
                < Globe className="w-3.5 h-3.5 opacity-50" />
                {lastStep?.url || currentSession?.task || 'https://www.google.com'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {isBrowsing && (
               <div className="flex items-center gap-2 px-3 py-1 bg-[#141414] text-white rounded-full">
                 <Loader2 className="w-3 h-3 animate-spin" />
                 <span className="text-[10px] font-mono tracking-widest uppercase">Agent Running</span>
               </div>
             )}
          </div>
        </div>

        {/* Viewport Content */}
        <div className="flex-1 bg-[#d0cfcb] relative p-8 flex items-center justify-center overflow-hidden">
          {/* Animated Background Grid */}
          <div className="absolute inset-0 opacity-[0.05]" 
            style={{ 
              backgroundImage: 'radial-gradient(#141414 1px, transparent 1px)', 
              backgroundSize: '24px 24px' 
            }} 
          />

          <AnimatePresence mode="wait">
            {currentSession ? (
              <motion.div 
                key={lastStep?.index || 'session'}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="w-full h-full max-w-5xl bg-white border border-[#141414] shadow-[16px_16px_0px_0px_rgba(20,20,20,0.1)] flex flex-col overflow-hidden"
              >
                {/* Internal Browser Frame */}
                {lastStep?.screenshot ? (
                   <img 
                     src={lastStep.screenshot.startsWith('http') ? lastStep.screenshot : `data:image/png;base64,${lastStep.screenshot}`} 
                     alt="Browser State"
                     className="w-full h-full object-contain bg-black/5"
                   />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
                    <History className="w-12 h-12 opacity-20" />
                    <div>
                      <h3 className="font-serif italic text-2xl">Initializing Session</h3>
                      <p className="text-sm opacity-50 font-mono mt-1">ESTABLISHING SECURE TUNNEL TO CLOUD AGENT...</p>
                    </div>
                  </div>
                )}
                
                {/* Step Description Toast */}
                {lastStep && (
                  <motion.div 
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-xl px-4"
                  >
                    <div className="bg-[#141414] text-white border border-white/20 p-4 shadow-xl">
                      <div className="flex items-start gap-4">
                        <div className="bg-white/10 p-2">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-mono opacity-50 uppercase mb-1">Step {lastStep.index} // {lastStep.action}</p>
                          <p className="text-sm leading-tight">{lastStep.description}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center text-center max-w-md space-y-8"
              >
                <div className="relative">
                  <div className="w-24 h-24 border border-[#141414] rotate-45 flex items-center justify-center bg-[#E4E3E0]">
                    <Search className="w-10 h-10 -rotate-45" />
                  </div>
                  <motion.div 
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-[#141414] rounded-full flex items-center justify-center"
                  >
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  </motion.div>
                </div>
                <div className="space-y-2">
                  <h2 className="font-serif italic text-3xl">Ready to Explore?</h2>
                  <p className="text-sm opacity-50 leading-relaxed">
                    Enter a natural language command in the terminal to start an automated browsing session. 
                    I'll perform actions, extract data, and report back in real-time.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full">
                  {[
                    "Search for today's news",
                    "Find top GitHub repos",
                    "Check weather in London",
                    "Latest SpaceX tweet"
                  ].map(suggestion => (
                    <button 
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="text-[10px] font-mono uppercase p-3 border border-[#141414] hover:bg-[#141414] hover:text-white transition-all text-left truncate"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Floating Status Indicator */}
      <div className="fixed bottom-6 right-6">
        <div className="flex rounded-sm overflow-hidden shadow-2xl border border-[#141414]">
          <div className="bg-[#141414] text-white p-3 font-mono text-[10px] uppercase">
            System
          </div>
          <div className="bg-white p-3 font-mono text-[10px] uppercase flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-green-500" />
             Healthy
          </div>
        </div>
      </div>
    </div>
  );
}
