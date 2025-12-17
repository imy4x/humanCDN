export enum AppMode {
  HOME = 'HOME',
  HOST = 'HOST',   // The one who created the room
  GUEST = 'GUEST', // The one joining the room
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
}

export enum TransferState {
  IDLE = 'IDLE',
  PENDING = 'PENDING', // Remote side sees this, waiting to accept
  QUEUED = 'QUEUED',   // Sender sees this, waiting for remote to accept
  TRANSFERRING = 'TRANSFERRING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface TransferItem {
  id: string;
  file?: File; // If exists, I am the SENDER
  meta: FileMeta;
  progress: number;
  state: TransferState;
  blobUrl?: string; // If exists, I am the RECEIVER and download is ready
  isIncoming: boolean; // Helper to know if I am sending or receiving
  speed?: number; // Bytes per second
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'peer';
  text: string;
  timestamp: number;
}

// Data Protocol
export type ProtocolMessage = 
  | { type: 'offer'; files: FileMeta[] } 
  | { type: 'answer'; fileIds: string[] } 
  | { type: 'chunk'; fileId: string; data: ArrayBuffer }
  | { type: 'file-complete'; fileId: string }
  | { type: 'all-complete' }
  | { type: 'chat'; text: string; timestamp: number };