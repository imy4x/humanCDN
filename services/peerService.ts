import Peer, { DataConnection } from 'peerjs';
import { FileMeta } from '../types';

// Performance Tuning for Speed
// 64KB is the recommended max chunk size for reliable WebRTC data channels in Chrome/Firefox.
// Going higher can cause packet loss or blocking.
const CHUNK_SIZE = 64 * 1024; 
// Buffer threshold increased to keep the pipe full but avoid memory crashes.
const BUFFER_THRESHOLD = 256 * 1024; 

export class PeerService {
  peer: Peer | null = null;
  connection: DataConnection | null = null;
  onConnection: ((conn: DataConnection) => void) | null = null;
  onData: ((data: any) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((err: any) => void) | null = null;

  initialize(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create Peer with debug config
      this.peer = new Peer(id, { 
        debug: 1,
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
        // Serialization: 'binary' is slightly faster for files, avoiding JSON overhead for raw chunks if strictly typed, 
        // but 'json' (default in peerjs) is easier for mixed control/data messages. 
        // We stick to default for simplicity in handling mixed 'ProtocolMessage' types.
    });
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.connection = conn;
    
    conn.on('open', () => {
      console.log('Connection opened');
      if (this.onConnection) this.onConnection(conn);
    });

    conn.on('data', (data) => {
      if (this.onData) this.onData(data);
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

  // Send list of files (Offer)
  sendOffer(files: FileMeta[]) {
    if (!this.connection) return;
    this.connection.send({ type: 'offer', files });
  }

  // Accept specific files (Answer)
  sendAnswer(fileIds: string[]) {
    if (!this.connection) return;
    this.connection.send({ type: 'answer', fileIds });
  }

  // Send Chat Message
  sendChat(text: string) {
      if (!this.connection) return;
      const timestamp = Date.now();
      this.connection.send({ type: 'chat', text, timestamp });
  }

  // Send actual file data sequentially with optimized buffering
  async sendFiles(files: File[], acceptedIds: string[], onProgress: (fileId: string, bytesSent: number) => void) {
    if (!this.connection) throw new Error("No connection");

    const filesToSend = files.filter(f => acceptedIds.includes((f as any).id)); 

    for (const file of filesToSend) {
        const fileId = (file as any).id;
        let offset = 0;
        
        // Loop for a single file
        while (offset < file.size) {
            if (!this.connection || !this.connection.open) break;

            // Flow Control: If buffer is full, wait.
            // Use dataChannel.bufferedAmount to check backpressure on the RTCDataChannel
            if (this.connection.dataChannel.bufferedAmount > BUFFER_THRESHOLD) {
                await new Promise(r => setTimeout(r, 10)); // Check again in 10ms
                continue;
            }

            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const buffer = await slice.arrayBuffer();

            this.connection.send({
                type: 'chunk',
                fileId: fileId,
                data: buffer
            });

            offset += buffer.byteLength;
            onProgress(fileId, offset);
            
            // Allow UI to breathe, but keep it tight for speed
            if (offset % (CHUNK_SIZE * 5) === 0) {
                 await new Promise(r => setTimeout(r, 0));
            }
        }

        this.connection.send({ type: 'file-complete', fileId });
    }
    
    this.connection.send({ type: 'all-complete' });
  }

  destroy() {
    this.connection?.close();
    this.peer?.destroy();
    this.peer = null;
    this.connection = null;
  }
}

export const peerService = new PeerService();