import React, { useEffect, useRef } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatBoxProps {
    messages: ChatMessage[];
    input: string;
    setInput: (val: string) => void;
    onSend: (e?: React.FormEvent) => void;
}

export const ChatBox: React.FC<ChatBoxProps> = ({ messages, input, setInput, onSend }) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-full bg-[#111] rounded-t-2xl lg:rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/40 custom-scrollbar relative">
                <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none"></div>

                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2 opacity-50">
                        <MessageSquare size={32} />
                        <p className="text-xs">المحادثة آمنة ومشفرة P2P</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-md backdrop-blur-sm ${msg.sender === 'me'
                            ? 'bg-neon-blue/80 text-black font-medium rounded-tr-none shadow-[0_0_15px_rgba(0,243,255,0.2)]'
                            : 'bg-[#222]/90 text-gray-200 rounded-tl-none border border-white/5'
                            }`}>
                            <p className="break-words leading-relaxed">{msg.text}</p>
                            <p className="text-[10px] opacity-50 mt-1 text-left font-mono text-current">
                                {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <form onSubmit={onSend} className="p-3 bg-[#161616] border-t border-white/10 flex gap-2 z-10 relative">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="اكتب رسالة..."
                    className="flex-1 bg-black/50 border border-white/10 rounded-full px-4 py-3 text-sm focus:border-neon-blue outline-none transition-colors text-right dir-rtl placeholder:text-gray-600 text-white focus:shadow-[0_0_10px_rgba(0,243,255,0.1)]"
                />
                <button
                    type="submit"
                    disabled={!input.trim()}
                    className="bg-neon-blue text-black p-3 rounded-full hover:bg-white transition-all disabled:opacity-50 disabled:scale-95 shadow-[0_0_10px_rgba(0,243,255,0.4)] hover:shadow-[0_0_20px_rgba(0,243,255,0.6)]"
                >
                    <Send size={18} className="transform -rotate-90 md:rotate-0" />
                </button>
            </form>
        </div>
    );
};
