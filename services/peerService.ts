import Peer, { DataConnection } from 'peerjs';
import { FileMeta } from '../types';

// Constants
const CHUNK_SIZE = 16 * 1024; // 16KB chunks
const BUFFER_THRESHOLD = 64 * 1024;

export class PeerService {
  peer: Peer | null = null;
  connection: DataConnection | null = null;
  onConnection: ((conn: DataConnection) => void) | null = null;
  onData: ((data: any) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((err: any) => void) | null = null;

  initialize(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(id, { debug: 1 });

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

  // Send actual file data sequentially
  async sendFiles(files: File[], acceptedIds: string[], onProgress: (fileId: string, bytesSent: number) => void) {
    if (!this.connection) throw new Error("No connection");

    const filesToSend = files.filter(f => acceptedIds.includes((f as any).id)); // (f as any) because we attached ID to File object in UI

    for (const file of filesToSend) {
        const fileId = (file as any).id;
        let offset = 0;
        
        // Loop for a single file
        while (offset < file.size) {
            if (!this.connection || !this.connection.open) break;

            if (this.connection.bufferSize > BUFFER_THRESHOLD) {
                await new Promise(r => setTimeout(r, 50));
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
            
            // Brief yield to event loop
            await new Promise(r => setTimeout(r, 0));
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
