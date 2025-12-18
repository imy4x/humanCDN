import React from 'react';
import { File as FileIcon } from 'lucide-react';
import { TransferItem, TransferState } from '../types';
import { formatBytes, formatSpeed } from '../utils/format';

interface TransferCardProps {
    item: TransferItem;
    onAccept: (id: string) => void;
    onCancel: (id: string) => void;
}

export const TransferCard: React.FC<TransferCardProps> = ({ item, onAccept, onCancel }) => {
    const isCompleted = item.state === TransferState.COMPLETED;
    const isTransferring = item.state === TransferState.TRANSFERRING;
    const isPending = item.state === TransferState.PENDING;
    const isCancelled = item.state === TransferState.CANCELLED;

    // Force progress to be at least visible if transferring
    const displayProgress = isTransferring && item.progress < 2 ? 2 : item.progress;

    return (
        <div className={`relative p-4 rounded-xl border transition-all duration-300 overflow-hidden shadow-lg group ${isCancelled
            ? 'bg-red-500/5 border-red-500/10 opacity-60'
            : 'bg-[#161616] border-white/5 hover:border-white/20'
            }`}>
            {/* Main Progress Bar Background */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5">
                {(isTransferring || isCompleted) && !isCancelled && (
                    <div
                        className={`h-full transition-all duration-200 ease-linear shadow-[0_0_15px_currentColor] ${isCompleted ? 'bg-green-500 text-green-500' : (item.isIncoming ? 'bg-neon-purple text-neon-purple' : 'bg-neon-blue text-neon-blue')}`}
                        style={{ width: `${displayProgress}%` }}
                    />
                )}
            </div>

            <div className="flex items-center gap-4 relative z-10">
                {/* File Type Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 ${isCancelled
                    ? 'bg-red-900/10 border-red-500/20 text-red-500'
                    : isCompleted
                        ? 'bg-green-500/10 border-green-500/20 text-green-500 shadow-[0_0_20px_rgba(10,255,10,0.1)]'
                        : item.isIncoming
                            ? 'bg-neon-purple/10 border-neon-purple/20 text-neon-purple'
                            : 'bg-neon-blue/10 border-neon-blue/20 text-neon-blue'
                    }`}>
                    <FileIcon size={24} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-sm text-gray-200 truncate group-hover:text-white transition-colors" title={item.meta.name}>
                            {item.meta.name}
                        </h4>
                        {/* Status Label */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCompleted ? 'bg-green-500/10 text-green-500' :
                            isCancelled ? 'bg-red-500/10 text-red-500' :
                                isTransferring ? 'bg-blue-500/10 text-blue-400' :
                                    'bg-white/10 text-gray-400'
                            }`}>
                            {isCancelled ? 'ملغي' :
                                isCompleted ? 'مكتمل' :
                                    isTransferring ? `${item.progress.toFixed(0)}%` :
                                        isPending ? 'انتظار' : 'طابور'}
                        </span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-gray-400 font-mono mt-2">
                        <span>{formatBytes(item.meta.size)}</span>
                        {isTransferring && item.speed && !isCancelled && (
                            <span className="text-white font-bold animate-pulse">{formatSpeed(item.speed)}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions Toolbar */}
            <div className="flex justify-end gap-3 mt-4 border-t border-white/5 pt-3">
                {item.isIncoming && isPending && !isCancelled && (
                    <button onClick={() => onAccept(item.id)} className="flex-1 bg-neon-blue text-black py-2 rounded-lg text-xs font-bold hover:bg-white transition-all shadow-[0_0_10px_rgba(0,243,255,0.2)] hover:shadow-[0_0_20px_rgba(0,243,255,0.4)]">
                        قبول وتحميل
                    </button>
                )}

                {item.isIncoming && isCompleted && item.blobUrl && (
                    <a href={item.blobUrl} download={item.meta.name} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-bold text-center hover:bg-green-500 transition-all shadow-[0_0_10px_rgba(10,255,10,0.3)]">
                        فتح / حفظ
                    </a>
                )}

                {!isCompleted && !isCancelled && (
                    <button onClick={() => onCancel(item.id)} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-xs hover:bg-red-500 hover:text-white transition-colors">
                        إلغاء
                    </button>
                )}
            </div>
        </div>
    );
};
