import Peer, { DataConnection } from 'peerjs';
import { FileMeta } from '../types';

// STABILITY TUNING FOR MOBILE
// 16KB is the safe MTU limit for WebRTC on mobile devices. 
// Larger chunks (like 64KB) cause fragmentation overhead which overwhelms mobile CPUs during reassembly.
const CHUNK_SIZE = 16 * 1024; 

// Backpressure Control: 
// Reduced from 16MB to 256KB. This forces the fast sender (Laptop) to pause frequently 
// and wait for the slow receiver (Mobile) to process data, preventing memory crashes on mobile.
const BUFFER_THRESHOLD = 256 * 1024; 

const UI_UPDATE_INTERVAL = 200; 

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
      console.log('Connection opened (Stable Mode)');
      if (this.onConnection) this.onConnection(conn);
    });

    conn.on('data', (data: any) => {
      // HANDLE BINARY DATA (CHUNKS)
      if (data instanceof ArrayBuffer || (data && data.constructor && data.constructor.name === 'ArrayBuffer')) {
          // Robust ID decoding:
          // 1. Extract 36 bytes header
          const headerView = new Uint8Array(data, 0, 36);
          // 2. Decode and REMOVE NULL BYTES/WHITESPACE (Crucial Fix for Mobile 0-byte issue)
          const fileId = new TextDecoder().decode(headerView).replace(/\0/g, '').trim();
          
          if (this.cancelledFiles.has(fileId)) return;

          // 3. Extract payload
          const chunkData = data.slice(36);
          
          if (this.onData) {
              this.onData({
                  type: 'chunk',
                  fileId: fileId,
                  data: chunkData
              });
          }
      } else {
          // HANDLE JSON MESSAGES
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
    
    const promises = filesToSend.map(file => this.sendFileIndividual(file, onProgress));
    
    await Promise.all(promises);
    this.connection.send({ type: 'all-complete' });
  }

  private async sendFileIndividual(file: File, onProgress: (fileId: string, bytesSent: number) => void) {
      if (!this.connection) return;
      
      const fileId = (file as any).id;
      // Ensure strictly 36 bytes for ID
      const fileIdBytes = new TextEncoder().encode(fileId); 
      let offset = 0;
      
      const channel = this.connection.dataChannel;

      while (offset < file.size) {
          if (!this.connection || !this.connection.open) break;
          
          if (this.cancelledFiles.has(fileId)) {
              this.cancelledFiles.delete(fileId);
              return; 
          }

          // Strict Backpressure for Mobile Stability
          while (channel.bufferedAmount > BUFFER_THRESHOLD) {
              await new Promise(r => setTimeout(r, 5));
          }

          const slice = file.slice(offset, offset + CHUNK_SIZE);
          const chunkBuffer = await slice.arrayBuffer();

          // Construct Packet: [ID (36 bytes)] + [Payload]
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
          
          const now = Date.now();
          const lastUpdate = this.lastUpdateMap.get(fileId) || 0;
          if (offset >= file.size || (now - lastUpdate > UI_UPDATE_INTERVAL)) {
              onProgress(fileId, offset);
              this.lastUpdateMap.set(fileId, now);
              await new Promise(r => setTimeout(r, 0)); 
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