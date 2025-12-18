import React, { useState, useRef } from 'react';
import { Plus, Activity, Layers, MessageSquare } from 'lucide-react';
import { TransferItem, TransferState, ChatMessage } from '../types';
import { ChatBox } from '../components/ChatBox';
import { TransferCard } from '../components/TransferCard';
import { formatSpeed } from '../utils/format';

interface SessionViewProps {
    transfers: TransferItem[];
    acceptFiles: (fileIds: string[]) => void;
    cancelTransfer: (fileId: string) => void;
    handleFileSelection: (files: FileList | null) => void;
    chatMessages: ChatMessage[];
    chatInput: string;
    setChatInput: (val: string) => void;
    handleSendChat: (e?: React.FormEvent) => void;
}

export const SessionView: React.FC<SessionViewProps> = ({
    transfers,
    acceptFiles,
    cancelTransfer,
    handleFileSelection,
    chatMessages,
    chatInput,
    setChatInput,
    handleSendChat
}) => {
    const [mobileTab, setMobileTab] = useState<'files' | 'chat'>('files');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Stats
    const speed = transfers
        .filter((t) => t.state === TransferState.TRANSFERRING)
        .reduce((acc, t) => acc + (t.speed || 0), 0);

    // Sort: Active first, then pending, then completed
    const sortedTransfers = [...transfers].sort((a, b) => {
        const score = (state: TransferState) => {
            if (state === TransferState.TRANSFERRING) return 3;
            if (state === TransferState.PENDING) return 2;
            if (state === TransferState.QUEUED) return 1;
            return 0;
        };
        return score(b.state) - score(a.state);
    });

    return (
        <div className="w-full h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-6 p-4 md:p-6 animate-fade-in max-w-7xl mx-auto">

            {/* --- DESKTOP: SPLIT VIEW / MOBILE: TABBED CONTENT --- */}

            {/* FILES SECTION */}
            <div className={`flex-1 flex flex-col h-full ${mobileTab === 'chat' ? 'hidden lg:flex' : 'flex'}`}>

                {/* Drag & Drop Zone / Header */}
                <div
                    className="glass rounded-2xl p-6 mb-4 flex flex-col items-center justify-center border-dashed border-2 border-white/10 hover:border-neon-blue/50 transition-colors cursor-pointer group bg-[#0a0a0a] min-h-[140px]"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => handleFileSelection(e.target.files)}
                    />
                    <div className="w-14 h-14 bg-neon-blue/10 rounded-full flex items-center justify-center text-neon-blue mb-3 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(0,243,255,0.2)]">
                        <Plus size={28} />
                    </div>
                    <h3 className="font-bold text-lg text-gray-200 group-hover:text-neon-blue transition-colors">اضغط لإرسال ملفات</h3>
                    <p className="text-gray-500 text-xs mt-1">يدعم تعدد الملفات وأحجام كبيرة</p>
                </div>

                {/* Speed Indicator */}
                {speed > 0 && (
                    <div className="bg-gradient-to-r from-neon-blue/10 to-transparent border-l-4 border-neon-blue p-4 mb-4 rounded-r-xl flex items-center gap-4 animate-pulse shadow-[0_0_20px_rgba(0,243,255,0.1)]">
                        <Activity size={24} className="text-neon-blue" />
                        <div>
                            <p className="text-[10px] text-neon-blue font-bold uppercase tracking-widest mb-1">السرعة الحالية (Turbo)</p>
                            <p className="text-2xl font-mono text-white font-bold">{formatSpeed(speed)}</p>
                        </div>
                    </div>
                )}

                {/* Transfer List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-24 lg:pb-0 pr-1">
                    {sortedTransfers.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-gray-600 opacity-50 border border-white/5 rounded-2xl border-dashed">
                            <Layers size={40} className="mb-2" />
                            <p>لا توجد ملفات حالياً</p>
                        </div>
                    ) : (
                        sortedTransfers.map(t => (
                            <TransferCard key={t.id} item={t} onAccept={(id) => acceptFiles([id])} onCancel={cancelTransfer} />
                        ))
                    )}
                </div>
            </div>

            {/* CHAT SECTION (Side on Desktop, Tab on Mobile) */}
            <div className={`lg:w-[400px] h-full ${mobileTab === 'files' ? 'hidden lg:flex' : 'flex'} flex-col`}>
                <ChatBox
                    messages={chatMessages}
                    input={chatInput}
                    setInput={setChatInput}
                    onSend={handleSendChat}
                />
            </div>

            {/* --- MOBILE BOTTOM NAVIGATION --- */}
            <div className="lg:hidden fixed bottom-6 left-6 right-6 bg-[#111]/90 backdrop-blur-xl border border-white/20 rounded-2xl p-2 flex justify-around z-50 shadow-2xl">
                <button
                    onClick={() => setMobileTab('files')}
                    className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1 transition-all ${mobileTab === 'files' ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]' : 'text-gray-500 hover:text-white'}`}
                >
                    <Layers size={20} />
                    <span className="text-[10px] font-bold">الملفات</span>
                </button>
                <div className="w-px bg-white/10 mx-2"></div>
                <button
                    onClick={() => setMobileTab('chat')}
                    className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1 transition-all relative ${mobileTab === 'chat' ? 'bg-neon-blue text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]' : 'text-gray-500 hover:text-white'}`}
                >
                    <MessageSquare size={20} />
                    <span className="text-[10px] font-bold">الشات</span>
                    {chatMessages.length > 0 && <span className="absolute top-3 right-[25%] w-2 h-2 bg-red-500 rounded-full animate-bounce"></span>}
                </button>
            </div>
        </div>
    );
};
