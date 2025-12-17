import Peer, { DataConnection } from 'peerjs';
import { FileMeta } from '../types';

// --- PERFORMANCE CONFIGURATION ---
const CHUNK_SIZE = 64 * 1024; // 64KB chunks
const BUFFER_THRESHOLD = 1024 * 1024; // 1MB Buffer (Reduced slightly for tighter control)
const UI_UPDATE_INTERVAL = 200; // ms

export class PeerService {
  peer: Peer | null = null;
  connection: DataConnection | null = null;
  onConnection: ((conn: DataConnection) => void) | null = null;
  onData: ((data: any) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((err: any) => void) | null = null;

  private lastUpdateMap: Map<string, number> = new Map();
  private cancelledFiles: Set<string> = new Set();

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
        serialization: 'binary' 
    });
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.connection = conn;
    
    conn.on('open', () => {
      console.log('Connection opened (Sequential Turbo Mode)');
      if (conn.dataChannel) {
          conn.dataChannel.bufferedAmountLowThreshold = 0;
      }
      if (this.onConnection) this.onConnection(conn);
    });

    conn.on('data', (data: any) => {
      // FAST PATH: Binary Chunk Handling
      if (data instanceof ArrayBuffer || (data && data.constructor && data.constructor.name === 'ArrayBuffer')) {
          const headerView = new Uint8Array(data, 0, 36);
          const fileId = new TextDecoder().decode(headerView).replace(/\0/g, '').trim();
          
          if (this.cancelledFiles.has(fileId)) return;

          const chunkData = data.slice(36);
          
          if (this.onData) {
              this.onData({
                  type: 'chunk',
                  fileId: fileId,
                  data: chunkData
              });
          }
      } else {
          // CONTROL PATH: JSON Messages
          if (data.type === 'cancel' && data.fileId) {
             this.cancelledFiles.add(data.fileId);
          }
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

  cancelTransfer(fileId: string) {
      if (!this.connection) return;
      this.cancelledFiles.add(fileId);
      this.connection.send({ type: 'cancel', fileId });
  }

  async sendFiles(files: File[], acceptedIds: string[], onProgress: (fileId: string, bytesSent: number) => void) {
    if (!this.connection) throw new Error("No connection");

    const filesToSend = files.filter(f => acceptedIds.includes((f as any).id)); 
    
    // CRITICAL CHANGE: Sequential Processing
    // Sending files one by one ensures max bandwidth utilization and prevents congestion
    for (const file of filesToSend) {
        await this.sendFileIndividual(file, onProgress);
    }
    
    this.connection.send({ type: 'all-complete' });
  }

  private async sendFileIndividual(file: File, onProgress: (fileId: string, bytesSent: number) => void) {
      if (!this.connection) return;
      
      const fileId = (file as any).id;
      const fileIdBytes = new TextEncoder().encode(fileId); 
      let offset = 0;
      
      const channel = this.connection.dataChannel;
      if (!channel) throw new Error("Data channel not ready");

      console.log(`Starting transfer: ${file.name}`);

      while (offset < file.size) {
          if (!this.connection || !this.connection.open) break;
          
          if (this.cancelledFiles.has(fileId)) {
              this.cancelledFiles.delete(fileId);
              return; 
          }

          // ROBUST BACKPRESSURE
          if (channel.bufferedAmount > BUFFER_THRESHOLD) {
              await new Promise<void>(resolve => {
                  let resolved = false;
                  const handler = () => {
                      if (resolved) return;
                      resolved = true;
                      channel.removeEventListener('bufferedamountlow', handler);
                      resolve();
                  };
                  channel.addEventListener('bufferedamountlow', handler);
                  
                  // Watchdog: If browser doesn't fire event in 500ms, check manually
                  // This fixes "stuck" transfers on some mobile browsers
                  setTimeout(() => {
                      if (!resolved) {
                          resolved = true;
                          channel.removeEventListener('bufferedamountlow', handler);
                          resolve();
                      }
                  }, 500);
              });
          }

          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const chunkBuffer = await slice.arrayBuffer();

          const packet = new Uint8Array(36 + chunkBuffer.byteLength);
          packet.set(fileIdBytes, 0);
          packet.set(new Uint8Array(chunkBuffer), 36);

          try {
              this.connection.send(packet);
          } catch (e) {
              console.error("Send error, retrying...", e);
              await new Promise(r => setTimeout(r, 200));
              continue; 
          }

          offset += chunkBuffer.byteLength;
          
          // Throttle callbacks
          const now = Date.now();
          const lastUpdate = this.lastUpdateMap.get(fileId) || 0;
          if (offset >= file.size || (now - lastUpdate > UI_UPDATE_INTERVAL)) {
              // Use setImmediate-like behavior
              setTimeout(() => onProgress(fileId, offset), 0);
              this.lastUpdateMap.set(fileId, now);
          }
      }

      if (this.cancelledFiles.has(fileId)) return;

      this.connection.send({ type: 'file-complete', fileId });
      this.lastUpdateMap.delete(fileId);
  }

  destroy() {
    this.connection?.close();
    this.peer?.destroy();
    this.peer = null;
    this.connection = null;
    this.lastUpdateMap.clear();
    this.cancelledFiles.clear();
  }
}

export const peerService = new PeerService();