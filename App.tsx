import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { 
  Upload, 
  Download, 
  Zap, 
  AlertCircle,
  Copy,
  Wifi,
  X,
  File as FileIcon,
  Check,
  MessageSquare,
  Send,
  Scan,
  Monitor,
  Smartphone,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  HardDrive,
  Layers,
  Clock,
  XCircle,
  Ban
} from 'lucide-react';
import { Button } from './components/Button';
import { AppMode, TransferState, FileMeta, TransferItem, ChatMessage } from './types';
import { peerService } from './services/peerService';

// Utility to format bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Utility to format speed
const formatSpeed = (bytesPerSecond: number | undefined) => {
    if (!bytesPerSecond) return '';
    return `${formatBytes(bytesPerSecond)}/s`;
};

// --- ISOLATED COMPONENTS ---

const ChatBox = ({ messages, input, setInput, onSend, isConnected }: {
    messages: ChatMessage[];
    input: string;
    setInput: (val: string) => void;
    onSend: (e?: React.FormEvent) => void;
    isConnected: boolean;
}) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="glass rounded-xl flex flex-col h-full border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-3 bg-white/5 border-b border-white/10 flex items-center gap-2 backdrop-blur-md">
                <MessageSquare size={16} className="text-neon-blue"/>
                <span className="font-bold text-sm text-gray-200">شات مشفر (Live)</span>
                {isConnected && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-auto"></span>}
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-black/40 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2 opacity-50">
                        <MessageSquare size={32} />
                        <p className="text-xs">المحادثة آمنة تماماً</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-md ${
                            msg.sender === 'me' 
                            ? 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20 rounded-tr-none' 
                            : 'bg-[#222] text-gray-200 border border-white/5 rounded-tl-none'
                        }`}>
                            <p className="break-words leading-relaxed">{msg.text}</p>
                            <p className="text-[9px] opacity-40 mt-1 text-left font-mono">
                                {new Date(msg.timestamp).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <form onSubmit={onSend} className="p-2 bg-white/5 border-t border-white/10 flex gap-2">
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="اكتب رسالة..."
                    className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs md:text-sm focus:border-neon-blue outline-none transition-colors text-right dir-rtl placeholder:text-gray-600 text-white"
                    disabled={!isConnected}
                />
                <button 
                    type="submit"
                    disabled={!input.trim() || !isConnected}
                    className="bg-neon-blue/10 hover:bg-neon-blue text-neon-blue hover:text-black p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send size={18} className={!isConnected ? "" : "transform -rotate-90 md:rotate-0"} /> 
                </button>
            </form>
        </div>
    );
};

const TransferCard = ({ item, onAccept, onCancel }: { item: TransferItem, onAccept: (id: string) => void, onCancel: (id: string) => void }) => {
    const isCompleted = item.state === TransferState.COMPLETED;
    const isTransferring = item.state === TransferState.TRANSFERRING;
    const isPending = item.state === TransferState.PENDING;
    const isCancelled = item.state === TransferState.CANCELLED;
    const isQueued = item.state === TransferState.QUEUED;

    return (
        <div className={`relative group p-4 rounded-xl border transition-all duration-300 overflow-hidden ${
            isCancelled 
            ? 'bg-red-500/5 border-red-500/20 opacity-75' 
            : item.isIncoming 
                ? 'bg-gradient-to-br from-[#1a0b2e] to-[#0a0a0a] border-purple-500/20 hover:border-purple-500/50' 
                : 'bg-gradient-to-br from-[#0b1a2e] to-[#0a0a0a] border-neon-blue/20 hover:border-neon-blue/50'
        }`}>
            {/* Background Progress Bar */}
            {(isTransferring || isCompleted) && !isCancelled && (
                <div 
                    className={`absolute bottom-0 left-0 h-1 transition-all duration-300 ${isCompleted ? 'bg-green-500' : (item.isIncoming ? 'bg-purple-500' : 'bg-neon-blue')}`}
                    style={{ width: `${item.progress}%` }}
                />
            )}

            <div className="flex items-start gap-3 relative z-10">
                {/* Icon Box */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border shadow-[0_0_10px_inset_rgba(0,0,0,0.5)] ${
                    isCancelled
                    ? 'bg-red-500/10 border-red-500/30 text-red-500'
                    : isCompleted 
                        ? 'bg-green-500/10 border-green-500/30 text-green-500' 
                        : item.isIncoming 
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' 
                            : 'bg-neon-blue/10 border-neon-blue/30 text-neon-blue'
                }`}>
                    {isCancelled ? <Ban size={20} /> : (isCompleted ? <Check size={20} /> : (item.isIncoming ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />))}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-sm text-gray-200 truncate pr-2 w-full" title={item.meta.name}>
                            {item.meta.name}
                        </h4>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs text-gray-500 font-mono mt-1">
                        <span className="flex items-center gap-1">
                            <HardDrive size={10} /> {formatBytes(item.meta.size)}
                        </span>
                        {isTransferring && item.speed && !isCancelled && (
                            <span className={`flex items-center gap-1 animate-pulse ${item.isIncoming ? 'text-purple-400' : 'text-neon-blue'}`}>
                                <Activity size={10} /> {formatSpeed(item.speed)}
                            </span>
                        )}
                    </div>
                    
                    <div className="mt-2 flex justify-between items-end">
                        <span className={`text-[10px] uppercase tracking-wider font-bold opacity-70 ${isCancelled ? 'text-red-500' : ''}`}>
                            {isCancelled && 'ملغي'}
                            {!isCancelled && isPending && (item.isIncoming ? 'طلب وارد' : 'بانتظار الموافقة')}
                            {!isCancelled && isQueued && 'جاري البدء...'}
                            {!isCancelled && isTransferring && `${item.progress.toFixed(0)}%`}
                            {!isCancelled && isCompleted && 'تم النقل'}
                        </span>

                        {/* Actions */}
                        <div className="flex gap-2">
                            {/* Cancel Button */}
                            {!isCompleted && !isCancelled && (
                                <button 
                                    onClick={() => onCancel(item.id)}
                                    className="bg-red-500/10 text-red-500 text-xs font-bold px-3 py-1.5 rounded hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1 border border-red-500/20"
                                    title="إلغاء النقل"
                                >
                                    <XCircle size={12} /> <span className="hidden sm:inline">إلغاء</span>
                                </button>
                            )}

                            {/* Accept Button */}
                             {item.isIncoming && isPending && !isCancelled && (
                                <button 
                                    onClick={() => onAccept(item.id)}
                                    className="bg-neon-blue text-black text-xs font-bold px-3 py-1.5 rounded hover:bg-white transition-colors flex items-center gap-1 shadow-[0_0_10px_rgba(0,243,255,0.4)]"
                                >
                                    <Download size={12} /> قبول
                                </button>
                            )}

                            {/* Download Button */}
                            {item.isIncoming && isCompleted && item.blobUrl && (
                                <a 
                                    href={item.blobUrl} 
                                    download={item.meta.name}
                                    className="bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-bold px-3 py-1.5 rounded hover:bg-green-500 hover:text-black transition-colors flex items-center gap-1"
                                >
                                    <Download size={12} /> حفظ
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FileList = ({ items, onAccept, onCancel, filter }: { items: TransferItem[], onAccept: (id: string) => void, onCancel: (id: string) => void, filter: 'all' | 'incoming' | 'outgoing' }) => {
    const filteredItems = items.filter(item => {
        if (filter === 'all') return true;
        if (filter === 'incoming') return item.isIncoming;
        if (filter === 'outgoing') return !item.isIncoming;
        return true;
    });

    if (filteredItems.length === 0) {
        return (
            <div className="h-40 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/5 text-gray-500">
                <Layers size={32} className="mb-2 opacity-50"/>
                <p className="text-xs">لا توجد ملفات {filter === 'incoming' ? 'واردة' : (filter === 'outgoing' ? 'صادرة' : '')}</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
            {filteredItems.slice().reverse().map(item => (
                <TransferCard key={item.id} item={item} onAccept={onAccept} onCancel={onCancel} />
            ))}
        </div>
    );
};

// --- VIEWS ---

const HomeView = ({ onHost, onGuest }: { onHost: () => void, onGuest: () => void }) => (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-12 animate-fade-in p-6 relative z-10">
        <div className="text-center space-y-6 max-w-2xl">
            <h2 className="text-5xl md:text-7xl font-bold tracking-tighter">
                HUMAN <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-purple-500 neon-text">CDN</span>
            </h2>
            <p className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-lg mx-auto">
                نقل ملفات فوري، مشفر، وبدون خوادم.
                <br />
                <span className="text-sm opacity-60">السرعة محدودة فقط بشبكتك.</span>
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-xl">
            <button 
                onClick={onHost}
                className="group relative overflow-hidden bg-[#111] border border-white/10 p-8 rounded-2xl hover:border-neon-blue/50 transition-all duration-300 text-right"
            >
                <div className="absolute top-0 left-0 w-1 h-full bg-neon-blue group-hover:h-full transition-all duration-300 h-0"></div>
                <Monitor size={40} className="text-neon-blue mb-4 group-hover:scale-110 transition-transform origin-right" />
                <h3 className="text-2xl font-bold text-white mb-2">إرسال ملفات</h3>
                <p className="text-gray-500 text-sm">إنشاء غرفة ومشاركة الرابط</p>
            </button>

            <button 
                onClick={onGuest}
                className="group relative overflow-hidden bg-[#111] border border-white/10 p-8 rounded-2xl hover:border-purple-500/50 transition-all duration-300 text-right"
            >
                 <div className="absolute top-0 left-0 w-1 h-full bg-purple-500 group-hover:h-full transition-all duration-300 h-0"></div>
                <Smartphone size={40} className="text-purple-500 mb-4 group-hover:scale-110 transition-transform origin-right" />
                <h3 className="text-2xl font-bold text-white mb-2">استلام ملفات</h3>
                <p className="text-gray-500 text-sm">مسح كود QR أو إدخال المعرف</p>
            </button>
        </div>
    </div>
);

const ConnectionView = ({ 
    mode, peerId, shareLink, remotePeerId, setRemotePeerId, initGuest, resetApp, isScanning, startScanner, stopScanner, connectionState 
}: any) => {
    // ... Existing logic, just polished UI ...
    return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
            <div className="w-full max-w-md glass rounded-2xl p-8 space-y-8 animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue to-purple-500"></div>
                
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">
                        {mode === AppMode.HOST ? 'غرفة الانتظار' : 'الاتصال بالطرف الآخر'}
                    </h2>
                    <p className="text-sm text-gray-500">
                        {mode === AppMode.HOST ? 'شارك الكود لبدء النقل الفوري' : 'أدخل المعرف للاتصال'}
                    </p>
                </div>

                {mode === AppMode.HOST ? (
                    <div className="space-y-6">
                         {peerId ? (
                            <div className="flex flex-col items-center gap-6">
                                <div className="p-4 bg-white rounded-xl shadow-[0_0_30px_rgba(0,243,255,0.2)]">
                                    <QRCodeSVG value={shareLink} size={180} />
                                </div>
                                <div className="w-full relative">
                                    <div className="absolute inset-y-0 left-2 flex items-center">
                                         <button onClick={() => navigator.clipboard.writeText(peerId)} className="p-2 hover:bg-white/10 rounded text-neon-blue">
                                            <Copy size={18}/>
                                         </button>
                                    </div>
                                    <input 
                                        readOnly 
                                        value={peerId} 
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-3 pl-12 pr-4 text-center font-mono text-sm text-gray-300 focus:outline-none focus:border-neon-blue transition-colors"
                                    />
                                </div>
                            </div>
                         ) : (
                             <div className="flex justify-center py-10">
                                 <div className="w-10 h-10 border-4 border-white/10 border-t-neon-blue rounded-full animate-spin"></div>
                             </div>
                         )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {!isScanning ? (
                            <>
                                <div className="space-y-4">
                                    <input 
                                        type="text" 
                                        value={remotePeerId}
                                        onChange={(e) => setRemotePeerId(e.target.value)}
                                        placeholder="لصق معرف الغرفة (UUID)..."
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-4 text-center font-mono text-sm focus:border-purple-500 focus:outline-none transition-all placeholder:text-gray-700"
                                    />
                                    <Button onClick={() => initGuest()} disabled={!remotePeerId} className="w-full h-12">
                                        {connectionState === 'CONNECTING' ? 'جاري المصافحة...' : 'دخول الغرفة'}
                                    </Button>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                                    <div className="relative flex justify-center"><span className="bg-[#111] px-2 text-xs text-gray-600">أو عبر الكاميرا</span></div>
                                </div>
                                <Button variant="secondary" className="w-full" onClick={startScanner}>
                                    <Scan size={18} /> مسح QR Code
                                </Button>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-xl overflow-hidden border border-neon-blue/50 relative">
                                    <div id="reader" className="w-full"></div>
                                    <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]"></div>
                                </div>
                                <Button variant="secondary" onClick={stopScanner} className="w-full">إيقاف الكاميرا</Button>
                            </div>
                        )}
                    </div>
                )}

                <button onClick={resetApp} className="w-full text-xs text-gray-600 hover:text-white transition-colors mt-4">
                    إلغاء والعودة للرئيسية
                </button>
            </div>
        </div>
    );
};

const SessionView = ({ transfers, acceptFiles, cancelTransfer, handleFileSelection, chatMessages, chatInput, setChatInput, handleSendChat, connectionState }: any) => {
    const [activeTab, setActiveTab] = useState<'all' | 'incoming' | 'outgoing'>('all');
    
    // Stats
    const incomingFiles = transfers.filter((t: any) => t.isIncoming);
    const outgoingFiles = transfers.filter((t: any) => !t.isIncoming);
    const totalSentBytes = outgoingFiles.reduce((acc: number, t: any) => acc + t.meta.size, 0);
    const totalReceivedBytes = incomingFiles.reduce((acc: number, t: any) => acc + t.meta.size, 0);
    
    // Calculate total speed (sum of all active transfers)
    const currentSpeed = transfers
        .filter((t: any) => t.state === TransferState.TRANSFERRING && t.speed)
        .reduce((acc: number, t: any) => acc + (t.speed || 0), 0);

    return (
        <div className="max-w-7xl mx-auto w-full h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-6 p-4 animate-fade-in">
            {/* Left Panel: File Manager */}
            <div className="flex-1 glass rounded-2xl flex flex-col overflow-hidden shadow-2xl order-2 lg:order-1">
                {/* Header & Stats */}
                <div className="p-4 md:p-6 border-b border-white/10 bg-black/20 shrink-0">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <Layers className="text-neon-blue" size={24} />
                                <span className="hidden md:inline">لوحة التحكم</span>
                            </h2>
                            {currentSpeed > 0 && (
                                <p className="text-neon-blue font-mono text-sm mt-1 animate-pulse flex items-center gap-2">
                                    <Activity size={14} /> السرعة الكلية: {formatSpeed(currentSpeed)}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="file" 
                                id="session-upload" 
                                className="hidden" 
                                multiple
                                onChange={(e) => handleFileSelection(e.target.files)}
                            />
                            <Button onClick={() => document.getElementById('session-upload')?.click()} className="!py-2 !px-4 text-xs md:text-sm">
                                <Upload size={16} /> <span className="hidden md:inline">إرسال ملفات</span>
                            </Button>
                        </div>
                    </div>

                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                         <div className="bg-[#111] border border-white/5 rounded-lg px-4 py-2 flex items-center gap-3 min-w-[140px]">
                             <div className="p-2 bg-neon-blue/10 rounded-full text-neon-blue"><ArrowUpCircle size={18} /></div>
                             <div className="flex flex-col">
                                 <span className="text-[10px] text-gray-500 uppercase">المرسلة</span>
                                 <span className="font-mono font-bold text-sm text-gray-200 dir-ltr text-right">{formatBytes(totalSentBytes)}</span>
                             </div>
                         </div>
                         <div className="bg-[#111] border border-white/5 rounded-lg px-4 py-2 flex items-center gap-3 min-w-[140px]">
                             <div className="p-2 bg-purple-500/10 rounded-full text-purple-400"><ArrowDownCircle size={18} /></div>
                             <div className="flex flex-col">
                                 <span className="text-[10px] text-gray-500 uppercase">المستلمة</span>
                                 <span className="font-mono font-bold text-sm text-gray-200 dir-ltr text-right">{formatBytes(totalReceivedBytes)}</span>
                             </div>
                         </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10 bg-white/5 px-4 shrink-0 overflow-x-auto">
                    {[
                        { id: 'all', label: 'الكل', count: transfers.length },
                        { id: 'outgoing', label: 'صادر', count: outgoingFiles.length },
                        { id: 'incoming', label: 'وارد', count: incomingFiles.length },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                                activeTab === tab.id 
                                ? 'border-neon-blue text-white' 
                                : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {tab.label} <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{tab.count}</span>
                        </button>
                    ))}
                </div>

                {/* Files List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/20">
                    <FileList 
                        items={transfers} 
                        onAccept={(id) => acceptFiles([id])} 
                        onCancel={cancelTransfer}
                        filter={activeTab} 
                    />
                </div>
            </div>

            {/* Right Panel: Chat (Stacked on mobile, Side on desktop) */}
            <div className="w-full lg:w-[350px] shrink-0 h-[400px] lg:h-auto order-1 lg:order-2">
                <ChatBox 
                    messages={chatMessages} 
                    input={chatInput} 
                    setInput={setChatInput} 
                    onSend={handleSendChat} 
                    isConnected={connectionState === 'CONNECTED'}
                />
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [connectionState, setConnectionState] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const transfersRef = useRef<TransferItem[]>([]); 
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const receivedChunks = useRef<Map<string, ArrayBuffer[]>>(new Map());
  const receivedBytes = useRef<Map<string, number>>(new Map());
  
  const lastUiUpdate = useRef<Map<string, number>>(new Map());
  const speedTrackerRef = useRef<Map<string, { lastBytes: number, lastTime: number }>>(new Map());

  useEffect(() => {
    transfersRef.current = transfers;
  }, [transfers]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/join')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const id = params.get('id');
      if (id) {
        setRemotePeerId(id);
        setMode(AppMode.GUEST);
      }
    }
  }, []);

  const calculateSpeed = (fileId: string, currentBytes: number) => {
      const now = Date.now();
      const record = speedTrackerRef.current.get(fileId);
      
      if (!record) {
          speedTrackerRef.current.set(fileId, { lastBytes: currentBytes, lastTime: now });
          return 0;
      }

      const timeDiff = now - record.lastTime;
      if (timeDiff === 0) return 0; 

      const bytesDiff = currentBytes - record.lastBytes;
      const speed = (bytesDiff / timeDiff) * 1000; 

      speedTrackerRef.current.set(fileId, { lastBytes: currentBytes, lastTime: now });
      return speed;
  };

  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: TransferItem[] = Array.from(fileList).map(f => {
        const id = crypto.randomUUID();
        (f as any).id = id; 
        return {
            id,
            file: f,
            meta: { id, name: f.name, size: f.size, type: f.type },
            progress: 0,
            state: TransferState.IDLE, 
            isIncoming: false
        };
    });
    
    setTransfers(prev => [...prev, ...newFiles]);

    const metas = newFiles.map(f => f.meta);
    if (connectionState === 'CONNECTED') {
        peerService.sendOffer(metas);
        setTransfers(prev => prev.map(t => newFiles.find(nf => nf.id === t.id) ? { ...t, state: TransferState.PENDING } : t));
    }
  };

  const handleData = (data: any) => {
        if (data.type === 'chat') {
            setChatMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                sender: 'peer',
                text: data.text,
                timestamp: data.timestamp
            }]);
        }
        else if (data.type === 'offer') {
            const newTransfers: TransferItem[] = data.files.map((m: FileMeta) => ({
                id: m.id,
                meta: m,
                progress: 0,
                state: TransferState.PENDING, 
                isIncoming: true
            }));
            setTransfers(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                return [...prev, ...newTransfers.filter(t => !existingIds.has(t.id))];
            });
        }
        else if (data.type === 'cancel') {
             const fileId = data.fileId;
             // Stop tracking reception
             if (receivedChunks.current.has(fileId)) {
                 receivedChunks.current.delete(fileId);
                 receivedBytes.current.delete(fileId);
             }
             
             setTransfers(prev => prev.map(t => {
                 if (t.id === fileId) {
                     return { ...t, state: TransferState.CANCELLED, speed: 0 };
                 }
                 return t;
             }));
        }
        else if (data.type === 'answer') {
             const acceptedIds = new Set(data.fileIds as string[]);
             setTransfers(prev => prev.map(t => {
                 if (acceptedIds.has(t.id)) {
                     return { ...t, state: TransferState.TRANSFERRING };
                 }
                 return t;
             }));
             
             const currentTransfers = transfersRef.current;
             const filesObjects = currentTransfers
                .filter(t => acceptedIds.has(t.id) && t.file && !t.isIncoming)
                .map(t => t.file!);
             
             if (filesObjects.length > 0) {
                 // Concurrent send call
                 peerService.sendFiles(filesObjects, Array.from(acceptedIds), (fileId, bytesSent) => {
                    const speed = calculateSpeed(fileId, bytesSent);

                    setTransfers(prev => prev.map(t => {
                        if (t.id === fileId) {
                            return { 
                                ...t, 
                                progress: (bytesSent / t.meta.size) * 100, 
                                state: TransferState.TRANSFERRING,
                                speed: speed
                            };
                        }
                        return t;
                    }));
                 }).catch(e => {
                     console.error(e);
                     setError("خطأ أثناء النقل");
                 });
             }
        }
        else if (data.type === 'chunk') {
            const { fileId, data: chunkData } = data;
            
            // Check if cancelled locally
            const transfer = transfersRef.current.find(t => t.id === fileId);
            if (transfer?.state === TransferState.CANCELLED) return;

            if (!receivedChunks.current.has(fileId)) {
                receivedChunks.current.set(fileId, []);
                receivedBytes.current.set(fileId, 0);
                setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, state: TransferState.TRANSFERRING } : t));
            }

            receivedChunks.current.get(fileId)?.push(chunkData);
            const currentBytes = (receivedBytes.current.get(fileId) || 0) + chunkData.byteLength;
            receivedBytes.current.set(fileId, currentBytes);

            const now = Date.now();
            const lastUpdate = lastUiUpdate.current.get(fileId) || 0;
            
            if (now - lastUpdate > 100) { 
                const speed = calculateSpeed(fileId, currentBytes);
                setTransfers(prev => prev.map(t => {
                    if (t.id === fileId) {
                        return { 
                            ...t, 
                            progress: (currentBytes / t.meta.size) * 100,
                            speed: speed
                        };
                    }
                    return t;
                }));
                lastUiUpdate.current.set(fileId, now);
            }
        }
        else if (data.type === 'file-complete') {
            const { fileId } = data;
            
            // Check if cancelled
            const transfer = transfersRef.current.find(t => t.id === fileId);
            if (transfer?.state === TransferState.CANCELLED) return;

            setTransfers(prev => prev.map(t => {
                if (t.id === fileId) {
                    const chunks = receivedChunks.current.get(fileId) || [];
                    const blob = new Blob(chunks, { type: t.meta.type });
                    const url = URL.createObjectURL(blob);
                    
                    receivedChunks.current.delete(fileId);
                    receivedBytes.current.delete(fileId);
                    lastUiUpdate.current.delete(fileId);
                    speedTrackerRef.current.delete(fileId);

                    return { ...t, state: TransferState.COMPLETED, blobUrl: url, progress: 100, speed: 0 };
                }
                return t;
            }));
        }
  };

  const initHost = async () => {
    setConnectionState('CONNECTING');
    try {
        const id = await peerService.initialize();
        setPeerId(id);
        
        peerService.onConnection = (conn) => {
            setConnectionState('CONNECTED');
        };
        peerService.onData = handleData;
        
        peerService.onError = (err) => {
            setError('انقطع الاتصال');
            setConnectionState('DISCONNECTED');
        };
    } catch (e) {
        setError("فشل تهيئة الشبكة");
    }
  };

  const initGuest = async (overrideId?: string) => {
    const targetId = overrideId || remotePeerId;
    if (!targetId) return;
    
    let finalId = targetId;
    if (targetId.includes('?id=')) {
        const match = targetId.match(/[?&]id=([^&]+)/);
        if (match) finalId = match[1];
    }

    setRemotePeerId(finalId);
    setConnectionState('CONNECTING');
    try {
        await peerService.initialize();
        peerService.connect(finalId);
        
        peerService.onConnection = () => {
            setConnectionState('CONNECTED');
            setIsScanning(false);
        };
        peerService.onData = handleData;

        peerService.onError = (err) => {
            setError('فشل الاتصال بالمضيف');
            setConnectionState('DISCONNECTED');
        };
    } catch (e) {
        setError("فشل الاتصال");
    }
  };

  const startScanner = () => {
      setIsScanning(true);
      setTimeout(() => {
          const html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;
          html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
                html5QrCode.stop().then(() => {
                     scannerRef.current = null;
                     setIsScanning(false);
                     initGuest(decodedText);
                }).catch(err => console.error(err));
            },
            () => {}
          ).catch(err => {
              setError("فشل تشغيل الكاميرا");
              setIsScanning(false);
          });
      }, 100);
  };

  const stopScanner = () => {
      if (scannerRef.current) {
          scannerRef.current.stop().then(() => {
              scannerRef.current = null;
              setIsScanning(false);
          }).catch(console.error);
      } else {
          setIsScanning(false);
      }
  };

  const acceptFiles = (fileIds: string[]) => {
      peerService.sendAnswer(fileIds);
      setTransfers(prev => prev.map(t => fileIds.includes(t.id) ? { ...t, state: TransferState.QUEUED } : t)); 
  };
  
  const cancelTransfer = (fileId: string) => {
      peerService.cancelTransfer(fileId);
      
      // Clear reception data if I am receiving
      if (receivedChunks.current.has(fileId)) {
          receivedChunks.current.delete(fileId);
          receivedBytes.current.delete(fileId);
      }

      setTransfers(prev => prev.map(t => {
          if (t.id === fileId) {
              return { ...t, state: TransferState.CANCELLED, speed: 0 };
          }
          return t;
      }));
  };

  const handleSendChat = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!chatInput.trim() || connectionState !== 'CONNECTED') return;
      
      peerService.sendChat(chatInput);
      setChatMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          sender: 'me',
          text: chatInput,
          timestamp: Date.now()
      }]);
      setChatInput('');
  };

  const resetApp = () => {
    peerService.destroy();
    setMode(AppMode.HOME);
    setConnectionState('DISCONNECTED');
    setPeerId('');
    setRemotePeerId('');
    setError(null);
    setTransfers([]);
    setChatMessages([]);
    setIsScanning(false);
    receivedChunks.current.clear();
    receivedBytes.current.clear();
    lastUiUpdate.current.clear();
    speedTrackerRef.current.clear();
    window.history.pushState("", document.title, window.location.pathname + window.location.search);
  };

  const shareLink = `${window.location.origin}${window.location.pathname}#/join?id=${peerId}`;

  return (
    <div className="min-h-screen text-gray-200 selection:bg-neon-blue selection:text-black font-sans pb-4" dir="rtl">
      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-full bg-[#050505] -z-20"></div>
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-neon-blue/5 blur-[120px] rounded-full -z-10 animate-pulse-fast"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full -z-10"></div>

      <header className="px-4 py-4 md:px-8 flex items-center justify-between border-b border-white/5 glass sticky top-0 z-50 backdrop-blur-xl">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => mode !== AppMode.HOME && confirm('هل تريد الخروج؟') && resetApp()}>
            <div className="w-10 h-10 bg-neon-blue rounded-xl flex items-center justify-center text-black shadow-[0_0_15px_rgba(0,243,255,0.3)] group-hover:shadow-[0_0_25px_rgba(0,243,255,0.6)] transition-all">
              <Zap size={24} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold font-mono tracking-tighter text-white">
                Human<span className="text-neon-blue">CDN</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
              {connectionState === 'CONNECTED' && (
                  <div className="hidden md:flex items-center gap-2 bg-[#0a2f15] px-3 py-1.5 rounded-full border border-green-500/30 shadow-[0_0_10px_inset_rgba(34,197,94,0.2)]">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                      <span className="text-xs text-green-400 font-bold tracking-wide">P2P ENCRYPTED</span>
                  </div>
              )}

              {mode !== AppMode.HOME && (
                <button onClick={resetApp} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-2 rounded-lg transition-colors border border-red-500/20">
                  <X size={18} />
                </button>
              )}
          </div>
      </header>
      
      <main className="container mx-auto mt-4 md:mt-8 px-2 md:px-4">
        {error && (
            <div className="max-w-md mx-auto mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-200 animate-slide-in backdrop-blur-md shadow-lg">
                <AlertCircle size={24} className="text-red-500" />
                <span className="font-medium text-sm">{error}</span>
                <button onClick={() => setError(null)} className="mr-auto hover:text-white bg-red-500/10 p-1 rounded-full"><X size={14}/></button>
            </div>
        )}

        {mode === AppMode.HOME && <HomeView onHost={() => { setMode(AppMode.HOST); initHost(); }} onGuest={() => setMode(AppMode.GUEST)} />}
        
        {mode !== AppMode.HOME && connectionState !== 'CONNECTED' && <ConnectionView 
            mode={mode}
            peerId={peerId}
            shareLink={shareLink}
            remotePeerId={remotePeerId}
            setRemotePeerId={setRemotePeerId}
            initGuest={initGuest}
            resetApp={resetApp}
            isScanning={isScanning}
            startScanner={startScanner}
            stopScanner={stopScanner}
            connectionState={connectionState}
        />}
        
        {connectionState === 'CONNECTED' && <SessionView 
            transfers={transfers}
            acceptFiles={acceptFiles}
            cancelTransfer={cancelTransfer}
            handleFileSelection={handleFileSelection}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            handleSendChat={handleSendChat}
            connectionState={connectionState}
        />}
      </main>
    </div>
  );
};

export default App;