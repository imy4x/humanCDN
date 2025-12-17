import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { 
  Upload, 
  Download, 
  Share2, 
  Zap, 
  FileCheck, 
  AlertCircle,
  Copy,
  Smartphone,
  Wifi,
  X,
  File as FileIcon,
  Check,
  Play,
  MessageSquare,
  Send,
  User,
  ArrowLeft,
  Scan,
  Camera
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

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [connectionState, setConnectionState] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // State for file list
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  
  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Receiver buffer map
  const receivedChunks = useRef<Map<string, ArrayBuffer[]>>(new Map());
  const receivedBytes = useRef<Map<string, number>>(new Map());

  // Check for hash in URL on load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/receive')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const id = params.get('id');
      if (id) {
        setRemotePeerId(id);
        setMode(AppMode.RECEIVER);
      }
    } 
    else if (hash.startsWith('#/upload-to')) {
        const params = new URLSearchParams(hash.split('?')[1]);
        const id = params.get('id');
        if (id) {
            setRemotePeerId(id);
            setMode(AppMode.UPLOADER);
        }
    }
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, mode]);

  // Handle Scanner Cleanup
  useEffect(() => {
      return () => {
          if (scannerRef.current && isScanning) {
              scannerRef.current.stop().catch(console.error);
          }
      };
  }, [isScanning]);

  // --- Logic Helpers ---

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
            state: TransferState.IDLE
        };
    });
    setTransfers(prev => [...prev, ...newFiles]);
  };

  const initHost = async () => {
    setConnectionState('CONNECTING');
    try {
        const id = await peerService.initialize();
        setPeerId(id);
        
        peerService.onConnection = (conn) => {
            setConnectionState('CONNECTED');
        };
        
        setupDataListeners();
        
        peerService.onError = (err) => {
            setError(err.message || 'خطأ في الاتصال');
            setConnectionState('DISCONNECTED');
        };
    } catch (e) {
        setError("فشل تهيئة الشبكة");
    }
  };

  const initGuest = async (overrideId?: string) => {
    const targetId = overrideId || remotePeerId;
    if (!targetId) return;
    
    // If it's a URL, extract the ID
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
            setIsScanning(false); // Stop scanning if success
        };

        setupDataListeners();
        
        peerService.onError = (err) => {
            setError('فشل الاتصال بالطرف الآخر');
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
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
                // Success
                console.log(`Scan result: ${decodedText}`);
                html5QrCode.stop().then(() => {
                     scannerRef.current = null;
                     setIsScanning(false);
                     initGuest(decodedText);
                }).catch(err => console.error(err));
            },
            (errorMessage) => {
                // parse error, ignore usually
            }
          ).catch(err => {
              console.error(err);
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

  const setupDataListeners = () => {
    peerService.onData = (data: any) => {
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
                state: TransferState.PENDING 
            }));
            setTransfers(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                return [...prev, ...newTransfers.filter(t => !existingIds.has(t.id))];
            });
        }
        else if (data.type === 'answer') {
             const acceptedIds = new Set(data.fileIds);
             setTransfers(prev => prev.map(t => {
                 if (acceptedIds.has(t.id)) {
                     return { ...t, state: TransferState.QUEUED };
                 }
                 return t;
             }));
             startTransfer(data.fileIds);
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
  };

  const sendOffer = () => {
    const filesToOffer = transfers.filter(t => t.state === TransferState.IDLE).map(t => t.meta);
    if (filesToOffer.length === 0) return;
    peerService.sendOffer(filesToOffer);
    setTransfers(prev => prev.map(t => t.state === TransferState.IDLE ? { ...t, state: TransferState.PENDING } : t));
  };

  const acceptFiles = (fileIds: string[]) => {
      peerService.sendAnswer(fileIds);
      setTransfers(prev => prev.map(t => fileIds.includes(t.id) ? { ...t, state: TransferState.QUEUED } : t));
  };

  const startTransfer = (fileIds: string[]) => {
      const filesObjects = transfers
        .filter(t => fileIds.includes(t.id) && t.file)
        .map(t => t.file!);
      
      peerService.sendFiles(filesObjects, fileIds, (fileId, bytesSent) => {
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
      }).catch(e => setError("تمت مقاطعة النقل"));
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

  const shareType = mode === AppMode.REQUESTER ? 'upload-to' : 'receive';
  const shareLink = `${window.location.origin}${window.location.pathname}#/${shareType}?id=${peerId}`;

  // --- Sub-components ---

  const ChatBox = () => (
      <div className="glass rounded-xl flex flex-col h-[500px] border border-white/10 overflow-hidden">
          <div className="p-4 bg-white/5 border-b border-white/10 flex items-center gap-2">
              <MessageSquare size={18} className="text-neon-blue"/>
              <span className="font-bold">المحادثة المباشرة</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20">
              {chatMessages.length === 0 && (
                  <div className="text-center text-gray-500 mt-10">
                      <p>ابدأ المحادثة مع الطرف الآخر...</p>
                  </div>
              )}
              {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          msg.sender === 'me' 
                          ? 'bg-neon-blue/20 text-neon-blue rounded-tr-none' 
                          : 'bg-white/10 text-white rounded-tl-none'
                      }`}>
                          <p className="text-sm">{msg.text}</p>
                          <p className="text-[10px] opacity-50 mt-1 text-left">
                              {new Date(msg.timestamp).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}
                          </p>
                      </div>
                  </div>
              ))}
              <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendChat} className="p-3 bg-white/5 border-t border-white/10 flex gap-2">
              <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="اكتب رسالة..."
                  className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-neon-blue outline-none transition-colors text-right dir-rtl"
                  disabled={connectionState !== 'CONNECTED'}
              />
              <button 
                  type="submit"
                  disabled={!chatInput.trim() || connectionState !== 'CONNECTED'}
                  className="bg-neon-blue/20 text-neon-blue p-2 rounded-lg hover:bg-neon-blue hover:text-black transition-colors disabled:opacity-50"
              >
                  <Send size={18} className={connectionState !== 'CONNECTED' ? "" : "transform -rotate-90 md:rotate-0"} /> 
              </button>
          </form>
      </div>
  );

  const FileList = ({ items, isSender, onAccept }: { items: TransferItem[], isSender: boolean, onAccept?: (ids: string[]) => void }) => (
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pl-2">
          {items.map(item => (
              <div key={item.id} className="bg-white/5 p-4 rounded-lg flex flex-col gap-3">
                  <div className="flex items-center gap-4">
                      {item.state === TransferState.COMPLETED ? (
                          <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 shrink-0">
                             <Check size={20} />
                          </div>
                      ) : (
                          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center shrink-0">
                              <FileIcon size={20} className="text-gray-400" />
                          </div>
                      )}
                      
                      <div className="flex-1 min-w-0 text-right">
                          <p className="font-bold truncate text-sm md:text-base">{item.meta.name}</p>
                          <div className="flex justify-between text-xs text-gray-400 mt-1">
                              <span>{formatBytes(item.meta.size)}</span>
                              <span>
                                {item.state === TransferState.IDLE && 'جاهز'}
                                {item.state === TransferState.PENDING && 'في الانتظار'}
                                {item.state === TransferState.QUEUED && 'في الطابور'}
                                {item.state === TransferState.TRANSFERRING && 'جاري النقل...'}
                                {item.state === TransferState.COMPLETED && 'تم النقل'}
                                {item.state === TransferState.ERROR && 'خطأ'}
                              </span>
                          </div>
                      </div>

                      {/* Action Buttons */}
                      {!isSender && item.state === TransferState.PENDING && onAccept && (
                          <Button onClick={() => onAccept([item.id])} className="!py-2 !px-3 text-xs" variant="primary">
                              <Download size={16} />
                          </Button>
                      )}
                      
                      {!isSender && item.state === TransferState.COMPLETED && item.blobUrl && (
                           <a 
                           href={item.blobUrl} 
                           download={item.meta.name}
                           className="bg-green-500/20 hover:bg-green-500 text-green-500 hover:text-white p-2 rounded transition-colors"
                           >
                            <Download size={20} />
                           </a>
                      )}
                  </div>

                  {/* Progress Bar */}
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
              <p className="text-center text-gray-500 py-8 italic">لا توجد ملفات حالياً</p>
          )}
      </div>
  );

  // --- Views ---

  const HomeView = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-12 animate-fade-in p-6">
        <div className="text-center space-y-4 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight">
                أنقل ملفات <span className="text-neon-blue neon-text">ضخمة</span>.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                    مباشرة بين الأجهزة.
                </span>
            </h2>
            <p className="text-gray-400 text-lg md:text-xl">
                أسرع تقنية نقل في العالم. بدون سيرفرات. خصوصية تامة.
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
            {/* Sender Mode */}
            <div className="glass p-8 rounded-xl hover:border-neon-blue/50 transition-colors group cursor-pointer flex flex-col items-center text-center space-y-6"
                 onClick={() => { setMode(AppMode.SENDER); initHost(); }}>
                <div className="w-20 h-20 bg-neon-blue/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Upload size={40} className="text-neon-blue" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold mb-2">إرسال ملفات</h3>
                    <p className="text-gray-400">لدي ملفات، سأقوم بإنشاء رابط للمستلم.</p>
                </div>
                <Button className="w-full">بدء الإرسال</Button>
            </div>

            {/* Receiver Mode (Standard) */}
            <div className="glass p-8 rounded-xl hover:border-neon-purple/50 transition-colors group cursor-pointer flex flex-col items-center text-center space-y-6"
                 onClick={() => setMode(AppMode.RECEIVER)}>
                <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Download size={40} className="text-purple-400" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold mb-2">استلام ملفات</h3>
                    <p className="text-gray-400">لدي كود أو رابط. أريد التحميل.</p>
                </div>
                <Button variant="secondary" className="w-full">إدخال الكود</Button>
            </div>

            {/* Request Mode */}
            <div className="col-span-1 md:col-span-2 glass p-6 rounded-xl border-dashed border-white/20 hover:border-white/40 cursor-pointer flex items-center justify-between px-8"
                 onClick={() => { setMode(AppMode.REQUESTER); initHost(); }}>
                 <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                         <Share2 size={24} className="text-white" />
                     </div>
                     <div className="text-right">
                         <h3 className="text-lg font-bold">طلب ملفات</h3>
                         <p className="text-gray-400 text-sm">أنشئ رابطاً خاصاً ودع أصدقاءك يرفعون الملفات لك مباشرة.</p>
                     </div>
                 </div>
                 <Button variant="secondary">إنشاء طلب</Button>
            </div>
        </div>
    </div>
  );

  const HostView = () => (
      <div className="max-w-6xl mx-auto w-full p-4 md:p-6 animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Col: Connection Info (1 col) */}
          <div className="glass rounded-xl p-6 space-y-6 h-fit lg:col-span-1">
              <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                  <div className="w-12 h-12 bg-neon-blue/20 rounded-full flex items-center justify-center text-neon-blue">
                      {mode === AppMode.SENDER ? <Upload size={24}/> : <Download size={24}/>}
                  </div>
                  <div>
                      <h2 className="text-xl font-bold">{mode === AppMode.SENDER ? 'منصة الإرسال' : 'طلب ملفات'}</h2>
                      <p className="text-gray-400 text-sm">
                          الحالة: <span className={connectionState === 'CONNECTED' ? "text-green-500" : "text-yellow-500"}>
                              {connectionState === 'CONNECTED' ? 'متصل' : 'جاري الانتظار...'}
                          </span>
                      </p>
                  </div>
              </div>

              {connectionState !== 'CONNECTED' ? (
                   <div className="flex flex-col items-center gap-6">
                       {peerId ? (
                           <>
                               <div className="bg-white p-4 rounded-xl">
                                   <QRCodeSVG value={shareLink} size={180} />
                               </div>
                               
                               {/* Host ID Display */}
                               <div className="w-full space-y-2">
                                   <label className="text-xs text-gray-400">معرف الجلسة (Host ID):</label>
                                   <div className="bg-black/50 p-3 rounded flex items-center justify-between gap-2 border border-white/10 group hover:border-neon-blue/50 transition-colors">
                                       <code className="text-sm text-white font-mono truncate select-all">{peerId}</code>
                                       <button 
                                            onClick={() => navigator.clipboard.writeText(peerId)} 
                                            className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                                            title="نسخ المعرف"
                                       >
                                           <Copy size={16} />
                                       </button>
                                   </div>
                               </div>

                               <div className="text-center space-y-3 w-full border-t border-white/10 pt-4">
                                   <p className="text-xs text-gray-400">أو شارك الرابط المباشر</p>
                                   <div className="bg-black/30 p-2 rounded flex items-center justify-between gap-2 border border-white/10">
                                       <code className="text-xs text-neon-blue font-mono truncate flex-1">{shareLink}</code>
                                       <button onClick={() => navigator.clipboard.writeText(shareLink)} className="text-gray-400 hover:text-white p-1">
                                           <Copy size={14} />
                                       </button>
                                   </div>
                               </div>
                           </>
                       ) : (
                           <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin"></div>
                       )}
                   </div>
              ) : (
                  <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-lg text-center space-y-2">
                      <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto text-black mb-2">
                          <Wifi size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-green-500">تم الاتصال بنجاح</h3>
                      <p className="text-sm text-gray-400">النفق المشفر جاهز.</p>
                  </div>
              )}
              
              {/* Chat Component for Host */}
              {connectionState === 'CONNECTED' && <ChatBox />}
          </div>

          {/* Right Col: File Operations (2 cols) */}
          <div className="glass rounded-xl p-6 flex flex-col min-h-[500px] lg:col-span-2">
              {mode === AppMode.SENDER ? (
                  <>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold">الملفات المحددة</h3>
                        <span className="text-xs text-gray-500">{transfers.length} ملفات</span>
                    </div>
                    
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <FileList items={transfers} isSender={true} />
                        
                        <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
                             <input 
                                type="file" 
                                id="file-upload" 
                                className="hidden" 
                                multiple
                                onChange={(e) => handleFileSelection(e.target.files)}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <Button variant="secondary" onClick={() => document.getElementById('file-upload')?.click()}>
                                    <FileIcon size={18} /> إضافة ملفات
                                </Button>
                                <Button 
                                    onClick={sendOffer} 
                                    disabled={connectionState !== 'CONNECTED' || transfers.filter(t => t.state === TransferState.IDLE).length === 0}
                                >
                                    <Zap size={18} /> إرسال الكل
                                </Button>
                            </div>
                        </div>
                    </div>
                  </>
              ) : (
                  <>
                    <h3 className="text-xl font-bold mb-4">الطلبات الواردة</h3>
                    <div className="flex-1 overflow-hidden flex flex-col">
                         <FileList items={transfers} isSender={false} onAccept={acceptFiles} />
                         {transfers.some(t => t.state === TransferState.PENDING) && (
                             <div className="mt-6 pt-6 border-t border-white/10">
                                 <Button 
                                    className="w-full" 
                                    onClick={() => acceptFiles(transfers.filter(t => t.state === TransferState.PENDING).map(t => t.id))}
                                >
                                     <Download size={18} /> قبول الكل وتحميل
                                 </Button>
                             </div>
                         )}
                    </div>
                  </>
              )}
          </div>
      </div>
  );

  const GuestView = () => (
    <div className="max-w-6xl mx-auto w-full p-4 md:p-6 animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection & Chat Column */}
        <div className="glass rounded-xl p-6 space-y-6 lg:col-span-1 h-fit">
            <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                 <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400">
                      {mode === AppMode.RECEIVER ? <Download size={24}/> : <Upload size={24}/>}
                  </div>
                  <div>
                      <h2 className="text-xl font-bold">{mode === AppMode.RECEIVER ? 'منصة التحميل' : 'منصة الرفع'}</h2>
                      <p className="text-gray-400 text-sm">
                          {connectionState === 'CONNECTED' ? 'متصل بالمضيف' : 'غير متصل'}
                      </p>
                  </div>
            </div>

            {connectionState === 'DISCONNECTED' && !remotePeerId && !isScanning && (
                 <div className="space-y-6">
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-300">أدخل معرف المضيف (Host ID)</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={remotePeerId}
                                onChange={(e) => setRemotePeerId(e.target.value)}
                                placeholder="لصق المعرف هنا..."
                                className="flex-1 bg-black/30 border border-white/20 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none transition-all font-mono text-center text-sm"
                            />
                            <Button onClick={() => initGuest()}>اتصال</Button>
                        </div>
                    </div>
                    
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-black/80 px-2 text-gray-500">أو باستخدام الكاميرا</span>
                        </div>
                    </div>

                    <Button variant="secondary" className="w-full" onClick={startScanner}>
                        <Scan size={20} /> مسح كود QR
                    </Button>
                </div>
            )}
            
            {isScanning && (
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-full aspect-square bg-black rounded-lg overflow-hidden border border-neon-blue relative shadow-[0_0_20px_rgba(0,243,255,0.2)]">
                        <div id="reader" className="w-full h-full"></div>
                        <div className="absolute top-0 left-0 w-full h-1 bg-neon-blue animate-[scan_2s_infinite]"></div>
                    </div>
                    <Button variant="secondary" onClick={stopScanner} className="w-full !py-2 text-xs">
                        إلغاء المسح
                    </Button>
                </div>
            )}

            {connectionState === 'CONNECTING' && (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-purple-400 font-mono animate-pulse">جاري تأسيس الاتصال...</p>
                </div>
            )}
            
            {connectionState === 'CONNECTED' && <ChatBox />}
        </div>

        {/* File Area */}
        <div className="glass rounded-xl p-6 lg:col-span-2 min-h-[500px]">
            {connectionState === 'CONNECTED' && (
                <div className="space-y-6 h-full flex flex-col">
                    {mode === AppMode.RECEIVER ? (
                        <>
                             <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold">الملفات المتاحة</h3>
                                {transfers.some(t => t.state === TransferState.PENDING) && (
                                    <Button 
                                        onClick={() => acceptFiles(transfers.filter(t => t.state === TransferState.PENDING).map(t => t.id))}
                                        className="!py-2 !px-4 text-xs"
                                    >
                                        تحميل الكل
                                    </Button>
                                )}
                             </div>
                             <FileList items={transfers} isSender={false} onAccept={acceptFiles} />
                        </>
                    ) : (
                        <>
                            <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-purple-500/50 transition-colors cursor-pointer"
                                 onClick={() => document.getElementById('guest-upload')?.click()}>
                                <input 
                                    type="file" 
                                    id="guest-upload" 
                                    className="hidden" 
                                    multiple
                                    onChange={(e) => handleFileSelection(e.target.files)}
                                />
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <FileIcon size={32} className="text-gray-400" />
                                </div>
                                <h4 className="text-lg font-bold mb-2">اضغط لاختيار ملفات</h4>
                                <Button variant="secondary" className="mt-2 pointer-events-none">
                                    تصفح الملفات
                                </Button>
                            </div>
                            
                            {transfers.length > 0 && (
                                <div className="flex-1 flex flex-col mt-6">
                                    <h4 className="font-bold mb-3">قائمة الرفع</h4>
                                    <FileList items={transfers} isSender={true} />
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        <Button 
                                            className="w-full" 
                                            onClick={sendOffer}
                                            disabled={transfers.filter(t => t.state === TransferState.IDLE).length === 0}
                                        >
                                            <Upload size={18} /> عرض الملفات للرفع
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
             {connectionState !== 'CONNECTED' && !isScanning && (
                <div className="h-full flex flex-col items-center justify-center opacity-50">
                    <FileIcon size={64} className="mb-4 text-gray-600"/>
                    <p>بانتظار الاتصال...</p>
                </div>
            )}
        </div>
    </div>
  );

  const Header = () => (
    <header className="p-4 md:p-6 flex items-center justify-between border-b border-white/5 glass sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-neon-blue rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(0,243,255,0.5)]">
          <Zap size={24} fill="currentColor" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tighter text-white">
            Human<span className="text-neon-blue">CDN</span>
          </h1>
          <p className="text-[10px] text-gray-400 hidden sm:block">أسرع نقل P2P مشفر</p>
        </div>
      </div>
      {mode !== AppMode.HOME && (
        <Button variant="secondary" onClick={resetApp} className="!py-2 !px-4 text-xs">
          <X size={16} /> إنهاء
        </Button>
      )}
    </header>
  );

  return (
    <div className="min-h-screen text-gray-200 selection:bg-neon-blue selection:text-black font-sans pb-12" dir="rtl">
      <Header />
      
      <main className="container mx-auto mt-8">
        {error && (
            <div className="max-w-md mx-auto mb-8 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-200 animate-pulse">
                <AlertCircle size={20} />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="mr-auto hover:text-white"><X size={16}/></button>
            </div>
        )}

        {mode === AppMode.HOME && <HomeView />}
        {(mode === AppMode.SENDER || mode === AppMode.REQUESTER) && <HostView />}
        {(mode === AppMode.RECEIVER || mode === AppMode.UPLOADER) && <GuestView />}
      </main>

      <footer className="fixed bottom-0 w-full p-2 bg-black/80 backdrop-blur-md border-t border-white/5 text-[10px] text-gray-600 flex justify-between px-6 font-mono z-40 dir-ltr">
        <div className="flex gap-4">
             <span className="flex items-center gap-1">
                <Wifi size={10} className={connectionState === 'CONNECTED' ? "text-green-500" : "text-gray-500"} />
                {connectionState}
             </span>
             {peerId && <span>ID: {peerId}</span>}
        </div>
        <div>
            SECURE // P2P // WEBRTC
        </div>
      </footer>
    </div>
  );
};

export default App;