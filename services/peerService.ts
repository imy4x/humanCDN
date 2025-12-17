import Peer, { DataConnection } from 'peerjs';
import { FileMeta } from '../types';

// ULTRA PERFORMANCE TUNING
const CHUNK_SIZE = 256 * 1024; // 256KB Chunks (Sweet spot for WebRTC throughput)
const BUFFER_THRESHOLD = 16 * 1024 * 1024; // 16MB Buffer (Allows full TCP window saturation)
const UI_UPDATE_INTERVAL = 100; // Throttle UI updates to max 10fps to save CPU for transfer

export class PeerService {
  peer: Peer | null = null;
  connection: DataConnection | null = null;
  onConnection: ((conn: DataConnection) => void) | null = null;
  onData: ((data: any) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((err: any) => void) | null = null;

  // Throttling helpers
  private lastUpdateMap: Map<string, number> = new Map();

  initialize(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(id, { 
        debug: 0, 
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('Peer ID:', id);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer Error:', err);
        if (this.onError) this.onError(err);
        reject(err);
      });
    });
  }

  connect(remoteId: string) {
    if (!this.peer) return;
    const conn = this.peer.connect(remoteId, { 
        reliable: true,
        // Serialization 'none' or 'binary' is handled automatically by PeerJS 
        // when sending ArrayBuffers, but we ensure we handle raw data.
    });
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.connection = conn;
    
    conn.on('open', () => {
      console.log('Connection opened (High Perf Mode)');
      if (this.onConnection) this.onConnection(conn);
    });

    conn.on('data', (data: any) => {
      // BINARY PROTOCOL HANDLER
      if (data instanceof ArrayBuffer) {
          // Structure: [36 bytes UUID string] + [Raw Data]
          // We use direct memory access to avoid copying the whole buffer just to read the ID
          const headerView = new Uint8Array(data, 0, 36);
          const fileId = new TextDecoder().decode(headerView);
          
          // The rest is the chunk
          const chunkData = data.slice(36);
          
          if (this.onData) {
              this.onData({
                  type: 'chunk',
                  fileId: fileId,
                  data: chunkData
              });
          }
      } else {
          // Standard JSON signaling
          if (this.onData) this.onData(data);
      }
    });

    conn.on('close', () => {
      console.log('Connection closed');
      if (this.onClose) this.onClose();
    });

    conn.on('error', (err) => {
      console.error('Connection Error:', err);
      if (this.onError) this.onError(err);
    });
  }

  sendOffer(files: FileMeta[]) {
    if (!this.connection) return;
    this.connection.send({ type: 'offer', files });
  }

  sendAnswer(fileIds: string[]) {
    if (!this.connection) return;
    this.connection.send({ type: 'answer', fileIds });
  }

  sendChat(text: string) {
      if (!this.connection) return;
      const timestamp = Date.now();
      this.connection.send({ type: 'chat', text, timestamp });
  }

  async sendFiles(files: File[], acceptedIds: string[], onProgress: (fileId: string, bytesSent: number) => void) {
    if (!this.connection) throw new Error("No connection");

    const filesToSend = files.filter(f => acceptedIds.includes((f as any).id)); 

    for (const file of filesToSend) {
        const fileId = (file as any).id;
        // Pre-encode File ID to bytes once (36 bytes for UUID)
        const fileIdBytes = new TextEncoder().encode(fileId); 
        
        let offset = 0;
        
        while (offset < file.size) {
            if (!this.connection || !this.connection.open) break;

            const channel = this.connection.dataChannel;
            
            // Aggressive Backpressure: 
            // Only yield if we physically cannot buffer more data in the network stack.
            if (channel && channel.bufferedAmount > BUFFER_THRESHOLD) {
                await new Promise(r => setTimeout(r, 5)); // Minimal wait
                continue;
            }

            // Slice file (Zero-copy in most browsers until arrayBuffer() is called)
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const chunkBuffer = await slice.arrayBuffer();

            // PACKET CONSTRUCTION: [ID (36b)] + [DATA]
            // We create a combined buffer to send 1 packet per chunk.
            // This reduces OS syscalls overhead.
            const packet = new Uint8Array(36 + chunkBuffer.byteLength);
            packet.set(fileIdBytes, 0);
            packet.set(new Uint8Array(chunkBuffer), 36);

            try {
                // Send raw binary
                this.connection.send(packet);
            } catch (e) {
                console.error("Send error", e);
                break;
            }

            offset += chunkBuffer.byteLength;
            
            // THROTTLE UI UPDATES
            // Only calling callback every 100ms or if complete
            const now = Date.now();
            const lastUpdate = this.lastUpdateMap.get(fileId) || 0;
            
            if (offset >= file.size || (now - lastUpdate > UI_UPDATE_INTERVAL)) {
                onProgress(fileId, offset);
                this.lastUpdateMap.set(fileId, now);
            }
        }

        // Send completion signal (Standard JSON is fine here, it's small)
        this.connection.send({ type: 'file-complete', fileId });
        this.lastUpdateMap.delete(fileId);
    }
    
    this.connection.send({ type: 'all-complete' });
  }

  destroy() {
    this.connection?.close();
    this.peer?.destroy();
    this.peer = null;
    this.connection = null;
    this.lastUpdateMap.clear();
  }
}

export const peerService = new PeerService();
