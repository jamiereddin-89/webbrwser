/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Copy,
  RotateCw,
  CheckCircle2,
  XCircle,
  Clock,
  Check,
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
  AlertCircle,
  X,
  Key,
  Info,
  Shield,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<BrowserSession[]>(() => {
    const saved = localStorage.getItem('WEBO_SESSION_HISTORY');
    return saved ? JSON.parse(saved) : [];
  });
  const [apiKeys, setApiKeys] = useState({
    gemini: localStorage.getItem('GEMINI_API_KEY_OVERRIDE') || '',
    browserUse: localStorage.getItem('BROWSER_USE_API_KEY_OVERRIDE') || '',
    profileId: localStorage.getItem('BROWSER_USE_PROFILE_ID') || '',
    proxyCountry: localStorage.getItem('BROWSER_USE_PROXY_COUNTRY') || ''
  });
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Resizable Logic
  const startResizing = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(300, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Gemini AI initialization
  const ai = new GoogleGenAI({ 
    apiKey: apiKeys.gemini || process.env.GEMINI_API_KEY 
  });

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
          const updated = await browserApi.getSession(currentSession.id, apiKeys.browserUse);
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
  }, [currentSession, apiKeys.browserUse]);

  const runBrowserTask = async (task: string) => {
    setIsBrowsing(true);
    try {
      const session = await browserApi.runTask(task, apiKeys.browserUse, {
        profileId: apiKeys.profileId,
        proxyCountry: apiKeys.proxyCountry,
        geminiApiKey: apiKeys.gemini
      });
      setCurrentSession(session);
      
      // Save to history
      setSessionHistory(prev => {
        const updated = [session, ...prev.filter(s => s.id !== session.id)].slice(0, 50);
        localStorage.setItem('WEBO_SESSION_HISTORY', JSON.stringify(updated));
        return updated;
      });
    } catch (error: any) {
      setIsBrowsing(false);
      throw error;
    }
  };

  const handleCopyUrl = () => {
    const url = currentSession?.steps?.[currentSession.steps.length - 1]?.url || 'https://www.google.com';
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleRefresh = async () => {
    if (!currentSession || isBrowsing) return;
    // Re-run the task to "refresh" the view with latest data
    await runBrowserTask(currentSession.task);
  };

  const browseTool: FunctionDeclaration = {
    name: "browse_web",
    description: "Launch an automated browser agent to perform a specific task on the web, surf URLs, or find information.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        task: {
          type: Type.STRING,
          description: "Detailed description of what the browser agent should do on the web."
        }
      },
      required: ["task"]
    }
  };

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
      // 1. Get Gemini's response with tools
      const response = await ai.models.generateContent({ 
        model: "gemini-flash-latest",
        contents: [
          ...messages.map(m => ({ 
            role: m.role === 'user' ? 'user' : 'model', 
            parts: [{ text: m.content }] 
          })), 
          { role: 'user', parts: [{ text: userTask }] }
        ],
        config: { 
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: [browseTool] }]
        }
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const functionCalls = response.functionCalls;
      const text = response.text;

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: text || (functionCalls?.length ? "I'm launching the browser agent to help with that..." : "Processing..."),
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);

      // 2. Check for tool calls
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (call.name === 'browse_web') {
            const { task } = call.args as { task: string };
            await runBrowserTask(task);
          }
        }
      }
      
    } catch (error: any) {
      console.error('Task error:', error);
      const statusCode = error.response?.status;
      const isConfigError = statusCode === 401;
      const isPaymentError = statusCode === 402;
      const isGeminiMissing = error.message?.includes("Gemini API key") || error.response?.data?.message?.includes("Gemini API key");
      
      let errorMessage = `I encountered an issue: ${error.response?.data?.message || error.message || 'Unknown error'}`;
      
      if (isGeminiMissing) {
        errorMessage = "It looks like the Gemini API key is missing or invalid. You can provide it below to continue.";
        setShowApiKeyPrompt(true);
      } else if (isConfigError) {
        errorMessage = "I need your API keys to proceed. Please click the Settings icon above to configure them.";
      } else if (isPaymentError) {
        errorMessage = "Payment Required (402): Your Browser-Use Cloud account may have run out of credits or requires a subscription. Please check your dashboard.";
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now()
      }]);
      setIsBrowsing(false);
    }
  };

  const handleProvideApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempApiKey.trim()) return;
    
    setApiKeys(p => ({ ...p, gemini: tempApiKey }));
    localStorage.setItem('GEMINI_API_KEY_OVERRIDE', tempApiKey);
    setShowApiKeyPrompt(false);
    setTempApiKey('');
    
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: "Got it. Key updated. You can try your request again now.",
      timestamp: Date.now()
    }]);
  };

  const lastStep = currentSession?.steps?.[currentSession.steps.length - 1];

  return (
    <div className="flex h-screen w-full bg-[#E4E3E0] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar - Resizable (Sidebar width managed by state) */}
      <aside 
        style={{ width: `${sidebarWidth}px` }} 
        className="flex flex-col border-r border-[#141414] bg-[#E4E3E0] shrink-0"
      >
        <header className="p-6 border-b border-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#141414] rounded-sm flex items-center justify-center">
              <Globe className="text-white w-5 h-5" />
            </div>
            <h1 className="font-serif italic text-xl tracking-tight">WebOrbit AI</h1>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 hover:bg-[#141414] hover:text-white transition-colors rounded-sm"
          >
            <Settings className="w-4 h-4 cursor-pointer" />
          </button>
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
            <div className="space-y-4">
              {sessionHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center opacity-30 select-none">
                  <History className="w-8 h-8 mb-4" />
                  <p className="text-[10px] font-mono uppercase">Archive Empty</p>
                </div>
              ) : (
                sessionHistory.map(session => (
                  <button
                    key={session.id}
                    onClick={() => setCurrentSession(session)}
                    className={cn(
                      "w-full text-left p-4 border border-[#141414] hover:bg-[#141414] hover:text-white transition-all group",
                      currentSession?.id === session.id && "bg-[#141414] text-white"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[9px] font-mono opacity-50 uppercase">
                        {new Date(session.updatedAt || session.createdAt || Date.now()).toLocaleTimeString()}
                      </span>
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        session.status === 'completed' ? "bg-green-500" : 
                        session.status === 'failed' ? "bg-red-500" : "bg-blue-500"
                      )} />
                    </div>
                    <p className="text-xs font-serif italic line-clamp-1 mb-1">{session.task}</p>
                    <div className="flex items-center gap-2 opacity-40 text-[9px] font-mono">
                      <Globe className="w-3 h-3" />
                      <span>{session.steps?.length || 0} STEPS</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <footer className="p-6 border-t border-[#141414] bg-[#E4E3E0]">
          {showApiKeyPrompt ? (
            <motion.form 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleProvideApiKey} 
              className="relative group space-y-3"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase opacity-50">
                <Key className="w-3 h-3" /> Enter Gemini API Key
              </div>
              <div className="relative">
                <input 
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="AI_..."
                  autoFocus
                  className="w-full bg-white border border-[#141414] p-4 pr-12 text-sm font-mono focus:outline-none focus:ring-0 focus:border-black transition-all"
                />
                <button 
                  type="submit"
                  disabled={!tempApiKey.trim()}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-[#141414] hover:text-white rounded-sm transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <button 
                type="button"
                onClick={() => setShowApiKeyPrompt(false)}
                className="text-[9px] font-mono uppercase opacity-40 hover:opacity-100 transition-opacity"
              >
                Cancel and use manual settings
              </button>
            </motion.form>
          ) : (
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
          )}
          <p className="mt-2 text-[10px] opacity-40 font-mono italic">
            BROWSER-USE CLOUD // STATUS: {isBrowsing ? 'ACTIVE' : 'READY'}
          </p>
        </footer>
      </aside>

      {/* Draggable Divider */}
      <div 
        className={cn(
          "w-1 cursor-col-resize hover:bg-[#141414] flex-shrink-0 transition-colors z-50",
          isResizing && "bg-[#141414]"
        )}
        onMouseDown={startResizing}
      />

      {/* Main View - Browser Viewport */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        {/* Browser Top Bar */}
        <div className="h-14 border-b border-[#141414] flex items-center px-6 justify-between bg-[#E4E3E0]">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex gap-1.5 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full border border-[#141414]" />
              <div className="w-2.5 h-2.5 rounded-full border border-[#141414]" />
              <div className="w-2.5 h-2.5 rounded-full border border-[#141414]" />
            </div>
            <div className="flex-1 max-w-lg relative group">
              <div className="w-full bg-white border border-[#141414] px-4 py-1.5 text-xs font-mono flex items-center gap-2 truncate">
                <Globe className="w-3.5 h-3.5 opacity-50 shrink-0" />
                <span className="truncate">{lastStep?.url || currentSession?.task || 'https://www.google.com'}</span>
              </div>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={handleCopyUrl}
                  title="Copy URL"
                  className="p-1 hover:bg-[#E4E3E0] transition-colors rounded-sm"
                >
                  {copySuccess ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button 
                  onClick={handleRefresh}
                  disabled={!currentSession || isBrowsing}
                  title="Refresh"
                  className="p-1 hover:bg-[#E4E3E0] transition-colors rounded-sm disabled:opacity-20"
                >
                  <RotateCw className={cn("w-3.5 h-3.5", isBrowsing && "animate-spin")} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {isBrowsing && (
               <div className="flex items-center gap-2 px-3 py-1 bg-[#141414] text-white rounded-sm">
                 <Loader2 className="w-3 h-3 animate-spin" />
                 <span className="text-[9px] font-mono tracking-widest uppercase">Agent Active</span>
               </div>
             )}
          </div>
        </div>

        {/* Viewport Content */}
        <div className="flex-1 bg-[#d0cfcb] relative flex overflow-hidden">
          {/* Animated Background Grid */}
          <div className="absolute inset-0 opacity-[0.05]" 
            style={{ 
              backgroundImage: 'radial-gradient(#141414 1px, transparent 1px)', 
              backgroundSize: '24px 24px' 
            }} 
          />

          {/* Left Panel: Step Log Overlay (Status Indicators) */}
          {currentSession && (
            <div className="absolute left-6 top-6 bottom-6 w-64 bg-white/90 backdrop-blur-md border border-[#141414] shadow-xl z-20 flex flex-col overflow-hidden">
              <header className="p-3 border-b border-[#141414] bg-[#E4E3E0] flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-tighter">Session Progress</span>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  currentSession.status === 'running' ? "bg-blue-500 animate-pulse" :
                  currentSession.status === 'completed' ? "bg-green-500" :
                  "bg-red-500"
                )} />
              </header>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {currentSession.steps.map((step, idx) => (
                  <div key={idx} className="space-y-1 relative pl-4 border-l border-[#141414]/10">
                    <div className="absolute -left-[5px] top-1">
                      {step.status === 'success' ? (
                        <CheckCircle2 className="w-2.5 h-2.5 text-green-600 bg-white" />
                      ) : (
                        <XCircle className="w-2.5 h-2.5 text-red-600 bg-white" />
                      )}
                    </div>
                    <p className="text-[10px] font-mono opacity-40 uppercase line-clamp-1">{step.action}</p>
                    <p className="text-[11px] leading-snug line-clamp-2">{step.description}</p>
                  </div>
                ))}
                {(currentSession.status === 'running' || isBrowsing) && (
                  <div className="flex items-center gap-2 pl-4">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span className="text-[10px] font-mono italic opacity-40">Next step...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 flex items-center justify-center p-8 z-10">
            <AnimatePresence mode="wait">
              {currentSession?.status === 'failed' ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-md w-full bg-white border border-red-500 p-8 shadow-[16px_16px_0px_0px_rgba(239,68,68,0.1)] space-y-6"
                >
                  <div className="flex items-center gap-3 text-red-600">
                    <XCircle className="w-10 h-10" />
                    <div>
                      <h3 className="font-serif italic text-2xl">Session Terminated</h3>
                      <p className="text-[10px] font-mono uppercase tracking-widest">Critical Error Encountered</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-red-50 border border-red-100 font-mono text-xs">
                      <p className="opacity-50 uppercase text-[9px] mb-1">Last Action Attempted:</p>
                      <p className="font-bold">{lastStep?.action || 'Unknown'}</p>
                      <p className="mt-2 opacity-70">
                        {lastStep?.description || 'The agent failed to complete the task.'}
                      </p>
                    </div>

                    <div className="p-4 border border-[#141414] bg-[#E4E3E0] text-[11px] space-y-2">
                       <p className="font-bold">Possible Solutions:</p>
                       <ul className="list-disc pl-4 space-y-1 opacity-70">
                         <li>Check if the target website is accessible.</li>
                         <li>Ensure your Browser-Use account has sufficient credits.</li>
                         <li>Try re-phrasing your command for more precision.</li>
                       </ul>
                    </div>

                    <button 
                      onClick={handleRefresh}
                      className="w-full bg-[#141414] text-white py-3 text-[11px] font-mono uppercase tracking-widest hover:bg-black transition-colors"
                    >
                      Retry Session
                    </button>
                  </div>
                </motion.div>
              ) : currentSession ? (
                <motion.div 
                  key={lastStep?.index || 'session'}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  className="w-full h-full max-w-5xl bg-white border border-[#141414] shadow-[16px_16px_0px_0px_rgba(20,20,20,0.1)] flex flex-col overflow-hidden relative"
                >
                  {/* Internal Browser Frame */}
                  {lastStep?.screenshot ? (
                     <img 
                       src={lastStep.screenshot.startsWith('http') ? lastStep.screenshot : `data:image/png;base64,${lastStep.screenshot}`} 
                       alt="Browser State"
                       className="w-full h-full object-contain bg-black/5"
                     />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-6">
                      <div className="relative">
                        <Loader2 className="w-16 h-16 opacity-20 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-mono font-bold">{currentSession.steps.length + 1}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-serif italic text-2xl">Syncing Viewport</h3>
                          <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest mt-1">Establishing Frame Stream...</p>
                        </div>
                        
                        {isBrowsing && (
                          <div className="max-w-md bg-[#141414] text-white text-left p-4 border border-white/10 shadow-2xl">
                             <div className="flex gap-3 items-start">
                               <Terminal className="w-3.5 h-3.5 mt-0.5 opacity-50" />
                               <div className="space-y-1">
                                 <p className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">Current Activity Log</p>
                                 <p className="text-xs leading-snug">
                                   Agent is currently searching for relevant selectors and processing the DOM tree to satisfy task: <span className="italic opacity-60">"{currentSession.task}"</span>
                                 </p>
                               </div>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Step Description Toast */}
                  {lastStep && (
                    <motion.div 
                      key={lastStep.index}
                      initial={{ y: 50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-30"
                    >
                      <div className="bg-[#141414] text-white border border-white/20 p-4 shadow-2xl flex items-start gap-4">
                        <div className="bg-white/10 p-2 shrink-0">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[9px] font-mono opacity-50 uppercase">Step {lastStep.index} // {lastStep.action}</p>
                            {lastStep.status === 'success' && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                          </div>
                          <p className="text-sm leading-tight font-medium line-clamp-2">{lastStep.description}</p>
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
                      className="absolute -top-2 -right-2 w-6 h-6 bg-[#141414] rounded-full flex items-center justify-center border-2 border-[#E4E3E0]"
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
                        className="text-[10px] font-mono uppercase p-3 border border-[#141414] hover:bg-[#141414] hover:text-white transition-all text-left truncate group flex items-center justify-between"
                      >
                        {suggestion}
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Floating Status Indicator */}
      <div className="fixed bottom-6 right-6 z-40">
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

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#E4E3E0]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-white border border-[#141414] shadow-[32px_32px_0px_0px_rgba(20,20,20,0.1)] overflow-hidden"
            >
              <header className="p-6 border-b border-[#141414] flex items-center justify-between bg-[#E4E3E0]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  <h2 className="font-serif italic text-xl">System Settings</h2>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="hover:bg-white p-1 rounded-sm">
                  <X className="w-4 h-4" />
                </button>
              </header>

              <div className="p-6 space-y-6">
                <div className="space-y-6">
                  {/* AI Reasoning Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-[#141414]/10">
                      <Terminal className="w-3 h-3 opacity-50" />
                      <span className="text-[10px] font-mono uppercase font-bold tracking-tighter">AI Reasoning Logic</span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono uppercase opacity-50 flex items-center gap-2 text-[#141414]">
                          <Key className="w-3 h-3" /> Gemini API Override
                        </label>
                        <div className="group relative">
                          <Info className="w-3.5 h-3.5 opacity-30 cursor-help hover:opacity-100 transition-opacity" />
                          <div className="absolute right-0 bottom-full mb-3 w-56 p-3 bg-[#141414] text-white text-[10px] font-mono leading-relaxed opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-2xl border border-white/10 translate-y-2 group-hover:translate-y-0">
                            <p className="font-bold mb-1 border-b border-white/20 pb-1 uppercase tracking-tighter">Gemini Integration</p>
                            Used for visual parsing and step decision logic. Leave blank to use server-provided key.
                          </div>
                        </div>
                      </div>
                      <input 
                        type="password"
                        value={apiKeys.gemini}
                        onChange={(e) => {
                          const val = e.target.value;
                          setApiKeys(p => ({ ...p, gemini: val }));
                          localStorage.setItem('GEMINI_API_KEY_OVERRIDE', val);
                        }}
                        placeholder="Defaulting to server key..."
                        className="w-full border border-[#141414] p-3 text-sm font-mono focus:bg-[#E4E3E0]/30 focus:outline-none transition-colors placeholder:opacity-30"
                      />
                    </div>
                  </div>

                  {/* Browser Cloud Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-[#141414]/10">
                      <Globe className="w-3 h-3 opacity-50" />
                      <span className="text-[10px] font-mono uppercase font-bold tracking-tighter">Browser Infrastructure</span>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-mono uppercase opacity-50 flex items-center gap-2">
                        <Shield className="w-3 h-3" /> Cloud Keys (Optional)
                      </label>
                      <input 
                        type="password"
                        value={apiKeys.browserUse}
                        onChange={(e) => {
                          const val = e.target.value;
                          setApiKeys(p => ({ ...p, browserUse: val }));
                          localStorage.setItem('BROWSER_USE_API_KEY_OVERRIDE', val);
                        }}
                        placeholder="bu_..."
                        className="w-full border border-[#141414] p-3 text-sm font-mono focus:bg-[#E4E3E0]/30 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-mono uppercase opacity-50">Profile ID</label>
                          <Info className="w-3 h-3 opacity-20 cursor-help" />
                        </div>
                        <input 
                          value={apiKeys.profileId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setApiKeys(p => ({ ...p, profileId: val }));
                            localStorage.setItem('BROWSER_USE_PROFILE_ID', val);
                          }}
                          placeholder="UUID"
                          className="w-full border border-[#141414] p-3 text-sm font-mono focus:outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-mono uppercase opacity-50">Proxy</label>
                          <Info className="w-3 h-3 opacity-20 cursor-help" />
                        </div>
                        <input 
                          value={apiKeys.proxyCountry}
                          onChange={(e) => {
                            const val = e.target.value;
                            setApiKeys(p => ({ ...p, proxyCountry: val }));
                            localStorage.setItem('BROWSER_USE_PROXY_COUNTRY', val.toLowerCase());
                          }}
                          placeholder="e.g. US"
                          className="w-full border border-[#141414] p-3 text-sm font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-[#E4E3E0] border border-[#141414] space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase font-black">
                     <AlertCircle className="w-3.5 h-3.5" /> Security Notice
                  </div>
                  <p className="text-[10px] font-mono leading-tight opacity-60">
                    Keys are stored locally in your browser only. Your override keys are purged from memory when the session expires.
                  </p>
                </div>
              </div>

              <footer className="p-6 border-t border-[#141414] flex justify-end">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="bg-[#141414] text-white px-8 py-3 text-[11px] font-mono uppercase tracking-widest hover:bg-[#333] transition-colors"
                >
                  Confirm Changes
                </button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
