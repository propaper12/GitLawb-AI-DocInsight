'use client';

import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Download, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

interface CodeArtifactProps {
  language: string;
  code: string;
  filename?: string;
}

export default function CodeArtifact({ language, code, filename }: CodeArtifactProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `artifact.${language || 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] rounded-xl overflow-hidden border border-[#222]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#151515] border-b border-[#222]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          <span className="ml-2 text-xs font-mono text-gray-400 font-medium tracking-tight uppercase">
            {filename || language || 'code'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            className="p-1.5 hover:bg-[#2a2a2a] rounded-md transition-colors text-gray-400 hover:text-white"
            title="Copy Code"
          >
            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          </button>
          <button 
            onClick={handleDownload}
            className="p-1.5 hover:bg-[#2a2a2a] rounded-md transition-colors text-gray-400 hover:text-white"
            title="Download"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <SyntaxHighlighter
          language={language.toLowerCase()}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '24px',
            fontSize: '14px',
            lineHeight: '1.6',
            backgroundColor: 'transparent',
          }}
          showLineNumbers={true}
          lineNumberStyle={{ minWidth: '3em', paddingRight: '1em', color: '#444', textAlign: 'right' }}
        >
          {code}
        </SyntaxHighlighter>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-between text-[10px] text-gray-500 font-mono tracking-widest uppercase">
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>{code.length} CHARS</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>Sync OK</span>
        </div>
      </div>
    </div>
  );
}
