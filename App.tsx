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
  Smartphone
} from 'lucide-react';
import { Button } from './components/Button';
import { AppMode, TransferState, FileMeta, TransferItem, ChatMessage } from './types';
import { peerService } from './services/peerService';

// Utility to format bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 بايت';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['بايت', 'ك.ب', 'م.ب', 'ج.ب', 'ت.ب'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// --- ISOLATED COMPONENTS (Fixes Focus Issue) ---

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
        <div className="glass rounded-xl flex flex-col h-[400px] md:h-[500px] border border-white/10 overflow-hidden mt-6 lg:mt-0">
            <div className="p-4 bg-white/5 border-b border-white/10 flex items-center gap-2">
                <MessageSquare size={18} className="text-neon-blue"/>
                <span className="font-bold text-sm">شات مشفر (P2P)</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 mt-10 text-sm">
                        <p>الغرفة آمنة. ابدأ الحديث.</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                            msg.sender === 'me' 
                            ? 'bg-neon-blue/10 text-neon-blue border border-neon-blue/20 rounded-tr-none' 
                            : 'bg-white/10 text-white border border-white/10 rounded-tl-none'
                        }`}>
                            <p className="text-sm break-words">{msg.text}</p>
                            <p className="text-[9px] opacity-40 mt-1 text-left font-mono">
                                {new Date(msg.timestamp).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>

            <form onSubmit={onSend} className="p-3 bg-white/5 border-t border-white/10 flex gap-2">
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="اكتب رسالة..."
                    className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-neon-blue outline-none transition-colors text-right dir-rtl"
                    disabled={!isConnected}
                />
                <button 
                    type="submit"
                    disabled={!input.trim() || !isConnected}
                    className="bg-neon-blue/20 text-neon-blue p-2 rounded-lg hover:bg-neon-blue hover:text-black transition-colors disabled:opacity-50"
                >
                    <Send size={18} className={!isConnected ? "" : "transform -rotate-90 md:rotate-0"} /> 
                </button>
            </form>
        </div>
    );
};

const FileList = ({ items, onAccept }: { items: TransferItem[], onAccept: (ids: string[]) => void }) => (
    <div className="space-y-3 max-h-[500px] overflow-y-auto pl-2 custom-scrollbar">
        {items.map(item => (
            <div key={item.id} className={`p-4 rounded-lg flex flex-col gap-3 border transition-all ${
                item.isIncoming 
                ? 'bg-purple-500/5 border-purple-500/20' 
                : 'bg-neon-blue/5 border-neon-blue/20'
            }`}>
                <div className="flex items-center gap-4">
                    {/* Icon Status */}
                    {item.state === TransferState.COMPLETED ? (
                        <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 shrink-0">
                           <Check size={20} />
                        </div>
                    ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.isIncoming ? 'bg-purple-500/20 text-purple-400' : 'bg-neon-blue/20 text-neon-blue'}`}>
                            {item.isIncoming ? <Download size={20} /> : <Upload size={20} />}
                        </div>
                    )}
                    
                    <div className="flex-1 min-w-0 text-right">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[10px] px-1.5 rounded border ${
                                item.isIncoming 
                                ? 'border-purple-500/30 text-purple-400' 
                                : 'border-neon-blue/30 text-neon-blue'
                            }`}>
                                {item.isIncoming ? 'وارد' : 'صادر'}
                            </span>
                            <span className="text-xs text-gray-500">{formatBytes(item.meta.size)}</span>
                        </div>
                        <p className="font-bold truncate text-sm" title={item.meta.name}>{item.meta.name}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {item.state === TransferState.PENDING && (item.isIncoming ? 'بانتظار قبولك' : 'بانتظار قبول الطرف الآخر')}
                          {item.state === TransferState.QUEUED && 'في الطابور...'}
                          {item.state === TransferState.TRANSFERRING && `جاري النقل ${item.progress.toFixed(0)}%`}
                          {item.state === TransferState.COMPLETED && 'اكتمل'}
                        </p>
                    </div>

                    {/* Actions */}
                    {item.isIncoming && item.state === TransferState.PENDING && (
                        <Button onClick={() => onAccept([item.id])} className="!py-2 !px-3 text-xs" variant="primary">
                            <Download size={16} /> قبول
                        </Button>
                    )}
                    
                    {item.isIncoming && item.state === TransferState.COMPLETED && item.blobUrl && (
                         <a 
                         href={item.blobUrl} 
                         download={item.meta.name}
                         className="bg-green-500/20 hover:bg-green-500 text-green-500 hover:text-white p-2 rounded transition-colors"
                         >
                          <Download size={20} />
                         </a>
                    )}
                </div>

                {(item.state === TransferState.TRANSFERRING || item.state === TransferState.COMPLETED) && (
                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden w-full dir-ltr">
                        <div 
                            className={`h-full transition-all duration-300 ${item.state === TransferState.COMPLETED ? 'bg-green-500' : 'bg-neon-blue'}`}
                            style={{ width: `${item.progress}%` }}
                        ></div>
                    </div>
                )}
            </div>
        ))}
        {items.length === 0 && (
            <div className="text-center text-gray-500 py-12 border-2 border-dashed border-white/5 rounded-xl">
                <FileIcon size={40} className="mx-auto mb-2 opacity-20" />
                <p>لا توجد ملفات متبادلة</p>
            </div>
        )}
    </div>
);

const HomeView = ({ onHost, onGuest }: { onHost: () => void, onGuest: () => void }) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-12 animate-fade-in p-6">
        <div className="text-center space-y-4 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight">
                شبكة الملفات <span className="text-neon-blue neon-text">البشرية</span>
            </h2>
            <p className="text-gray-400 text-lg md:text-xl leading-relaxed">
                أنشئ اتصالاً مباشراً (P2P) بين جهازين. <br/>
                تبادل ملفات وتطبيقات بلا حدود. دردش بخصوصية.
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
            <div className="glass p-8 rounded-xl hover:border-neon-blue/50 transition-all cursor-pointer flex flex-col items-center text-center space-y-6 group"
                 onClick={onHost}>
                <div className="w-20 h-20 bg-neon-blue/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Monitor size={40} className="text-neon-blue" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold mb-2">إنشاء غرفة</h3>
                    <p className="text-gray-400">سأقوم بإنشاء الرابط ومشاركته.</p>
                </div>
                <Button className="w-full">بدء جلسة</Button>
            </div>

            <div className="glass p-8 rounded-xl hover:border-purple-500/50 transition-all cursor-pointer flex flex-col items-center text-center space-y-6 group"
                 onClick={onGuest}>
                <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Smartphone size={40} className="text-purple-400" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold mb-2">انضمام لغرفة</h3>
                    <p className="text-gray-400">لدي كود أو سأمسح الباركود.</p>
                </div>
                <Button variant="secondary" className="w-full">اتصال</Button>
            </div>
        </div>
    </div>
);

const ConnectionView = ({ 
    mode, peerId, shareLink, remotePeerId, setRemotePeerId, initGuest, resetApp, isScanning, startScanner, stopScanner, connectionState 
}: any) => {
    if (mode === AppMode.HOST) {
        return (
            <div className="max-w-md mx-auto glass rounded-xl p-8 space-y-6 text-center animate-fade-in">
                <h2 className="text-2xl font-bold mb-2">بانتظار الطرف الآخر...</h2>
                {peerId ? (
                    <>
                    <div className="bg-white p-4 rounded-xl mx-auto w-fit">
                        <QRCodeSVG value={shareLink} size={200} />
                    </div>
                    <div className="space-y-4 pt-4">
                        <div className="bg-black/50 p-3 rounded flex items-center justify-between gap-2 border border-white/10 text-right">
                            <button onClick={() => navigator.clipboard.writeText(peerId)} className="text-gray-400 hover:text-white p-2">
                                <Copy size={16} />
                            </button>
                            <code className="text-sm text-neon-blue font-mono truncate dir-ltr text-center flex-1">{peerId}</code>
                        </div>
                        <p className="text-xs text-gray-500">شارك هذا الكود أو اجعل الطرف الآخر يمسح الباركود</p>
                    </div>
                    </>
                ) : (
                    <div className="py-12"><div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin mx-auto"></div></div>
                )}
                <Button variant="secondary" onClick={resetApp} className="w-full text-xs mt-4">إلغاء</Button>
            </div>
        );
    } 
    
    return (
        <div className="max-w-md mx-auto glass rounded-xl p-8 space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-center">الاتصال بغرفة</h2>
            
            {!isScanning ? (
                <>
                <div className="space-y-2">
                    <label className="text-sm text-gray-400">معرف الغرفة (Host ID)</label>
                    <input 
                        type="text" 
                        value={remotePeerId}
                        onChange={(e) => setRemotePeerId(e.target.value)}
                        placeholder="لصق المعرف هنا..."
                        className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none transition-all font-mono text-center"
                    />
                </div>
                <Button onClick={() => initGuest()} disabled={!remotePeerId} className="w-full">
                    {connectionState === 'CONNECTING' ? 'جاري الاتصال...' : 'دخول'}
                </Button>
                
                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                    <div className="relative flex justify-center"><span className="bg-[#111] px-2 text-xs text-gray-500">أو</span></div>
                </div>

                <Button variant="secondary" className="w-full" onClick={startScanner}>
                    <Scan size={18} /> مسح QR Code
                </Button>
                </>
            ) : (
                <div className="space-y-4">
                    <div className="overflow-hidden rounded-lg border border-neon-blue relative shadow-[0_0_20px_rgba(0,243,255,0.2)]">
                        <div id="reader" className="w-full"></div>
                    </div>
                    <Button variant="secondary" onClick={stopScanner} className="w-full">إلغاء الكاميرا</Button>
                </div>
            )}
            <Button variant="secondary" onClick={resetApp} className="w-full text-xs !bg-transparent !border-0 text-gray-500 hover:text-white mt-2">رجوع</Button>
        </div>
    );
};

const SessionView = ({ transfers, acceptFiles, handleFileSelection, chatMessages, chatInput, setChatInput, handleSendChat, connectionState }: any) => (
    <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in p-4">
        <div className="lg:col-span-2 glass rounded-xl p-6 flex flex-col h-[600px]">
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <FileIcon className="text-neon-blue" size={20} />
                        المدير الملفات
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                        {transfers.length} ملفات في القائمة
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <input 
                        type="file" 
                        id="session-upload" 
                        className="hidden" 
                        multiple
                        // Removed accept attribute to allow all files/apps
                        onChange={(e) => handleFileSelection(e.target.files)}
                    />
                    <Button onClick={() => document.getElementById('session-upload')?.click()}>
                        <Upload size={18} /> إرفاق ملفات/تطبيقات
                    </Button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
                <FileList items={transfers} onAccept={acceptFiles} />
            </div>
        </div>

        <div className="lg:col-span-1 h-full">
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

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [connectionState, setConnectionState] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  // Use a ref to access latest transfers inside callbacks without dependency loops or stale closures
  const transfersRef = useRef<TransferItem[]>([]); 
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const receivedChunks = useRef<Map<string, ArrayBuffer[]>>(new Map());
  const receivedBytes = useRef<Map<string, number>>(new Map());

  // Sync ref with state
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

    // Send Offer
    const metas = newFiles.map(f => f.meta);
    if (connectionState === 'CONNECTED') {
        peerService.sendOffer(metas);
        setTransfers(prev => prev.map(t => newFiles.find(nf => nf.id === t.id) ? { ...t, state: TransferState.PENDING } : t));
    }
  };

  // Define this OUTSIDE init functions so it doesn't get redefined
  // But it needs access to state setters. 
  // IMPORTANT: Since we use peerService.onData (a singleton callback), 
  // we must ensure it can access the LATEST state. 
  // Using transfersRef.current solves the stale closure issue for sending files.
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
        else if (data.type === 'answer') {
             // Explicitly cast to string[] to satisfy TypeScript in sendFiles
             const acceptedIds = new Set(data.fileIds as string[]);
             setTransfers(prev => prev.map(t => {
                 if (acceptedIds.has(t.id)) {
                     return { ...t, state: TransferState.TRANSFERRING };
                 }
                 return t;
             }));
             
             // Access files from REF to avoid stale state
             const currentTransfers = transfersRef.current;
             const filesObjects = currentTransfers
                .filter(t => acceptedIds.has(t.id) && t.file && !t.isIncoming)
                .map(t => t.file!);
             
             if (filesObjects.length > 0) {
                 peerService.sendFiles(filesObjects, Array.from(acceptedIds), (fileId, bytesSent) => {
                    setTransfers(prev => prev.map(t => {
                        if (t.id === fileId) {
                            return { 
                                ...t, 
                                progress: (bytesSent / t.meta.size) * 100, 
                                state: TransferState.TRANSFERRING 
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
            
            if (!receivedChunks.current.has(fileId)) {
                receivedChunks.current.set(fileId, []);
                receivedBytes.current.set(fileId, 0);
                setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, state: TransferState.TRANSFERRING } : t));
            }

            receivedChunks.current.get(fileId)?.push(chunkData);
            const currentBytes = (receivedBytes.current.get(fileId) || 0) + chunkData.byteLength;
            receivedBytes.current.set(fileId, currentBytes);

            setTransfers(prev => prev.map(t => {
                if (t.id === fileId) {
                    return { ...t, progress: (currentBytes / t.meta.size) * 100 };
                }
                return t;
            }));
        }
        else if (data.type === 'file-complete') {
            const { fileId } = data;
            setTransfers(prev => prev.map(t => {
                if (t.id === fileId) {
                    const chunks = receivedChunks.current.get(fileId) || [];
                    const blob = new Blob(chunks, { type: t.meta.type });
                    const url = URL.createObjectURL(blob);
                    receivedChunks.current.delete(fileId);
                    receivedBytes.current.delete(fileId);
                    return { ...t, state: TransferState.COMPLETED, blobUrl: url, progress: 100 };
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
        peerService.onData = handleData; // Hook up handler
        
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
        peerService.onData = handleData; // Hook up handler

        peerService.onError = (err) => {
            setError('فشل الاتصال بالمضيف');
            setConnectionState('DISCONNECTED');
        };
    } catch (e) {
        setError("فشل الاتصال");
    }
  };

  // ... Scanner methods same as before ...
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
    window.history.pushState("", document.title, window.location.pathname + window.location.search);
  };

  const shareLink = `${window.location.origin}${window.location.pathname}#/join?id=${peerId}`;

  return (
    <div className="min-h-screen text-gray-200 selection:bg-neon-blue selection:text-black font-sans pb-12" dir="rtl">
      <header className="p-4 md:p-6 flex items-center justify-between border-b border-white/5 glass sticky top-0 z-50">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => mode !== AppMode.HOME && confirm('هل تريد الخروج؟') && resetApp()}>
            <div className="w-10 h-10 bg-neon-blue rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(0,243,255,0.5)]">
              <Zap size={24} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-mono tracking-tighter text-white">
                Human<span className="text-neon-blue">CDN</span>
              </h1>
            </div>
          </div>
          
          {connectionState === 'CONNECTED' && (
              <div className="hidden md:flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                  <Wifi size={14} className="text-green-500 animate-pulse" />
                  <span className="text-xs text-green-500 font-bold">اتصال آمن</span>
              </div>
          )}

          {mode !== AppMode.HOME && (
            <Button variant="secondary" onClick={resetApp} className="!py-2 !px-4 text-xs">
              <X size={16} /> خروج
            </Button>
          )}
      </header>
      
      <main className="container mx-auto mt-8">
        {error && (
            <div className="max-w-md mx-auto mb-8 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-200 animate-pulse">
                <AlertCircle size={20} />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="mr-auto hover:text-white"><X size={16}/></button>
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
            handleFileSelection={handleFileSelection}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            handleSendChat={handleSendChat}
            connectionState={connectionState}
        />}
      </main>

      {connectionState === 'CONNECTED' && (
        <footer className="fixed bottom-0 w-full p-2 bg-black/80 backdrop-blur-md border-t border-white/5 text-[10px] text-gray-600 flex justify-center px-6 font-mono z-40 dir-ltr">
            <span className="opacity-50">CONNECTED VIA WEBRTC DATA CHANNEL // P2P ENCRYPTED</span>
        </footer>
      )}
    </div>
  );
};

export default App;