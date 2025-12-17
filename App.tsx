import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  Play
} from 'lucide-react';
import { Button } from './components/Button';
import { AppMode, TransferState, FileMeta, TransferItem } from './types';
import { peerService } from './services/peerService';

// Utility to format bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
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
  
  // Receiver buffer map: fileId -> ArrayBuffer[]
  const receivedChunks = useRef<Map<string, ArrayBuffer[]>>(new Map());
  const receivedBytes = useRef<Map<string, number>>(new Map());

  // Check for hash in URL on load
  useEffect(() => {
    const hash = window.location.hash;
    // Standard Receiver (scanning Sender's code)
    if (hash.startsWith('#/receive')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const id = params.get('id');
      if (id) {
        setRemotePeerId(id);
        setMode(AppMode.RECEIVER);
      }
    } 
    // Uploader (scanning Requester's code)
    else if (hash.startsWith('#/upload-to')) {
        const params = new URLSearchParams(hash.split('?')[1]);
        const id = params.get('id');
        if (id) {
            setRemotePeerId(id);
            setMode(AppMode.UPLOADER);
        }
    }
  }, []);

  // --- Logic Helpers ---

  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: TransferItem[] = Array.from(fileList).map(f => {
        const id = crypto.randomUUID();
        // Monkey-patch ID onto file object for service to use later
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
            // If we are SENDER host, we wait for user to click send.
            // If we are REQUESTER host, we wait for data (OFFER).
        };
        
        setupDataListeners();
        
        peerService.onError = (err) => {
            setError(err.message);
            setConnectionState('DISCONNECTED');
        };
    } catch (e) {
        setError("Network Init Failed");
    }
  };

  const initGuest = async () => {
    if (!remotePeerId) return;
    setConnectionState('CONNECTING');
    try {
        await peerService.initialize();
        peerService.connect(remotePeerId);
        
        peerService.onConnection = () => {
            setConnectionState('CONNECTED');
        };

        setupDataListeners();
        
        peerService.onError = (err) => {
            setError('Connection failed');
            setConnectionState('DISCONNECTED');
        };
    } catch (e) {
        setError("Connection Failed");
    }
  };

  const setupDataListeners = () => {
    peerService.onData = (data: any) => {
        if (data.type === 'offer') {
            // Received list of files proposed by sender
            const newTransfers: TransferItem[] = data.files.map((m: FileMeta) => ({
                id: m.id,
                meta: m,
                progress: 0,
                state: TransferState.PENDING // Waiting for approval
            }));
            setTransfers(prev => {
                // Merge to avoid duplicates if re-offered
                const existingIds = new Set(prev.map(t => t.id));
                return [...prev, ...newTransfers.filter(t => !existingIds.has(t.id))];
            });
        }
        else if (data.type === 'answer') {
             // Sender received approval for specific files
             const acceptedIds = new Set(data.fileIds);
             setTransfers(prev => prev.map(t => {
                 if (acceptedIds.has(t.id)) {
                     return { ...t, state: TransferState.QUEUED };
                 }
                 return t;
             }));
             
             // Start sending the approved files
             startTransfer(data.fileIds);
        }
        else if (data.type === 'chunk') {
            const { fileId, data: chunkData } = data;
            
            // Initialize buffer if needed
            if (!receivedChunks.current.has(fileId)) {
                receivedChunks.current.set(fileId, []);
                receivedBytes.current.set(fileId, 0);
                // Update UI state to transferring
                setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, state: TransferState.TRANSFERRING } : t));
            }

            receivedChunks.current.get(fileId)?.push(chunkData);
            const currentBytes = (receivedBytes.current.get(fileId) || 0) + chunkData.byteLength;
            receivedBytes.current.set(fileId, currentBytes);

            // Throttle UI updates slightly for performance? React 18 handles batching well.
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
                    // Create Blob
                    const chunks = receivedChunks.current.get(fileId) || [];
                    const blob = new Blob(chunks, { type: t.meta.type });
                    const url = URL.createObjectURL(blob);
                    
                    // Cleanup memory
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
    // Filter IDLE files
    const filesToOffer = transfers.filter(t => t.state === TransferState.IDLE).map(t => t.meta);
    if (filesToOffer.length === 0) return;
    
    peerService.sendOffer(filesToOffer);
    
    // Update local state to show we are waiting for answer
    setTransfers(prev => prev.map(t => t.state === TransferState.IDLE ? { ...t, state: TransferState.PENDING } : t));
  };

  const acceptFiles = (fileIds: string[]) => {
      // Send answer
      peerService.sendAnswer(fileIds);
      // Update local state
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
      }).then(() => {
          // All done
      }).catch(e => setError("Transfer interrupted"));
  };

  const resetApp = () => {
    peerService.destroy();
    setMode(AppMode.HOME);
    setConnectionState('DISCONNECTED');
    setPeerId('');
    setRemotePeerId('');
    setError(null);
    setTransfers([]);
    receivedChunks.current.clear();
    receivedBytes.current.clear();
    window.history.pushState("", document.title, window.location.pathname + window.location.search);
  };

  // --- Dynamic Share Link ---
  // If SENDER mode -> link is for RECEIVER to join.
  // If REQUESTER mode -> link is for UPLOADER to join.
  const shareType = mode === AppMode.REQUESTER ? 'upload-to' : 'receive';
  const shareLink = `${window.location.origin}${window.location.pathname}#/${shareType}?id=${peerId}`;

  // --- Sub-components ---

  const FileList = ({ items, isSender, onAccept }: { items: TransferItem[], isSender: boolean, onAccept?: (ids: string[]) => void }) => (
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
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
                      
                      <div className="flex-1 min-w-0">
                          <p className="font-bold truncate text-sm md:text-base">{item.meta.name}</p>
                          <div className="flex justify-between text-xs text-gray-400">
                              <span>{formatBytes(item.meta.size)}</span>
                              <span>{item.state}</span>
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
                      <div className="h-1 bg-gray-800 rounded-full overflow-hidden w-full">
                          <div 
                              className={`h-full transition-all duration-300 ${item.state === TransferState.COMPLETED ? 'bg-green-500' : 'bg-neon-blue'}`}
                              style={{ width: `${item.progress}%` }}
                          ></div>
                      </div>
                  )}
              </div>
          ))}
          {items.length === 0 && (
              <p className="text-center text-gray-500 py-8 italic">No files in queue</p>
          )}
      </div>
  );

  // --- Views ---

  const HomeView = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-12 animate-fade-in p-6">
        <div className="text-center space-y-4 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight">
                Send <span className="text-neon-blue neon-text">Massive</span> Files.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                    Straight to Device.
                </span>
            </h2>
            <p className="text-gray-400 text-lg md:text-xl">
                No Cloud. No Limits. No Sign-up. Just pure WebRTC magic.
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
                    <h3 className="text-2xl font-bold mb-2">Send Files</h3>
                    <p className="text-gray-400">I have files. I will generate a code for the receiver.</p>
                </div>
                <Button className="w-full">Start Sending</Button>
            </div>

            {/* Receiver Mode (Standard) */}
            <div className="glass p-8 rounded-xl hover:border-neon-purple/50 transition-colors group cursor-pointer flex flex-col items-center text-center space-y-6"
                 onClick={() => setMode(AppMode.RECEIVER)}>
                <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Download size={40} className="text-purple-400" />
                </div>
                <div>
                    <h3 className="text-2xl font-bold mb-2">Receive Files</h3>
                    <p className="text-gray-400">I have a code/link. I want to download.</p>
                </div>
                <Button variant="secondary" className="w-full">Enter Code</Button>
            </div>

            {/* Request Mode (New Feature) */}
            <div className="col-span-1 md:col-span-2 glass p-6 rounded-xl border-dashed border-white/20 hover:border-white/40 cursor-pointer flex items-center justify-between px-8"
                 onClick={() => { setMode(AppMode.REQUESTER); initHost(); }}>
                 <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                         <Share2 size={24} className="text-white" />
                     </div>
                     <div className="text-left">
                         <h3 className="text-lg font-bold">Request Files</h3>
                         <p className="text-gray-400 text-sm">Create a drop zone link for someone to upload to you.</p>
                     </div>
                 </div>
                 <Button variant="secondary">Create Request</Button>
            </div>
        </div>
    </div>
  );

  // Unified Host View (Sender OR Requester)
  // Logic: 
  // If SENDER: Show File Input -> Generate QR -> Wait for Connect -> Send Offer.
  // If REQUESTER: Generate QR -> Wait for Connect -> Wait for Offer -> Show List -> Accept.
  const HostView = () => (
      <div className="max-w-4xl mx-auto w-full p-6 animate-fade-in grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Col: Connection Info */}
          <div className="glass rounded-xl p-8 space-y-8 h-fit">
              <div className="flex items-center gap-4 border-b border-white/10 pb-6">
                  <div className="w-12 h-12 bg-neon-blue/20 rounded-full flex items-center justify-center text-neon-blue">
                      {mode === AppMode.SENDER ? <Upload size={24}/> : <Download size={24}/>}
                  </div>
                  <div>
                      <h2 className="text-2xl font-bold">{mode === AppMode.SENDER ? 'Sending Hub' : 'Requesting Files'}</h2>
                      <p className="text-gray-400 text-sm">
                          Status: <span className={connectionState === 'CONNECTED' ? "text-green-500" : "text-yellow-500"}>{connectionState}</span>
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
                               <div className="text-center space-y-2">
                                   <p className="text-sm text-gray-400">Scan to {mode === AppMode.SENDER ? 'Download' : 'Upload'}</p>
                                   <div className="flex gap-2 justify-center">
                                        <button 
                                            onClick={() => navigator.clipboard.writeText(shareLink)}
                                            className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-xs font-mono flex items-center gap-2"
                                        >
                                            <Copy size={12} /> Copy Link
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
                      <h3 className="text-lg font-bold text-green-500">Peer Connected</h3>
                      <p className="text-sm text-gray-400">Secure tunnel established.</p>
                  </div>
              )}
          </div>

          {/* Right Col: File Operations */}
          <div className="glass rounded-xl p-8 flex flex-col h-[600px]">
              {mode === AppMode.SENDER ? (
                  // SENDER Logic
                  <>
                    <h3 className="text-xl font-bold mb-4">Selected Files</h3>
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
                                    <FileIcon size={18} /> Add Files
                                </Button>
                                <Button 
                                    onClick={sendOffer} 
                                    disabled={connectionState !== 'CONNECTED' || transfers.filter(t => t.state === TransferState.IDLE).length === 0}
                                >
                                    <Zap size={18} /> Send All
                                </Button>
                            </div>
                        </div>
                    </div>
                  </>
              ) : (
                  // REQUESTER Logic
                  <>
                    <h3 className="text-xl font-bold mb-4">Incoming Requests</h3>
                    <div className="flex-1 overflow-hidden flex flex-col">
                         <FileList items={transfers} isSender={false} onAccept={acceptFiles} />
                         {transfers.some(t => t.state === TransferState.PENDING) && (
                             <div className="mt-6 pt-6 border-t border-white/10">
                                 <Button 
                                    className="w-full" 
                                    onClick={() => acceptFiles(transfers.filter(t => t.state === TransferState.PENDING).map(t => t.id))}
                                >
                                     <Download size={18} /> Accept All
                                 </Button>
                             </div>
                         )}
                    </div>
                  </>
              )}
          </div>
      </div>
  );

  // Unified Guest View (Receiver OR Uploader)
  const GuestView = () => (
    <div className="max-w-2xl mx-auto w-full p-6 animate-fade-in">
        <div className="glass rounded-xl p-8 space-y-8">
            <div className="flex items-center gap-4 border-b border-white/10 pb-6">
                 <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400">
                      {mode === AppMode.RECEIVER ? <Download size={24}/> : <Upload size={24}/>}
                  </div>
                  <div>
                      <h2 className="text-2xl font-bold">{mode === AppMode.RECEIVER ? 'Download Terminal' : 'Upload Terminal'}</h2>
                      <p className="text-gray-400 text-sm">Connected to Host</p>
                  </div>
            </div>

            {connectionState === 'DISCONNECTED' && !remotePeerId && (
                 <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-300">Enter Host ID</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={remotePeerId}
                            onChange={(e) => setRemotePeerId(e.target.value)}
                            placeholder="Paste ID here..."
                            className="flex-1 bg-black/30 border border-white/20 rounded-lg px-4 py-3 focus:border-purple-500 focus:outline-none transition-all font-mono"
                        />
                        <Button onClick={initGuest}>Connect</Button>
                    </div>
                </div>
            )}

            {connectionState === 'CONNECTING' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-purple-400 font-mono animate-pulse">ESTABLISHING UPLINK...</p>
                </div>
            )}

            {connectionState === 'CONNECTED' && (
                <div className="space-y-6">
                    {mode === AppMode.RECEIVER ? (
                        // Standard Receiver: View files offered by Sender and Accept
                        <>
                             <div className="flex justify-between items-center">
                                <h3 className="font-bold">Available Files</h3>
                                {transfers.some(t => t.state === TransferState.PENDING) && (
                                    <Button 
                                        onClick={() => acceptFiles(transfers.filter(t => t.state === TransferState.PENDING).map(t => t.id))}
                                        className="!py-2 !px-4 text-xs"
                                    >
                                        Download All
                                    </Button>
                                )}
                             </div>
                             <FileList items={transfers} isSender={false} onAccept={acceptFiles} />
                        </>
                    ) : (
                        // Uploader Guest: Select files and Send Offer to Requester Host
                        <>
                            <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-purple-500/50 transition-colors">
                                <input 
                                    type="file" 
                                    id="guest-upload" 
                                    className="hidden" 
                                    multiple
                                    onChange={(e) => handleFileSelection(e.target.files)}
                                />
                                <Button variant="secondary" onClick={() => document.getElementById('guest-upload')?.click()}>
                                    <FileIcon size={18} /> Select Files to Upload
                                </Button>
                            </div>
                            
                            {transfers.length > 0 && (
                                <>
                                    <FileList items={transfers} isSender={true} />
                                    <Button 
                                        className="w-full" 
                                        onClick={sendOffer}
                                        disabled={transfers.filter(t => t.state === TransferState.IDLE).length === 0}
                                    >
                                        <Upload size={18} /> Offer Selected Files
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    </div>
  );

  const Header = () => (
    <header className="p-6 flex items-center justify-between border-b border-white/5 glass sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-neon-blue rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(0,243,255,0.5)]">
          <Zap size={24} fill="currentColor" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tighter text-white">
            HUMAN<span className="text-neon-blue">CDN</span>
          </h1>
          <p className="text-xs text-gray-400 hidden sm:block">P2P ENCRYPTED TUNNEL</p>
        </div>
      </div>
      {mode !== AppMode.HOME && (
        <Button variant="secondary" onClick={resetApp} className="!py-2 !px-4 text-xs">
          <X size={16} /> END SESSION
        </Button>
      )}
    </header>
  );

  return (
    <div className="min-h-screen text-gray-200 selection:bg-neon-blue selection:text-black font-sans pb-12">
      <Header />
      
      <main className="container mx-auto mt-8">
        {error && (
            <div className="max-w-md mx-auto mb-8 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-200 animate-pulse">
                <AlertCircle size={20} />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-auto hover:text-white"><X size={16}/></button>
            </div>
        )}

        {mode === AppMode.HOME && <HomeView />}
        {(mode === AppMode.SENDER || mode === AppMode.REQUESTER) && <HostView />}
        {(mode === AppMode.RECEIVER || mode === AppMode.UPLOADER) && <GuestView />}
      </main>

      <footer className="fixed bottom-0 w-full p-2 bg-black/80 backdrop-blur-md border-t border-white/5 text-[10px] text-gray-600 flex justify-between px-6 font-mono z-40">
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
