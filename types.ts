export enum AppMode {
  HOME = 'HOME',
  SENDER = 'SENDER', // Host sending files
  RECEIVER = 'RECEIVER', // Guest receiving files
  REQUESTER = 'REQUESTER', // Host requesting files (Receiver Host)
  UPLOADER = 'UPLOADER', // Guest uploading files (Sender Guest)
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
}

export enum TransferState {
  IDLE = 'IDLE',
  PENDING = 'PENDING', // Waiting for acceptance
  QUEUED = 'QUEUED',
  TRANSFERRING = 'TRANSFERRING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface TransferItem {
  id: string;
  file?: File; // Only available on sender side
  meta: FileMeta;
  progress: number;
  state: TransferState;
  blobUrl?: string; // On receiver side
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'peer';
  text: string;
  timestamp: number;
}

// Data Protocol
export type ProtocolMessage = 
  | { type: 'offer'; files: FileMeta[] } // Sender proposes files
  | { type: 'answer'; fileIds: string[] } // Receiver accepts specific files
  | { type: 'chunk'; fileId: string; data: ArrayBuffer }
  | { type: 'file-complete'; fileId: string }
  | { type: 'all-complete' }
  | { type: 'chat'; text: string; timestamp: number };
