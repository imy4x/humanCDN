import React from 'react';
import { Upload, Download } from 'lucide-react';

interface HomeViewProps {
    onHost: () => void;
    onGuest: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onHost, onGuest }) => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-10 animate-fade-in p-6 relative">
        <div className="text-center space-y-6 relative z-10">
            <h2 className="text-7xl font-black tracking-tighter neon-text">
                HUMAN<span className="text-neon-blue">CDN</span>
            </h2>
            <p className="text-gray-400 text-xl max-w-md mx-auto leading-relaxed">
                نقل ملفات <span className="text-neon-blue font-bold">بسرعة البرق</span>. <br />
                بدون سيرفرات. بدون حدود. بدون وسيط.
            </p>
        </div>

        <div className="w-full max-w-md space-y-5 relative z-10">
            <button
                onClick={onHost}
                className="w-full group glass hover:bg-neon-blue/10 p-8 rounded-3xl transition-all duration-300 flex items-center justify-between border-neon-blue/20 hover:border-neon-blue hover:scale-[1.02] shadow-[0_0_30px_rgba(0,243,255,0.05)] hover:shadow-[0_0_50px_rgba(0,243,255,0.15)] cursor-pointer"
            >
                <div className="text-right">
                    <h3 className="text-2xl font-bold text-white group-hover:text-neon-blue transition-colors">إرسال</h3>
                    <p className="text-gray-400 text-sm mt-1 group-hover:text-gray-300">إنشاء رابط مشاركة وبدء الضخ</p>
                </div>
                <div className="w-16 h-16 bg-[#0a0a0a] rounded-2xl flex items-center justify-center text-white group-hover:bg-neon-blue group-hover:text-black transition-all duration-300 shadow-lg group-hover:rotate-12">
                    <Upload size={32} />
                </div>
            </button>

            <button
                onClick={onGuest}
                className="w-full group glass hover:bg-neon-purple/10 p-8 rounded-3xl transition-all duration-300 flex items-center justify-between border-white/10 hover:border-neon-purple/50 hover:scale-[1.02] shadow-[0_0_30px_rgba(188,19,254,0.05)] hover:shadow-[0_0_50px_rgba(188,19,254,0.15)] cursor-pointer"
            >
                <div className="text-right">
                    <h3 className="text-2xl font-bold text-white group-hover:text-neon-purple transition-colors">استلام</h3>
                    <p className="text-gray-400 text-sm mt-1 group-hover:text-gray-300">الانضمام لرابط وتحميل الملفات</p>
                </div>
                <div className="w-16 h-16 bg-[#0a0a0a] rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-neon-purple group-hover:text-white transition-all duration-300 shadow-lg group-hover:-rotate-12">
                    <Download size={32} />
                </div>
            </button>
        </div>
    </div>
);
