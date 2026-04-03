'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Code, Terminal, Send, 
  PanelRightClose, Plus, Settings, Cpu, 
  ChevronRight, Compass, HelpCircle, User, 
  Sparkles, History, Paperclip, Mic, ArrowUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import CodeArtifact from '@/components/CodeArtifact';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    duration: string;
  };
}

export default function ClaudeV3() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hocam selamlar! GitLawb AI (V3 Premium) hazır. Yerel Llama 3.1 modelinle konuşmaya başlayabiliriz. Seni dinliyorum!" }
  ]);
  const [input, setInput] = useState('');
  const [showArtifact, setShowArtifact] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('llama3.1');
  const [agentTraces, setAgentTraces] = useState<any[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [artifactMode, setArtifactMode] = useState<'agent' | 'code'>('agent');
  const [currentCode, setCurrentCode] = useState<{ language: string, content: string, filename?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'data'>('chat');
  const [isIngesting, setIsIngesting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        // Eğer llama3.1 yoksa ilk modeli seçelim
        if (!data.models.find((m: any) => m.name === 'llama3.1') && data.models.length > 0) {
          setSelectedModel(data.models[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // AI Ajanı tetikle (Eğer mesaj /agent ile başlıyorsa veya belirli anahtar kelimeler içeriyorsa)
    if (input.toLowerCase().startsWith('/agent') || input.toLowerCase().includes('kimliğimi kontrol et') || input.toLowerCase().includes('ödülleri listele')) {
      setIsAgentRunning(true);
      setShowArtifact(true);
      setAgentTraces([]);
      
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            task: input.replace('/agent', '').trim(),
            model: selectedModel 
          }),
        });
        const data = await res.json();
        if (data.traces) setAgentTraces(data.traces);
        if (data.finalAnswer) {
          setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: data.finalAnswer }]);
        }
      } catch (err) {
        setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: "Hata: Ajan çalıştırılamadı." }]);
      } finally {
        setIsAgentRunning(false);
        setIsLoading(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages,
          model: selectedModel 
        }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev: Message[]) => [...prev, { ...data.message, usage: data.usage }]);
        
        // Kod bloğu tespiti
        const codeMatch = data.message.content.match(/```(\w+)?\n([\s\S]+?)```/);
        if (codeMatch) {
          const language = codeMatch[1] || 'plaintext';
          const content = codeMatch[2];
          setCurrentCode({ language, content });
          setArtifactMode('code');
          setShowArtifact(true);
        }
      }
    } catch (err) {
      setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: "Hata: Ollama'ya bağlanılamadı. Lütfen 'ollama serve' yap." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsIngesting(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('topic', 'gitlawb-ingest');

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });
      
      const resText = await res.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch (e) {
        console.error("RAW ERROR FROM SERVER:", resText);
        throw new Error(`Server returned non-JSON: ${resText.substring(0, 100)}...`);
      }

      if (data.success) {
        setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: `✅ Dosya başarıyla sisteme işlendi: **${file.name}**\n\nBu belge artık MinIO'da saklanıyor, Kafka üzerinden akıyor ve Qdrant (Vektör DB) üzerinden anlık olarak analiz edilebilir durumda.` }]);
      } else {
        alert("Yükleme hatası: " + data.error);
      }
    } catch (err) {
      console.error('Upload Error:', err);
      alert("Pipeline bağlantısı kurulamadı.");
    } finally {
      setIsIngesting(false);
      if (event.target) event.target.value = '';
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#171717] text-[#ececec] font-sans selection:bg-amber-500/30">
      
      {/* 1. SIDEBAR (Claude Premium Sidebar) */}
      <aside className="w-64 bg-[#111111] border-r border-[#222] flex flex-col p-3 transition-all duration-300">
        <div className="flex items-center gap-2 mb-6 px-2 py-1">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-orange-400 shadow-lg" />
          <span className="font-black text-sm tracking-tight">GitLawb AI</span>
        </div>

        <button 
          onClick={() => setMessages([{ role: 'assistant', content: "Hocam selamlar! Yeni sohbet başladı. GitLawb AI (V3 Premium) hazır. Seni dinliyorum!" }])}
          className="flex items-center justify-between gap-3 w-full p-2.5 mb-8 rounded-lg hover:bg-[#222] transition-all group border border-transparent hover:border-[#333]"
        >
          <div className="flex items-center gap-3">
             <Plus size={18} className="text-amber-500" />
             <span className="text-sm font-semibold">New Chat</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono group-hover:block hidden">⌘K</span>
        </button>
        
        <div className="flex-1 space-y-8 overflow-y-auto pr-1 scrollbar-none px-2">
          <div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">
               <Cpu size={12} /> System Hub
            </div>
            <div className="space-y-1">
              <button 
                onClick={() => setActiveTab('chat')}
                className={`w-full flex items-center gap-3 p-2 rounded-lg transition ${activeTab === 'chat' ? 'bg-[#222] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <MessageSquare size={16} /> <span className="text-sm font-medium">Assistant</span>
              </button>
              <button 
                onClick={() => setActiveTab('data')}
                className={`w-full flex items-center gap-3 p-2 rounded-lg transition ${activeTab === 'data' ? 'bg-[#222] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Terminal size={16} /> <span className="text-sm font-medium">Data Pipeline</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-1 border-t border-[#222] pt-4 px-2">
          <button className="flex items-center gap-3 w-full p-2 text-gray-400 hover:text-white transition rounded-md hover:bg-[#222]">
            <HelpCircle size={18} /> <span className="text-sm">Help & Feedback</span>
          </button>
          <div className="flex items-center gap-3 w-full p-2 group cursor-pointer hover:bg-[#222] rounded-lg transition duration-300">
            <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center border border-[#333]">
              <User size={16} className="text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
               <div className="text-xs font-bold truncate">Omer Cakan</div>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT (Centered Chat) */}
      <main className="flex-1 flex flex-col items-center overflow-hidden bg-[#171717] relative">
        
        {/* Header Bar */}
        <header className="absolute top-0 inset-x-0 h-14 bg-[#171717]/80 backdrop-blur-md flex items-center justify-between px-6 z-50 border-b border-transparent group hover:border-[#222] transition-colors">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
             <select 
               value={selectedModel} 
               onChange={(e) => setSelectedModel(e.target.value)}
               className="bg-transparent border-none text-gray-400 focus:outline-none focus:ring-0 cursor-pointer hover:text-white transition-colors"
             >
               {models.length > 0 ? (
                 models.map((m: any) => (
                   <option key={m.name} value={m.name} className="bg-[#171717]">{m.name}</option>
                 ))
               ) : (
                 <option value="llama3.1">llama3.1</option>
               )}
             </select>
             <ChevronRight size={14} /> <span className="text-gray-200">GitLawb Plugin</span>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setShowArtifact(!showArtifact)} className={`p-2 rounded-lg hover:bg-[#2a2a2a] transition duration-200 ${showArtifact ? 'text-amber-500' : 'text-gray-400'}`}>
                <Code size={18} />
             </button>
             <button className="p-2 rounded-lg hover:bg-[#2a2a2a] text-gray-400 transition duration-200">
                <Settings size={18} />
             </button>
          </div>
        </header>

        {/* Message Container */}
        {activeTab === 'chat' ? (
          <div className="flex-1 w-full overflow-y-auto px-6 overflow-x-hidden scrollbar-thin">
            <div className="max-w-3xl mx-auto py-24 space-y-16">
              {messages.map((m: Message, i: number) => (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  key={i} 
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {m.role === 'user' ? (
                    <div className="bg-[#2a2a2a] text-gray-100 px-6 py-3.5 rounded-3xl max-w-[85%] text-[15px] leading-7 shadow-sm border border-[#333]">
                      {m.content}
                    </div>
                  ) : (
                    <div className="w-full flex">
                      <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center mr-6 shrink-0 mt-1 border border-amber-500/20">
                         <Sparkles size={16} className="text-amber-500" />
                      </div>
                      <div className="flex-1 overflow-x-hidden">
                        <div className="text-[16px] leading-[1.8] text-gray-200 prose prose-invert max-w-none">
                          <ReactMarkdown
                            components={{
                              code({node, inline, className, children, ...props}: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <div className="mt-4 mb-4 rounded-xl overflow-hidden border border-[#333]">
                                    <div className="bg-[#222] px-4 py-1.5 text-[10px] uppercase font-bold text-gray-500 flex justify-between items-center border-b border-[#333]">
                                      <span>{match[1]}</span>
                                      <button 
                                        onClick={() => {
                                          setCurrentCode({ language: match[1], content: String(children).replace(/\n$/, '') });
                                          setArtifactMode('code');
                                          setShowArtifact(true);
                                        }}
                                        className="hover:text-white transition-colors"
                                      >
                                        Open in Artifact
                                      </button>
                                    </div>
                                    <pre className="p-4 bg-[#111] overflow-x-auto text-sm">
                                      <code>{children}</code>
                                    </pre>
                                  </div>
                                ) : (
                                  <code className="bg-[#2a2a2a] px-1.5 py-0.5 rounded text-amber-500 font-mono text-sm" {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>,
                              h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6 text-white">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-xl font-bold mb-4 mt-6 text-white">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-lg font-bold mb-3 mt-4 text-white">{children}</h3>,
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>

                        {/* Detailed Usage Badge */}
                        {m.usage && (
                          <div className="mt-6 flex flex-wrap gap-2 items-center">
                            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest bg-black/30 px-2 py-1 rounded border border-[#222]">
                              {m.usage.total_tokens} TOKENS
                            </span>
                            <span className="text-[10px] text-gray-600 font-mono">
                              (IN: {m.usage.prompt_tokens} | OUT: {m.usage.completion_tokens} | SPEED: {m.usage.duration}s)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
              
              {isLoading && (
                <div className="flex items-center gap-3 pl-14 text-amber-500/50">
                   <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                   <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse delay-100" />
                   <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse delay-200" />
                </div>
              )}
              <div ref={messagesEndRef} className="h-40" />
            </div>
          </div>
        ) : (
          <div className="flex-1 w-full overflow-y-auto px-12 py-24">
            <div className="max-w-5xl mx-auto space-y-12">
               <div className="flex justify-between items-end">
                  <div>
                    <h1 className="text-4xl font-black mb-2 tracking-tighter">Enterprise Data Hub</h1>
                    <p className="text-gray-500 text-lg">Kafka + MinIO + Qdrant Pipeline Status</p>
                  </div>
                  <div className="flex gap-4">
                     <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isIngesting}
                        className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2 group"
                     >
                        {isIngesting ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                        )}
                        {isIngesting ? 'Processing...' : 'New Ingestion'}
                     </button>
                     <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileUpload}
                     />
                  </div>
               </div>

               <div className="grid grid-cols-3 gap-6">
                  {[
                    { label: 'Kafka Streams', value: 'Active', color: 'text-green-500', icon: <Terminal /> },
                    { label: 'Qdrant (Vectors)', value: 'Live KNN', color: 'text-blue-400', icon: <History /> },
                    { label: 'RAG Chunking', value: '1.5k Overlap', color: 'text-amber-500', icon: <Cpu /> }
                  ].map((stat, i) => (
                    <div key={i} className="bg-[#1e1e1e] border border-[#333] p-6 rounded-2xl space-y-4 hover:border-amber-500/30 transition-all group">
                       <div className="flex justify-between items-center text-gray-500">
                          <span className="text-[10px] font-bold uppercase tracking-widest">{stat.label}</span>
                          <div className="p-2 bg-black/20 rounded-lg group-hover:text-white transition-colors">{stat.icon}</div>
                       </div>
                       <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                    </div>
                  ))}
               </div>

               <div className="bg-[#1e1e1e] border border-[#333] rounded-3xl overflow-hidden">
                  <div className="px-8 py-6 border-b border-[#333] flex justify-between items-center">
                    <span className="font-bold flex items-center gap-2"><Sparkles size={18} className="text-amber-500" /> Pipeline Activity Log</span>
                    <button className="text-xs text-amber-500 font-bold hover:underline">View All</button>
                  </div>
                  <div className="p-8 space-y-6">
                     {[
                       "Universal File Ingestion active: CSV, TXT, PDF enabled via unpdf/UTF-8 buffer.",
                       "Chunking strategy applied: 1500 chars with 200 overlap to preserve semantic context.",
                       "Dynamic Qdrant Vector Search integrated directly into LLM System Prompt."
                     ].map((msg, i) => (
                       <div key={i} className="flex gap-4 items-start border-l-2 border-amber-500/20 pl-4 py-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0 animate-pulse" />
                          <p className="text-gray-300 text-sm leading-relaxed">{msg}</p>
                       </div>
                     ))}
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* Input Dock (Claude V3 Style) */}
        <div className="w-full max-w-3xl px-6 absolute bottom-8 z-50">
           <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-600/20 to-orange-600/20 rounded-3xl blur opacity-0 group-focus-within:opacity-100 transition duration-1000"></div>
              <div className="relative bg-[#212121] border border-[#333] rounded-3xl shadow-2xl transition-all duration-300 focus-within:border-amber-900/50">
                <textarea 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder="Ask GitLawb AI anything..."
                  className="w-full bg-transparent text-gray-100 text-lg px-6 pt-5 pb-1 focus:outline-none resize-none min-h-[64px] max-h-64 scrollbar-none"
                  rows={2}
                />
                <div className="flex items-center justify-between px-4 pb-4">
                  <div className="flex items-center gap-1.5">
                    <button className="p-2 text-gray-500 hover:text-gray-200 hover:bg-[#2a2a2a] rounded-xl transition duration-200"><Paperclip size={18} /></button>
                    <button className="p-2 text-gray-500 hover:text-gray-200 hover:bg-[#2a2a2a] rounded-xl transition duration-200"><Mic size={18} /></button>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className="text-[10px] text-gray-600 font-mono hidden sm:block">GitLawb Plugin Active</span>
                     <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className={`p-2 rounded-xl transition-all duration-300 ${input.trim() && !isLoading ? 'bg-amber-600 text-white shadow-xl shadow-amber-900/50 scale-105' : 'bg-[#2a2a2a] text-gray-600'}`}
                     >
                        <ArrowUp size={20} />
                     </button>
                  </div>
                </div>
              </div>
           </div>
        </div>
      </main>

      {/* 3. ARTIFACTS PANEL (Premium Slide) */}
      <AnimatePresence>
        {showArtifact && (
          <motion.aside 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[45%] h-full bg-[#0a0a0a] border-l border-[#222] shadow-[ -20px_0_50px_rgba(0,0,0,0.5)] z-[60] flex flex-col"
          >
            <div className="h-14 border-b border-[#222] flex items-center px-6 justify-between bg-[#111] backdrop-blur-md">
               <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded border ${artifactMode === 'agent' ? 'bg-amber-500/10 text-amber-500 border-amber-500/10' : 'bg-blue-500/10 text-blue-400 border-blue-500/10'}`}>
                    {artifactMode === 'agent' ? <Terminal size={16} /> : <Code size={16} />}
                  </div>
                  <span className="text-sm font-bold tracking-tight text-gray-200">
                    {artifactMode === 'agent' ? 'Agent Live Trace' : 'Code Artifact'}
                  </span>
               </div>
               <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setArtifactMode(artifactMode === 'agent' ? 'code' : 'agent')}
                    className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white px-2 py-1 rounded-md hover:bg-[#222] transition-colors"
                  >
                    Switch View
                  </button>
                  <button onClick={() => setShowArtifact(false)} className="p-2 text-gray-500 hover:text-white hover:bg-[#222] rounded-lg transition-all duration-200">
                    <PanelRightClose size={20} />
                  </button>
               </div>
            </div>
            
            <div className="flex-1 overflow-hidden">
              {artifactMode === 'agent' ? (
                <div className="h-full overflow-auto p-6 font-mono text-[13px] bg-black selection:bg-amber-500/40 space-y-6">
                   {agentTraces.length > 0 ? (
                     agentTraces.map((trace: any, idx: number) => (
                       <div key={idx} className="space-y-3 group border-l-2 border-[#222] pl-4 hover:border-amber-500/50 transition-colors">
                         <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                            ADIM {trace.step}
                         </div>
                         <div className="text-gray-300 whitespace-pre-wrap leading-relaxed italic opacity-80">
                            {trace.content}
                         </div>
                         {trace.observation && (
                            <div className="bg-[#111] p-3 rounded-lg border border-[#222] text-green-500/90 text-[12px] break-all">
                               <span className="text-gray-600 block mb-1 text-[10px] font-black tracking-widest uppercase">OBSERVATION:</span>
                               {trace.observation}
                            </div>
                         )}
                       </div>
                     ))
                   ) : (
                     <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4 opacity-50">
                        <Sparkles size={32} className="animate-pulse" />
                        <span className="text-xs font-medium italic">Ajan hazır. Bir görev vererek başlatabilirsin.</span>
                     </div>
                   )}
                   {isAgentRunning && (
                     <div className="flex items-center gap-3 text-amber-500/80 animate-pulse pl-4">
                        <Terminal size={14} />
                        <span className="text-[11px] font-bold tracking-widest uppercase italic">Ajan Düşünüyor...</span>
                     </div>
                   )}
                </div>
              ) : (
                <div className="h-full p-6">
                  {currentCode ? (
                    <CodeArtifact 
                      language={currentCode.language} 
                      code={currentCode.content} 
                      filename={currentCode.filename} 
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4 opacity-50">
                       <Code size={32} />
                       <span className="text-xs font-medium italic">Henüz kod üretilmedi.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Status Footer */}
            <div className="h-24 bg-[#050505] border-t border-[#222] p-6 font-mono text-[10px] text-gray-500 flex flex-col justify-center gap-1.5 uppercase tracking-tighter">
              <div className="flex justify-between">
                <span>Plugin Status</span>
                <span className="text-green-500">Active</span>
              </div>
              <div className="flex justify-between">
                <span>Identity Mode</span>
                <span className="text-amber-500">Mock (Simulated)</span>
              </div>
              <div className="flex justify-between">
                <span>Active Model</span>
                <span className="text-white">{selectedModel}</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
