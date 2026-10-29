
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, Navigation, LocateFixed, Flame, DoorOpen, User, Info, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { useTranslation } from 'react-i18next';

interface ArTarget {
  id: string;
  type: 'exit' | 'extinguisher' | 'victim' | 'hazard';
  label: string;
  distance: number; // بالمتر
  angle: number; // الزاوية بالنسبة للمستجيب (0-360)
}

export const ArNavigator: React.FC<{ onClose: () => void, locationName: string }> = ({ onClose, locationName }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [targets, setTargets] = useState<ArTarget[]>([]);
  const [currentHeading, setCurrentHeading] = useState(0); 
  const [headingOffset, setHeadingOffset] = useState(0); // أوفست للمعايرة
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    const mockTargets: ArTarget[] = [
      { id: '1', type: 'victim', label: 'موقع المصاب', distance: 12, angle: 45 },
      { id: '2', type: 'exit', label: 'مخرج الطوارئ A', distance: 45, angle: 180 },
      { id: '3', type: 'extinguisher', label: 'طفائية حريق', distance: 5, angle: 290 },
      { id: '4', type: 'hazard', label: 'تسريب غاز مكتشف', distance: 20, angle: 10 },
    ];
    setTargets(mockTargets);

    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', focusMode: 'continuous' } as any 
        });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (err) {
        setPermissionError("الكاميرا مطلوبة لتشغيل الواقع المعزز.");
      }
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        setCurrentHeading(event.alpha);
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    startCamera();

    return () => {
      stream?.getTracks().forEach(track => track.stop());
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const handleResetCalibration = () => {
      setHeadingOffset(currentHeading);
  };

  const getTargetIcon = (type: string, size: number) => {
    switch(type) {
      case 'exit': return <DoorOpen className="text-green-400" size={size} />;
      case 'extinguisher': return <Flame className="text-red-400" size={size} />;
      case 'victim': return <User className="text-blue-400" size={size} />;
      default: return <AlertCircle className="text-yellow-400" size={size} />;
    }
  };

  const adjustedHeading = (currentHeading - headingOffset + 360) % 360;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover opacity-80" />

      <div className="relative z-10 flex-1 flex flex-col pointer-events-none">
        <div className="p-6 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-start pointer-events-auto">
          <div>
            <h2 className="text-white font-black text-xl flex items-center gap-2">
              <Navigation className="text-primary animate-pulse" /> AR Navigator
            </h2>
            <p className="text-white/70 text-xs font-bold">{locationName}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleResetCalibration} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white flex items-center gap-2 text-[10px] font-black uppercase">
                <RefreshCw size={18} /> {t('reset_ar')}
            </button>
            <button onClick={onClose} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white">
                <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {targets.map(target => {
            let relativeAngle = (target.angle - adjustedHeading + 540) % 360 - 180;
            const isVisible = Math.abs(relativeAngle) < 45;
            
            // حسابات التحجيم والشفافية الديناميكية
            const scale = Math.max(0.4, Math.min(1.2, 1 - (target.distance / 100)));
            const opacity = Math.max(0.2, Math.min(1, 1 - (Math.abs(relativeAngle) / 45)));
            const iconSize = 32 * scale;

            return (
              <AnimatePresence key={target.id}>
                {isVisible && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ 
                      scale: scale, 
                      opacity: opacity, 
                      x: `${relativeAngle * 8}px`,
                      y: `${(target.distance * -2)}px`
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center"
                    transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                  >
                    <div className="flex flex-col items-center gap-2">
                       <div className="bg-white/20 backdrop-blur-xl p-6 rounded-full border-4 border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-transform hover:scale-110">
                          {getTargetIcon(target.type, iconSize)}
                       </div>
                       <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 text-center shadow-2xl">
                          <p className="text-white font-black text-xs">{target.label}</p>
                          <p className="text-primary font-black text-[10px]">{target.distance}m</p>
                       </div>
                       <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-b-[25px] border-b-primary mt-2" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })}

          <div className="absolute bottom-10 left-10 w-24 h-24 bg-black/40 backdrop-blur-md rounded-full border-2 border-white/20 flex items-center justify-center">
             <div className="w-1 h-1 bg-white rounded-full"></div>
             {targets.map(t => (
               <div key={t.id} className={`absolute w-1.5 h-1.5 rounded-full ${t.type === 'victim' ? 'bg-blue-400' : 'bg-red-400'}`} style={{ transform: `rotate(${t.angle - adjustedHeading}deg) translateY(-30px)` }} />
             ))}
             <div className="absolute inset-0 border-t-2 border-primary/40 rounded-full animate-spin-slow"></div>
          </div>
        </div>

        <div className="p-8 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-4 pointer-events-auto">
          {permissionError && <p className="text-red-400 text-xs font-bold bg-red-900/20 px-4 py-2 rounded-full">{permissionError}</p>}
          <div className="flex gap-4">
             <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-white text-[10px] font-bold">
               <LocateFixed size={14} className="text-green-400"/> Sensors Active
             </div>
             <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-white text-[10px] font-bold">
               <Info size={14} className="text-blue-400"/> Calibrated
             </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 4s linear infinite; }
      `}</style>
    </div>
  );
};
