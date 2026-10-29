import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, MapPin, BellOff } from 'lucide-react';
import { Emergency } from '../types';
import { useApp } from '../context/AppContext';

interface ToastProps {
  emergency: Emergency | null;
  onClose: () => void;
  onClick: () => void;
}

export const Toast: React.FC<ToastProps> = ({ emergency, onClose, onClick }) => {
  const { dismissEmergency } = useApp();

  // ملاحظة: تم إزالة أي مؤقت إغلاق تلقائي لضمان استمرار الإنذار البصري والصوتي 
  // حتى يتم التفاعل من قبل المستخدم بالاستجابة أو الضغط على زر الإيقاف.
  return (
    <AnimatePresence>
      {emergency && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[100] w-full max-w-lg px-4 print:hidden"
        >
          <div 
            className="bg-red-600 text-white p-4 rounded-xl shadow-2xl flex flex-col gap-4 cursor-pointer border-2 border-red-400 hover:bg-red-700 transition-colors"
            onClick={onClick}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-full animate-pulse">
                  <AlertTriangle size={28} className="text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-lg uppercase tracking-wide">إنذار طوارئ نشط!</h4>
                  <div className="flex items-center gap-2 text-red-100 text-sm mt-1">
                     <span className="font-bold bg-white/20 px-2 py-0.5 rounded">{emergency.typeName}</span>
                     <span>في</span>
                     <span className="flex items-center gap-1"><MapPin size={12} /> {emergency.locationName}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="p-2 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (emergency) dismissEmergency(emergency.id);
                onClose(); 
              }}
              className="w-full bg-white/10 hover:bg-white/20 border border-white/30 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-black transition-all uppercase tracking-tighter"
            >
              <BellOff size={14} /> لست من المعنيين بهذا البلاغ (إيقاف الإنذار)
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};