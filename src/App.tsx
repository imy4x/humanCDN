import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Zap, X, AlertCircle } from 'lucide-react';
import { Button } from './components/Button';
import { HomeView } from './views/HomeView';
import { SessionView } from './views/SessionView';
import { AppMode, TransferState, FileMeta, TransferItem, ChatMessage } from './types';
import { peerService } from './services/peerService';

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

    // Speed Calc Logic - Returns undefined if throttled
    const calculateSpeed = (fileId: string, currentBytes: number) => {
        const now = Date.now();
        const record = speedTrackerRef.current.get(fileId);
        if (!record) {
            speedTrackerRef.current.set(fileId, { lastBytes: currentBytes, lastTime: now });
            return 0;
        }
        const timeDiff = now - record.lastTime;
        if (timeDiff < 500) return undefined; // Only update speed every 500ms

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
                    // Sender throttle logic is in peerService, but we double check here
                    if (speed !== undefined || bytesSent === 0) {
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
                    }
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

            // CRITICAL FIX: Throttle receiver UI updates.
            // Only call setTransfers if speed was recalculated (approx every 500ms) or first byte
            if (speed !== undefined || currentBytes < 100000) {
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
            // Use more lenient config for scanner
            const config = { fps: 10, qrbox: { width: 250, height: 250 }, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };
            html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
                html5QrCode.stop().then(() => { scannerRef.current = null; setIsScanning(false); initGuest(decodedText); });
            }, (errorMessage) => {
                // Ignore parse errors, just keep scanning
            }).catch((err) => {
                console.error(err);
                setError("فشل الكاميرا");
                setIsScanning(false);
            });
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
            <header className="px-4 py-4 md:px-8 flex items-center justify-between border-b border-white/5 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-2 cursor-pointer group" onClick={() => mode !== AppMode.HOME && confirm('خروج؟') && resetApp()}>
                    <div className="w-8 h-8 bg-neon-blue rounded flex items-center justify-center text-black group-hover:scale-110 transition-transform">
                        <Zap size={20} fill="currentColor" />
                    </div>
                    <h1 className="text-lg font-bold font-mono text-white tracking-tight">
                        Human<span className="text-neon-blue">CDN</span>
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    {connectionState === 'CONNECTED' && (
                        <div className="flex items-center gap-1.5 bg-green-900/20 px-2 py-1 rounded border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></div>
                            <span className="text-[10px] text-green-500 font-bold">LIVE</span>
                        </div>
                    )}
                    {mode !== AppMode.HOME && <button onClick={resetApp} className="text-gray-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"><X size={20} /></button>}
                </div>
            </header>

            <main className="container mx-auto">
                {error && (
                    <div className="m-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-slide-in backdrop-blur-md sticky top-20 z-40">
                        <AlertCircle size={20} />
                        <span className="text-sm font-bold">{error}</span>
                        <button onClick={() => setError(null)} className="mr-auto hover:bg-red-500/20 p-1 rounded"><X size={16} /></button>
                    </div>
                )}

                {mode === AppMode.HOME && <HomeView onHost={() => { setMode(AppMode.HOST); initHost(); }} onGuest={() => setMode(AppMode.GUEST)} />}

                {mode !== AppMode.HOME && connectionState !== 'CONNECTED' && (
                    <div className="min-h-[60vh] flex items-center justify-center p-4">
                        {/* Simplified Connection View for Better Mobile UX */}
                        <div className="w-full max-w-sm glass rounded-3xl p-8 text-center space-y-8 shadow-2xl animate-fade-in relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-50"></div>
                            <h2 className="text-2xl font-bold tracking-tight">{mode === AppMode.HOST ? 'رمز الغرفة' : 'انضمام'}</h2>

                            {mode === AppMode.HOST ? (
                                !peerId ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="animate-spin w-10 h-10 border-4 border-neon-blue border-t-transparent rounded-full mx-auto"></div>
                                        <p className="text-xs text-gray-500 animate-pulse">جاري إنشاء رابط آمن...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="bg-white p-4 rounded-2xl inline-block shadow-[0_0_30px_rgba(255,255,255,0.1)] transform hover:scale-105 transition-transform duration-300"><QRCodeSVG value={shareLink} size={180} /></div>
                                        <div onClick={() => { navigator.clipboard.writeText(peerId); alert('تم النسخ'); }} className="bg-black/50 p-4 rounded-xl border border-white/10 font-mono text-xs truncate text-neon-blue cursor-pointer active:scale-95 transition-all hover:bg-black/70 hover:border-neon-blue/30 group relative">
                                            {peerId}
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 group-hover:block hidden bg-black px-1 rounded">نسخ</span>
                                        </div>
                                        <p className="text-xs text-gray-500">امسح الرمز أو انسخ المعرف للمشاركة</p>
                                    </div>
                                )) : (
                                !isScanning ? (
                                    <div className="space-y-4">
                                        <input value={remotePeerId} onChange={e => setRemotePeerId(e.target.value)} className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-center font-mono text-sm focus:border-neon-purple focus:shadow-[0_0_15px_rgba(188,19,254,0.2)] outline-none transition-all placeholder:text-gray-600" placeholder="ID الغرفة" />
                                        <Button onClick={() => initGuest()} disabled={!remotePeerId} className="w-full py-4 text-base shadow-lg">اتصال</Button>
                                        <div className="text-xs text-gray-500 font-bold">- أو -</div>
                                        <Button variant="secondary" onClick={startScanner} className="w-full py-4" icon={<Zap size={16} />}>مسح QR بالكاميرا</Button>
                                    </div>
                                ) : (
                                    <div>
                                        <div id="reader" className="rounded-xl overflow-hidden border-2 border-neon-blue shadow-[0_0_20px_rgba(0,243,255,0.2)]"></div>
                                        <p className="text-xs text-neon-blue mt-4 animate-pulse">وجّه الكاميرا نحو الرمز</p>
                                        <button onClick={stopScanner} className="mt-4 text-xs text-red-400 hover:text-red-300 underline">إلغاء الكاميرا</button>
                                    </div>
                                )
                            )}
                            <button onClick={resetApp} className="text-xs text-gray-500 hover:text-white transition-colors">العودة للرئيسية</button>
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
