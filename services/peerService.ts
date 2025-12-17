import Peer, { DataConnection } from 'peerjs';
import { FileMeta } from '../types';

// ULTRA PERFORMANCE TUNING
const CHUNK_SIZE = 64 * 1024; // Decreased chunk size slightly to allow smoother interleaving for concurrent files
const BUFFER_THRESHOLD = 16 * 1024 * 1024; // 16MB Buffer
const UI_UPDATE_INTERVAL = 100;

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
    const conn = this.peer.connect(remoteId, { reliable: true });
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
          const headerView = new Uint8Array(data, 0, 36);
          const fileId = new TextDecoder().decode(headerView);
          
          // If we received a chunk for a file we cancelled, ignore it
          // This handles race conditions where chunks arrive after we sent cancel
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
          // If the peer sent a cancel signal, we need to handle it in the App level logic,
          // but we also record it here to stop sending if we are the sender
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

  // New Concurrent Sender logic
  async sendFiles(files: File[], acceptedIds: string[], onProgress: (fileId: string, bytesSent: number) => void) {
    if (!this.connection) throw new Error("No connection");

    // Clean up cancelled set for new files to ensure we don't block re-tries immediately (optional logic)
    // For now we just filter files.
    
    const filesToSend = files.filter(f => acceptedIds.includes((f as any).id)); 
    
    // Execute all file transfers in parallel (Concurrent)
    // The WebRTC data channel will handle the buffering/interleaving via the loop checks
    const promises = filesToSend.map(file => this.sendFileIndividual(file, onProgress));
    
    await Promise.all(promises);
    this.connection.send({ type: 'all-complete' });
  }

  private async sendFileIndividual(file: File, onProgress: (fileId: string, bytesSent: number) => void) {
      if (!this.connection) return;
      
      const fileId = (file as any).id;
      const fileIdBytes = new TextEncoder().encode(fileId); 
      let offset = 0;
      
      while (offset < file.size) {
          if (!this.connection || !this.connection.open) break;
          
          // Check if cancelled
          if (this.cancelledFiles.has(fileId)) {
              console.log(`Transfer cancelled for ${fileId}`);
              this.cancelledFiles.delete(fileId); // Cleanup memory
              return; 
          }

          const channel = this.connection.dataChannel;
          
          // Shared Backpressure: Check if the SHARED channel is busy
          if (channel && channel.bufferedAmount > BUFFER_THRESHOLD) {
              await new Promise(r => setTimeout(r, 10)); // Yield to other files/event loop
              continue;
          }

          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const chunkBuffer = await slice.arrayBuffer();

          const packet = new Uint8Array(36 + chunkBuffer.byteLength);
          packet.set(fileIdBytes, 0);
          packet.set(new Uint8Array(chunkBuffer), 36);

          try {
              this.connection.send(packet);
          } catch (e) {
              console.error("Send error", e);
              break;
          }

          offset += chunkBuffer.byteLength;
          
          // Throttled UI update
          const now = Date.now();
          const lastUpdate = this.lastUpdateMap.get(fileId) || 0;
          if (offset >= file.size || (now - lastUpdate > UI_UPDATE_INTERVAL)) {
              onProgress(fileId, offset);
              this.lastUpdateMap.set(fileId, now);
          }
          
          // Minimal yield to allow other concurrent file loops to send a chunk
          // This ensures one large file doesn't block small ones completely
          if (offset % (CHUNK_SIZE * 5) === 0) {
              await new Promise(r => setTimeout(r, 0)); 
          }
      }

      // Check one last time before sending complete
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