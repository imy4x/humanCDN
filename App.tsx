import React, { useState, useEffect, useRef } from 'react';
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
  XCircle,
  Ban,
  Plus
} from 'lucide-react';
import { Button } from './components/Button';
import { AppMode, TransferState, FileMeta, TransferItem, ChatMessage } from './types';
import { peerService } from './services/peerService';

// --- UTILS ---
const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatSpeed = (bytesPerSecond: number | undefined) => {
    if (!bytesPerSecond) return '';
    return `${formatBytes(bytesPerSecond)}/s`;
};

// --- COMPONENTS ---

const ChatBox = ({ messages, input, setInput, onSend }: {
    messages: ChatMessage[];
    input: string;
    setInput: (val: string) => void;
    onSend: (e?: React.FormEvent) => void;
}) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-full bg-[#111] rounded-t-2xl lg:rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/40 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2 opacity-50">
                        <MessageSquare size={32} />
                        <p className="text-xs">المحادثة آمنة</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-md ${
                            msg.sender === 'me' 
                            ? 'bg-neon-blue text-black font-medium rounded-tr-none' 
                            : 'bg-[#222] text-gray-200 rounded-tl-none border border-white/5'
                        }`}>
                            <p className="break-words leading-relaxed">{msg.text}</p>
                            <p className="text-[10px] opacity-50 mt-1 text-left font-mono text-current">
                                {new Date(msg.timestamp).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <form onSubmit={onSend} className="p-3 bg-[#161616] border-t border-white/10 flex gap-2">
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="اكتب رسالة..."
                    className="flex-1 bg-black/50 border border-white/10 rounded-full px-4 py-3 text-sm focus:border-neon-blue outline-none transition-colors text-right dir-rtl placeholder:text-gray-600 text-white"
                />
                <button 
                    type="submit"
                    disabled={!input.trim()}
                    className="bg-neon-blue text-black p-3 rounded-full hover:bg-white transition-all disabled:opacity-50 disabled:scale-95 shadow-[0_0_10px_rgba(0,243,255,0.4)]"
                >
                    <Send size={18} className="transform -rotate-90 md:rotate-0" /> 
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

    // Force progress to be at least visible if transferring
    const displayProgress = isTransferring && item.progress < 2 ? 2 : item.progress;

    return (
        <div className={`relative p-4 rounded-xl border transition-all duration-300 overflow-hidden shadow-lg ${
            isCancelled 
            ? 'bg-red-500/5 border-red-500/10 opacity-60' 
            : 'bg-[#161616] border-white/5'
        }`}>
            {/* Main Progress Bar Background */}
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-white/5">
                {(isTransferring || isCompleted) && !isCancelled && (
                    <div 
                        className={`h-full transition-all duration-200 ease-linear shadow-[0_0_15px_currentColor] ${isCompleted ? 'bg-green-500 text-green-500' : (item.isIncoming ? 'bg-purple-500 text-purple-500' : 'bg-neon-blue text-neon-blue')}`}
                        style={{ width: `${displayProgress}%` }}
                    />
                )}
            </div>

            <div className="flex items-center gap-4 relative z-10">
                {/* File Type Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                    isCancelled
                    ? 'bg-red-900/10 border-red-500/20 text-red-500'
                    : isCompleted 
                        ? 'bg-green-500/10 border-green-500/20 text-green-500' 
                        : item.isIncoming 
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' 
                            : 'bg-neon-blue/10 border-neon-blue/20 text-neon-blue'
                }`}>
                    <FileIcon size={24} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-sm text-gray-200 truncate" title={item.meta.name}>
                            {item.meta.name}
                        </h4>
                        {/* Status Label */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                             isCompleted ? 'bg-green-500/10 text-green-500' : 
                             isCancelled ? 'bg-red-500/10 text-red-500' :
                             isTransferring ? 'bg-blue-500/10 text-blue-400' :
                             'bg-white/10 text-gray-400'
                        }`}>
                            {isCancelled ? 'ملغي' : 
                             isCompleted ? 'مكتمل' : 
                             isTransferring ? `${item.progress.toFixed(0)}%` : 
                             isPending ? 'انتظار' : 'طابور'}
                        </span>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs text-gray-400 font-mono mt-2">
                        <span>{formatBytes(item.meta.size)}</span>
                        {isTransferring && item.speed && !isCancelled && (
                            <span className="text-white font-bold">{formatSpeed(item.speed)}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions Toolbar */}
            <div className="flex justify-end gap-3 mt-4 border-t border-white/5 pt-3">
                {item.isIncoming && isPending && !isCancelled && (
                    <button onClick={() => onAccept(item.id)} className="flex-1 bg-neon-blue text-black py-2 rounded-lg text-xs font-bold hover:bg-white transition-colors">
                        قبول وتحميل
                    </button>
                )}
                
                {item.isIncoming && isCompleted && item.blobUrl && (
                     <a href={item.blobUrl} download={item.meta.name} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-bold text-center hover:bg-green-500 transition-colors">
                        فتح / حفظ
                    </a>
                )}

                {!isCompleted && !isCancelled && (
                    <button onClick={() => onCancel(item.id)} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-xs hover:bg-red-500 hover:text-white transition-colors">
                        إلغاء
                    </button>
                )}
            </div>
        </div>
    );
};

// --- VIEWS ---

const HomeView = ({ onHost, onGuest }: { onHost: () => void, onGuest: () => void }) => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 animate-fade-in p-6">
        <div className="text-center space-y-4">
            <h2 className="text-6xl font-black tracking-tighter">
                HUMAN<span className="text-neon-blue">CDN</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-xs mx-auto">
                نقل ملفات بسرعة البرق. <br/> بدون سيرفرات. بدون حدود.
            </p>
        </div>

        <div className="w-full max-w-md space-y-4">
            <button 
                onClick={onHost}
                className="w-full group bg-gradient-to-r from-neon-blue/20 to-neon-blue/5 border border-neon-blue/50 p-6 rounded-2xl hover:bg-neon-blue hover:border-neon-blue transition-all duration-300 flex items-center justify-between"
            >
                <div className="text-right">
                    <h3 className="text-xl font-bold text-white group-hover:text-black">إرسال</h3>
                    <p className="text-gray-400 text-xs group-hover:text-black/70">إنشاء رابط مشاركة</p>
                </div>
                <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center group-hover:bg-black/20 text-white group-hover:text-black">
                     <Upload size={24} />
                </div>
            </button>

            <button 
                onClick={onGuest}
                className="w-full group bg-[#111] border border-white/10 p-6 rounded-2xl hover:border-purple-500 hover:bg-purple-500/10 transition-all duration-300 flex items-center justify-between"
            >
                <div className="text-right">
                    <h3 className="text-xl font-bold text-white">استلام</h3>
                    <p className="text-gray-500 text-xs">الانضمام لمشاركة</p>
                </div>
                 <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-purple-500 text-gray-400 group-hover:text-white">
                     <Download size={24} />
                </div>
            </button>
        </div>
    </div>
);

const SessionView = ({ transfers, acceptFiles, cancelTransfer, handleFileSelection, chatMessages, chatInput, setChatInput, handleSendChat }: any) => {
    const [activeTab, setActiveTab] = useState<'files' | 'chat'>('files');
    const [mobileTab, setMobileTab] = useState<'files' | 'chat'>('files');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Stats
    const speed = transfers
        .filter((t: any) => t.state === TransferState.TRANSFERRING)
        .reduce((acc: number, t: any) => acc + (t.speed || 0), 0);
    
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
        <div className="w-full h-[calc(100vh-80px)] md:h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-6 p-4 md:p-6 animate-fade-in max-w-7xl mx-auto">
            
            {/* --- DESKTOP: SPLIT VIEW / MOBILE: TABBED CONTENT --- */}
            
            {/* FILES SECTION */}
            <div className={`flex-1 flex flex-col h-full ${mobileTab === 'chat' ? 'hidden lg:flex' : 'flex'}`}>
                
                {/* Drag & Drop Zone / Header */}
                <div 
                    className="glass rounded-2xl p-6 mb-4 flex flex-col items-center justify-center border-dashed border-2 border-white/10 hover:border-neon-blue/50 transition-colors cursor-pointer group bg-[#0a0a0a]"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden" 
                        multiple
                        onChange={(e) => handleFileSelection(e.target.files)}
                    />
                    <div className="w-16 h-16 bg-neon-blue/10 rounded-full flex items-center justify-center text-neon-blue mb-3 group-hover:scale-110 transition-transform">
                        <Plus size={32} />
                    </div>
                    <h3 className="font-bold text-lg">اضغط لإضافة ملفات</h3>
                    <p className="text-gray-500 text-xs mt-1">أو اسحب الملفات هنا (يدعم تعدد الملفات)</p>
                </div>

                {/* Speed Indicator */}
                {speed > 0 && (
                    <div className="bg-gradient-to-r from-neon-blue/10 to-transparent border-l-4 border-neon-blue p-3 mb-4 rounded-r-lg flex items-center gap-3 animate-pulse">
                        <Activity size={20} className="text-neon-blue" />
                        <div>
                            <p className="text-xs text-neon-blue font-bold uppercase">السرعة الحالية (Turbo)</p>
                            <p className="text-xl font-mono text-white">{formatSpeed(speed)}</p>
                        </div>
                    </div>
                )}

                {/* Transfer List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-20 lg:pb-0">
                    {sortedTransfers.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-gray-600 opacity-50">
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
            <div className="lg:hidden fixed bottom-4 left-4 right-4 bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex justify-around z-50 shadow-2xl">
                <button 
                    onClick={() => setMobileTab('files')}
                    className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1 transition-all ${mobileTab === 'files' ? 'bg-neon-blue text-black' : 'text-gray-500'}`}
                >
                    <Layers size={20} />
                    <span className="text-[10px] font-bold">الملفات</span>
                </button>
                <div className="w-px bg-white/10 mx-2"></div>
                <button 
                    onClick={() => setMobileTab('chat')}
                    className={`flex-1 py-3 rounded-xl flex flex-col items-center gap-1 transition-all ${mobileTab === 'chat' ? 'bg-neon-blue text-black' : 'text-gray-500'}`}
                >
                    <MessageSquare size={20} />
                    <span className="text-[10px] font-bold">الشات</span>
                    {chatMessages.length > 0 && <span className="absolute top-2 right-[20%] w-2 h-2 bg-red-500 rounded-full"></span>}
                </button>
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
  const speedTrackerRef = useRef<Map<string, { lastBytes: number, lastTime: number }>>(new Map());

  // Sync ref
  useEffect(() => { transfersRef.current = transfers; }, [transfers]);

  // URL Deep Linking
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

  // Speed Calc Logic
  const calculateSpeed = (fileId: string, currentBytes: number) => {
      const now = Date.now();
      const record = speedTrackerRef.current.get(fileId);
      if (!record) {
          speedTrackerRef.current.set(fileId, { lastBytes: currentBytes, lastTime: now });
          return 0;
      }
      const timeDiff = now - record.lastTime;
      if (timeDiff < 500) return undefined; // Only update speed every 500ms for stability
      
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
            setChatMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'peer', text: data.text, timestamp: data.timestamp }]);
        }
        else if (data.type === 'offer') {
            const newTransfers: TransferItem[] = data.files.map((m: FileMeta) => ({
                id: m.id, meta: m, progress: 0, state: TransferState.PENDING, isIncoming: true
            }));
            setTransfers(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                return [...prev, ...newTransfers.filter(t => !existingIds.has(t.id))];
            });
        }
        else if (data.type === 'cancel') {
             const fileId = data.fileId;
             if (receivedChunks.current.has(fileId)) {
                 receivedChunks.current.delete(fileId);
                 receivedBytes.current.delete(fileId);
             }
             setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, state: TransferState.CANCELLED, speed: 0 } : t));
        }
        else if (data.type === 'answer') {
             const acceptedIds = new Set(data.fileIds as string[]);
             // Update UI first
             setTransfers(prev => prev.map(t => acceptedIds.has(t.id) ? { ...t, state: TransferState.TRANSFERRING } : t));
             
             // Start sending
             const currentTransfers = transfersRef.current;
             const filesObjects = currentTransfers
                .filter(t => acceptedIds.has(t.id) && t.file && !t.isIncoming)
                .map(t => t.file!);
             
             if (filesObjects.length > 0) {
                 peerService.sendFiles(filesObjects, Array.from(acceptedIds), (fileId, bytesSent) => {
                    const speed = calculateSpeed(fileId, bytesSent);
                    setTransfers(prev => prev.map(t => {
                        if (t.id === fileId) {
                            return { 
                                ...t, 
                                progress: (bytesSent / t.meta.size) * 100, 
                                state: TransferState.TRANSFERRING,
                                speed: speed !== undefined ? speed : t.speed
                            };
                        }
                        return t;
                    }));
                 }).catch(e => { console.error(e); setError("خطأ نقل"); });
             }
        }
        else if (data.type === 'chunk') {
            const { fileId, data: chunkData } = data;
            const transfer = transfersRef.current.find(t => t.id === fileId);
            if (transfer?.state === TransferState.CANCELLED) return;

            if (!receivedChunks.current.has(fileId)) {
                receivedChunks.current.set(fileId, []);
                receivedBytes.current.set(fileId, 0);
            }

            receivedChunks.current.get(fileId)?.push(chunkData);
            const currentBytes = (receivedBytes.current.get(fileId) || 0) + chunkData.byteLength;
            receivedBytes.current.set(fileId, currentBytes);

            const speed = calculateSpeed(fileId, currentBytes);
            
            // Always update state on chunks if it's the first chunk or throttled
            setTransfers(prev => prev.map(t => {
                if (t.id === fileId) {
                    return { 
                        ...t, 
                        progress: (currentBytes / t.meta.size) * 100,
                        state: TransferState.TRANSFERRING,
                        speed: speed !== undefined ? speed : t.speed
                    };
                }
                return t;
            }));
        }
        else if (data.type === 'file-complete') {
            const { fileId } = data;
            const transfer = transfersRef.current.find(t => t.id === fileId);
            if (transfer?.state === TransferState.CANCELLED) return;

            setTransfers(prev => prev.map(t => {
                if (t.id === fileId) {
                    const chunks = receivedChunks.current.get(fileId) || [];
                    const blob = new Blob(chunks, { type: t.meta.type });
                    const url = URL.createObjectURL(blob);
                    
                    receivedChunks.current.delete(fileId);
                    receivedBytes.current.delete(fileId);
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
        peerService.onConnection = () => setConnectionState('CONNECTED');
        peerService.onData = handleData;
        peerService.onError = () => { setError('انقطع الاتصال'); setConnectionState('DISCONNECTED'); };
    } catch { setError("فشل تهيئة الشبكة"); }
  };

  const initGuest = async (overrideId?: string) => {
    const targetId = overrideId || remotePeerId;
    if (!targetId) return;
    let finalId = targetId.includes('?id=') ? targetId.split('?id=')[1] : targetId;
    setRemotePeerId(finalId);
    setConnectionState('CONNECTING');
    try {
        await peerService.initialize();
        peerService.connect(finalId);
        peerService.onConnection = () => { setConnectionState('CONNECTED'); setIsScanning(false); };
        peerService.onData = handleData;
        peerService.onError = () => { setError('فشل الاتصال'); setConnectionState('DISCONNECTED'); };
    } catch { setError("فشل الاتصال"); }
  };

  const startScanner = () => {
      setIsScanning(true);
      setTimeout(() => {
          const html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;
          html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decodedText) => {
                html5QrCode.stop().then(() => { scannerRef.current = null; setIsScanning(false); initGuest(decodedText); });
            }, () => {}).catch(() => { setError("فشل الكاميرا"); setIsScanning(false); });
      }, 100);
  };

  const stopScanner = () => {
      scannerRef.current?.stop().then(() => { scannerRef.current = null; setIsScanning(false); }).catch(console.error);
  };

  const acceptFiles = (fileIds: string[]) => {
      peerService.sendAnswer(fileIds);
      setTransfers(prev => prev.map(t => fileIds.includes(t.id) ? { ...t, state: TransferState.QUEUED } : t)); 
  };
  
  const cancelTransfer = (fileId: string) => {
      peerService.cancelTransfer(fileId);
      if (receivedChunks.current.has(fileId)) { receivedChunks.current.delete(fileId); receivedBytes.current.delete(fileId); }
      setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, state: TransferState.CANCELLED, speed: 0 } : t));
  };

  const handleSendChat = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!chatInput.trim() || connectionState !== 'CONNECTED') return;
      peerService.sendChat(chatInput);
      setChatMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'me', text: chatInput, timestamp: Date.now() }]);
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
    speedTrackerRef.current.clear();
    window.history.pushState("", document.title, window.location.pathname + window.location.search);
  };

  const shareLink = `${window.location.origin}${window.location.pathname}#/join?id=${peerId}`;

  return (
    <div className="min-h-screen text-gray-200 selection:bg-neon-blue selection:text-black font-sans pb-4" dir="rtl">
      {/* Dynamic Background */}
      <div className="fixed top-0 left-0 w-full h-full bg-[#050505] -z-20"></div>
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-blue/5 blur-[100px] rounded-full -z-10 animate-pulse-fast"></div>
      
      {/* Header */}
      <header className="px-4 py-4 md:px-8 flex items-center justify-between border-b border-white/5 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => mode !== AppMode.HOME && confirm('خروج؟') && resetApp()}>
            <div className="w-8 h-8 bg-neon-blue rounded flex items-center justify-center text-black">
              <Zap size={20} fill="currentColor" />
            </div>
            <h1 className="text-lg font-bold font-mono text-white tracking-tight">
              Human<span className="text-neon-blue">CDN</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
              {connectionState === 'CONNECTED' && (
                  <div className="flex items-center gap-1.5 bg-green-900/20 px-2 py-1 rounded border border-green-500/20">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></div>
                      <span className="text-[10px] text-green-500 font-bold">LIVE</span>
                  </div>
              )}
              {mode !== AppMode.HOME && <button onClick={resetApp} className="text-gray-400 hover:text-white"><X size={20} /></button>}
          </div>
      </header>
      
      <main className="container mx-auto">
        {error && (
            <div className="m-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                <AlertCircle size={20} />
                <span className="text-sm">{error}</span>
                <button onClick={() => setError(null)} className="mr-auto"><X size={16}/></button>
            </div>
        )}

        {mode === AppMode.HOME && <HomeView onHost={() => { setMode(AppMode.HOST); initHost(); }} onGuest={() => setMode(AppMode.GUEST)} />}
        
        {mode !== AppMode.HOME && connectionState !== 'CONNECTED' && (
            <div className="min-h-[60vh] flex items-center justify-center p-4">
               {/* Simplified Connection View for Better Mobile UX */}
               <div className="w-full max-w-sm glass rounded-2xl p-6 text-center space-y-6">
                   <h2 className="text-xl font-bold">{mode === AppMode.HOST ? 'رمز الغرفة' : 'انضمام'}</h2>
                   
                   {mode === AppMode.HOST ? (
                       !peerId ? <div className="animate-spin w-8 h-8 border-2 border-neon-blue border-t-transparent rounded-full mx-auto"></div> :
                       <div className="space-y-4">
                           <div className="bg-white p-2 rounded-xl inline-block"><QRCodeSVG value={shareLink} size={150} /></div>
                           <div onClick={() => navigator.clipboard.writeText(peerId)} className="bg-black/50 p-3 rounded-lg border border-white/10 font-mono text-xs truncate text-neon-blue cursor-pointer active:scale-95 transition-transform">{peerId}</div>
                       </div>
                   ) : (
                       !isScanning ? (
                        <div className="space-y-3">
                            <input value={remotePeerId} onChange={e => setRemotePeerId(e.target.value)} className="w-full bg-black/50 border border-white/10 p-3 rounded-lg text-center font-mono text-sm" placeholder="ID الغرفة" />
                            <Button onClick={() => initGuest()} disabled={!remotePeerId} className="w-full">اتصال</Button>
                            <div className="text-xs text-gray-500">- أو -</div>
                            <Button variant="secondary" onClick={startScanner} className="w-full">كاميرا QR</Button>
                        </div>
                       ) : (
                        <div>
                             <div id="reader" className="rounded-lg overflow-hidden border border-neon-blue"></div>
                             <button onClick={stopScanner} className="mt-4 text-xs text-red-400">إلغاء</button>
                        </div>
                       )
                   )}
                   <button onClick={resetApp} className="text-xs text-gray-500 mt-4">إلغاء</button>
               </div>
            </div>
        )}
        
        {connectionState === 'CONNECTED' && <SessionView 
            transfers={transfers}
            acceptFiles={acceptFiles}
            cancelTransfer={cancelTransfer}
            handleFileSelection={handleFileSelection}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            handleSendChat={handleSendChat}
        />}
      </main>
    </div>
  );
};

export default App;