
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Button } from '../components/Button';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, Users, MapPin, Volume2, VolumeX, CheckCircle, Check,
  Siren, Zap, MessageCircle, Send, 
  Mic, FileText, Play, Pause, Home, QrCode, Smartphone, X, Info, AlertTriangle, ShieldCheck, Loader2, Bot, Radio, BellRing, BellOff
} from 'lucide-react';
import { ConfirmModal, Modal } from '../components/Modal';
import { UserRole, EmergencyStatus, Location as LocationType, Emergency } from '../types';
import { generateDynamicSOPChecklist, generateEmergencyAnnouncement } from '../services/geminiService';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, arrayUnion, getDoc } from 'firebase/firestore';
import { Html5Qrcode } from 'html5-qrcode';

function decodeBase64(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
}

async function decodeAudioDataToBuffer(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const frameCount = dataInt16.length; 
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i] / 32768.0;
    return buffer;
}

const Alarm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { 
    emergencies, user, settings, updateSettings, 
    acknowledgeEmergency, respondToEmergency, markOnScene, closeEmergency, 
    stopAllAlerts, unlockAudio, playGlobalSiren, geminiApiKey, geminiApiKeySecondary 
  } = useApp();
  
  const [localEmergency, setLocalEmergency] = useState<Emergency | null>(() => {
      return emergencies.find(e => e.id === id) || null;
  });
  
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [minutesElapsed, setMinutesElapsed] = useState(0);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closureReason, setClosureReason] = useState('تمت السيطرة الكاملة وتأمين الموقع');
  const [overrideReason, setOverrideReason] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  
  // Acknowledgment & On-Scene states
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isOnScene, setIsOnScene] = useState(false);
  const [isMarkingScene, setIsMarkingScene] = useState(false);

  const [actionNotes, setActionNotes] = useState(''); 
  const [announcementText, setAnnouncementText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  const aiAudioCtxRef = useRef<AudioContext | null>(null);
  const aiSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const cachedAudioBufferRef = useRef<AudioBuffer | null>(null);
  const isFetchingAudioRef = useRef(false);
  const [playTrigger, setPlayTrigger] = useState(0);
  const stopLoopRef = useRef(false);

  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'emergencies', id), (snap) => {
        if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() } as Emergency;
            setLocalEmergency(data);
            
            if (!data.checklist && data.status === EmergencyStatus.ACTIVE && geminiApiKey) {
                generateDynamicSOPChecklist(data, geminiApiKey, geminiApiKeySecondary).then(list => { 
                    updateDoc(doc(db, 'emergencies', data.id), { checklist: list }); 
                });
            }
        }
    });
    return () => unsub();
  }, [id, geminiApiKey, geminiApiKeySecondary]);

  useEffect(() => {
    if (!id || !user?.id) return;
    const unsubAck = onSnapshot(doc(db, 'emergencies', id, 'acknowledgments', user.id), (snap) => {
      if (snap.exists()) {
        const ackData = snap.data();
        if (ackData.acknowledgedAt) setHasAcknowledged(true);
        if (ackData.arrivedAt || ackData.stage === 'ON_SCENE') setIsOnScene(true);
      }
    });
    return () => unsubAck();
  }, [id, user?.id]);

  const handleAcknowledge = async () => {
    if (!id || isAcknowledging) return;
    setIsAcknowledging(true);
    try {
      await acknowledgeEmergency(id);
      setHasAcknowledged(true);
    } catch (e) {}
    setIsAcknowledging(false);
  };

  const handleMarkArrival = async () => {
    if (!id || isMarkingScene) return;
    setIsMarkingScene(true);
    try {
      await markOnScene(id);
      setIsOnScene(true);
    } catch (e) {}
    setIsMarkingScene(false);
  };

  const handleSecureClose = async () => {
    if (!localEmergency || isClosing) return;
    setCloseError(null);
    setIsClosing(true);
    try {
      const res = await closeEmergency(localEmergency.id, closureReason, overrideReason);
      if (!res.success) {
        setCloseError(res.message || 'فشل إغلاق البلاغ');
        setIsClosing(false);
        return;
      }
      stopLoopRef.current = true;
      stopAllAlerts();
      setIsCloseModalOpen(false);
      navigate('/');
    } catch (err: any) {
      setCloseError(err.message || 'حدث خطأ أثناء الإغلاق');
    } finally {
      setIsClosing(false);
    }
  };

  useEffect(() => {
    if (localEmergency) {
      setAnnouncementText(`نداء استجابة: حالة ${localEmergency.typeName} في ${localEmergency.locationName}. الرجاء المتابعة.`);
    }
  }, [localEmergency?.id]);

  useEffect(() => {
    unlockAudio();
    stopLoopRef.current = false;

    if (!settings.muteSiren) {
        playGlobalSiren();
    }

    if (!aiAudioCtxRef.current) {
        aiAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    if (aiAudioCtxRef.current.state === 'suspended') {
        aiAudioCtxRef.current.resume().then(() => {
             if (localEmergency) handlePlayAnnouncement(localEmergency);
        });
    } else {
         if (localEmergency) handlePlayAnnouncement(localEmergency);
    }

    return () => {
        stopLoopRef.current = true;
        if (aiSourceNodeRef.current) { 
            try { aiSourceNodeRef.current.stop(); } catch(e) {} 
        }
        stopAllAlerts(); 
        stopScanner();
    };
  }, []);

  const resumeAudioContext = async () => {
      if (aiAudioCtxRef.current) {
          if (aiAudioCtxRef.current.state === 'suspended' || aiAudioCtxRef.current.state === 'interrupted') {
              await aiAudioCtxRef.current.resume();
          }
      }
  };

  const handlePlayAnnouncement = async (targetEmergency: Emergency, isManual = false) => {
      if (stopLoopRef.current) return;
      if (!isManual && settings.muteSiren) return;

      try {
          await resumeAudioContext();

          let buffer = cachedAudioBufferRef.current;
          if (!buffer) {
              if (isFetchingAudioRef.current) return;
              isFetchingAudioRef.current = true;
              try {
                  const base64Audio = await generateEmergencyAnnouncement(targetEmergency, geminiApiKey, geminiApiKeySecondary);
                  if (base64Audio) {
                      const audioData = decodeBase64(base64Audio);
                      buffer = await decodeAudioDataToBuffer(audioData, aiAudioCtxRef.current!);
                      cachedAudioBufferRef.current = buffer;
                  }
              } catch (fetchErr) {
                  if (!isManual) setTimeout(() => setPlayTrigger(prev => prev + 1), 1000);
                  return;
              } finally {
                  isFetchingAudioRef.current = false;
              }
          }
          
          if (!buffer || stopLoopRef.current) return;
          if (!isManual && settings.muteSiren) return;

          if (aiSourceNodeRef.current) { 
              try { aiSourceNodeRef.current.stop(); } catch(e) {} 
          }

          const source = aiAudioCtxRef.current!.createBufferSource();
          source.buffer = buffer; 
          source.connect(aiAudioCtxRef.current!.destination);
          
          source.onended = () => {
              setIsSpeaking(false);
              if (!stopLoopRef.current && !settings.muteSiren) {
                  setPlayTrigger(prev => prev + 1);
              }
          };
          
          source.start(0); 
          setIsSpeaking(true);
          aiSourceNodeRef.current = source;

      } catch (e) { 
          setIsSpeaking(false);
          if (!isManual) setTimeout(() => setPlayTrigger(prev => prev + 1), 2000);
      }
  };

  useEffect(() => {
    if (localEmergency && localEmergency.status === EmergencyStatus.ACTIVE && !stopLoopRef.current) {
        handlePlayAnnouncement(localEmergency);
    }
  }, [localEmergency?.id, localEmergency?.status, settings.muteSiren, playTrigger]);

  const toggleMute = () => {
      const nextMuted = !settings.muteSiren;
      updateSettings({ muteSiren: nextMuted });
      if (nextMuted) {
          stopAllAlerts();
          if (aiSourceNodeRef.current) { 
              try { aiSourceNodeRef.current.stop(); } catch(e) {} 
              aiSourceNodeRef.current = null;
              setIsSpeaking(false);
          }
      } else {
          playGlobalSiren();
          setPlayTrigger(prev => prev + 1);
      }
  };

  const handleConfirmResponse = async () => {
    if (!localEmergency || !actionNotes.trim()) return;
    setIsConfirming(true);
    stopLoopRef.current = true;
    if (aiSourceNodeRef.current) { 
        try { aiSourceNodeRef.current.stop(); } catch(e) {} 
        aiSourceNodeRef.current = null;
    }
    stopAllAlerts(); 
    setIsSpeaking(false);
    
    await respondToEmergency(localEmergency.id, actionNotes);
    navigate('/');
  };

  const startScanner = async () => {
      setIsScanning(true);
      setScanStatus('scanning');
      setTimeout(async () => {
          try {
              qrScannerRef.current = new Html5Qrcode("qr-reader");
              await qrScannerRef.current.start(
                  { facingMode: "environment" },
                  { fps: 10, qrbox: { width: 250, height: 250 } },
                  async (decodedText) => {
                      await handleQrSuccess(decodedText);
                  },
                  () => {}
              );
          } catch (err) {
              setScanStatus('error');
          }
      }, 300);
  };

  const stopScanner = async () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
          qrScannerRef.current = null;
      }
      setIsScanning(false);
  };

  const handleQrSuccess = async (code: string) => {
      if (!localEmergency || !user) return;
      try {
          const locDoc = await getDoc(doc(db, 'locations', localEmergency.locationId));
          if (locDoc.exists()) {
              const locData = locDoc.data() as LocationType;
              if (locData.verificationCode === code.trim().toUpperCase()) {
                  await stopScanner();
                  setScanStatus('success');
                  await updateDoc(doc(db, 'emergencies', localEmergency.id), {
                      verifiedResponders: arrayUnion(user.name)
                  });
              } else {
                  setScanStatus('error');
                  setTimeout(() => setScanStatus('scanning'), 2000);
              }
          }
      } catch (e) {
          setScanStatus('error');
      }
  };

  useEffect(() => {
    if (!localEmergency || localEmergency.status === EmergencyStatus.CLOSED) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - localEmergency.createdAt) / 1000);
      setElapsedTime(`${Math.floor(diff/60).toString().padStart(2, '0')}:${(diff%60).toString().padStart(2, '0')}`);
      setMinutesElapsed(Math.floor(diff/60));
    }, 1000);
    return () => clearInterval(interval);
  }, [localEmergency]);

  const toggleTask = (taskId: string) => {
      setCompletedTaskIds(prev => {
          const isAlreadyCompleted = prev.includes(taskId);
          const next = isAlreadyCompleted ? prev.filter(tid => tid !== taskId) : [...prev, taskId];
          return next;
      });
  };

  if (!localEmergency) return <div className="p-10 text-center font-black">{t('loading')}</div>;

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const isResponder = user?.role === UserRole.RESPONDER || isAdmin;
  const isEscalated = localEmergency.escalated || minutesElapsed > 15;
  const hasResponded = localEmergency.responders?.includes(user?.name || '');

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900 pb-32 flex flex-col items-center overflow-y-auto ltr" onClick={resumeAudioContext} onTouchStart={resumeAudioContext}>
      <motion.div 
        animate={{ opacity: [0.1, 0.6, 0.1] }} 
        transition={{ duration: isEscalated ? 0.3 : 0.8, repeat: Infinity }} 
        className={`fixed inset-0 ${isEscalated ? 'bg-red-600' : 'bg-red-500'} z-0 pointer-events-none`} 
      />
      
      <div className="fixed top-0 left-0 right-0 z-[110] flex items-center justify-between p-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-lg border-b-2 border-primary/20">
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { stopLoopRef.current = true; stopAllAlerts(); navigate('/'); }} className="flex items-center gap-2 bg-primary text-white py-2.5 px-4 rounded-xl shadow-xl border-2 border-white/20 font-black text-xs uppercase"><Home size={18} /><span>{t('back_to_dashboard')}</span></motion.button>
        <button onClick={toggleMute} className="p-2.5 rounded-xl shadow-lg border-2 bg-white dark:bg-gray-800 text-primary border-primary/20 transition-all active:scale-90">{settings.muteSiren ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </div>

      <div className="z-10 w-full max-w-5xl mt-24 px-3 sm:px-4 flex flex-col gap-5">
        
        <motion.div 
            initial={{ scale: 0.8, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden border-4 border-red-600 relative"
        >
            <div className="bg-red-600 p-6 text-center text-white relative">
                <motion.div 
                    animate={{ x: [-10, 10, -10] }} 
                    transition={{ duration: 0.1, repeat: Infinity }}
                    className="flex flex-col items-center gap-2 relative z-10"
                >
                    <div className="flex items-center gap-4">
                        <Siren className="animate-bounce shrink-0" size={48} />
                        <h1 className="text-3xl sm:text-6xl font-black uppercase tracking-tighter italic">تنبيه عام</h1>
                        <Siren className="animate-bounce shrink-0" size={48} />
                    </div>
                    <div className="bg-black/20 px-6 py-2 rounded-full border border-white/30 flex items-center gap-2 mt-2">
                        <Bot className="animate-pulse text-yellow-300" size={24} />
                        <span className="text-xl font-black tracking-widest uppercase">النداء الميداني الذكي</span>
                    </div>
                </motion.div>
            </div>

            <div className="p-6 space-y-6">
                <AnimatePresence>
                    {announcementText && localEmergency.status === EmergencyStatus.ACTIVE && (
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 p-6 rounded-[2rem] shadow-inner relative overflow-hidden"
                        >
                            <div className="flex items-start gap-4">
                                <div className="relative shrink-0">
                                    {isSpeaking && (
                                        <motion.div 
                                            animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                                            transition={{ repeat: Infinity, duration: 1.2 }}
                                            className="absolute -inset-2 bg-red-400 rounded-full z-0"
                                        />
                                    )}
                                    <div className={`bg-red-600 p-4 rounded-2xl text-white shadow-xl relative z-10 ${isSpeaking ? 'animate-pulse' : ''}`}>
                                        <Bot size={32} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Radio size={16} className={`text-red-600 ${isSpeaking ? 'animate-ping' : ''}`} />
                                            <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">بث ذكاء اصطناعي فوري</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isSpeaking && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                {[1, 2, 3, 4, 5].map(i => (
                                                    <motion.div 
                                                        key={i}
                                                        animate={{ height: [4, 16, 4] }}
                                                        transition={{ repeat: Infinity, duration: 0.4, delay: i * 0.1 }}
                                                        className="w-1 bg-red-600 rounded-full"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-lg sm:text-2xl font-black dark:text-white leading-relaxed italic text-red-900 dark:text-red-100">"{announcementText}"</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Phase 2.4: Escalation Banner */}
                {localEmergency.escalated && (
                    <div className="bg-amber-500/15 border-2 border-amber-500 text-amber-900 dark:text-amber-200 p-4 rounded-2xl flex items-center justify-between gap-3 shadow-md animate-pulse">
                        <div className="flex items-center gap-3">
                            <AlertTriangle size={24} className="text-amber-600 shrink-0" />
                            <div>
                                <div className="font-black text-sm">تم تفعيل التصعيد التلقائي - المستوى {localEmergency.escalationLevel || 1}</div>
                                <div className="text-xs opacity-90">{localEmergency.escalationReason || 'تأخر الاستجابة الميدانية عن الحد الزمني المسموح'}</div>
                            </div>
                        </div>
                        <span className="bg-amber-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase">تصعيد نشط</span>
                    </div>
                )}

                {/* Phase 2.3 & 3.1: Complete Emergency Workflow Stages */}
                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-3xl border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 mb-3 flex items-center justify-between">
                        <span>مراحل دورة حياة البلاغ والاستجابة</span>
                        <span className="text-primary font-bold">ERS Workflow</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <StageItem 
                            label="تم الإنشاء" 
                            time={formatArabicTime(localEmergency.createdAt)} 
                            active={true} 
                            completed={true} 
                        />
                        <StageItem 
                            label="تم البث والتنبيه" 
                            time={localEmergency.dispatchedAt ? formatArabicTime(localEmergency.dispatchedAt) : 'فوري'} 
                            active={true} 
                            completed={true} 
                        />
                        <StageItem 
                            label="تأكيد الاستلام" 
                            time={localEmergency.firstAcknowledgedAt ? formatArabicTime(localEmergency.firstAcknowledgedAt) : (hasAcknowledged ? 'تم التأكيد' : 'بانتظار التأكيد')} 
                            active={hasAcknowledged || !!localEmergency.firstAcknowledgedAt} 
                            completed={hasAcknowledged || !!localEmergency.firstAcknowledgedAt} 
                        />
                        <StageItem 
                            label="بدء التدخل" 
                            time={localEmergency.firstResponseAt ? formatArabicTime(localEmergency.firstResponseAt) : (hasResponded ? 'مستجيب' : 'جاري التوجيه')} 
                            active={hasResponded || !!localEmergency.firstResponseAt} 
                            completed={hasResponded || !!localEmergency.firstResponseAt} 
                        />
                        <StageItem 
                            label="الوصول للموقع" 
                            time={localEmergency.firstArrivalAt ? formatArabicTime(localEmergency.firstArrivalAt) : (isOnScene ? 'تم الوصول' : 'في الطريق')} 
                            active={isOnScene || !!localEmergency.firstArrivalAt} 
                            completed={isOnScene || !!localEmergency.firstArrivalAt} 
                        />
                    </div>
                </div>

                {/* Phase 3.3: SLA & Response-Time Monitoring Metrics */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                        <span className="font-black text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                            <Clock size={16} className="text-primary" /> مؤشرات أوقات الاستجابة والـ SLA المعتمد
                        </span>
                        {minutesElapsed <= (localEmergency.slaTargetMinutes || 3) ? (
                            <span className="bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle2 size={12}/> ضمن زمن الـ SLA ({localEmergency.slaTargetMinutes || 3} د)
                            </span>
                        ) : (
                            <span className="bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <AlertTriangle size={12}/> متأخر عن الـ SLA بـ ({minutesElapsed - (localEmergency.slaTargetMinutes || 3)} د)
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="bg-gray-50 dark:bg-gray-900/40 p-2.5 rounded-2xl">
                            <div className="text-[10px] text-gray-400 font-bold mb-1">وقت تأكيد الاستلام</div>
                            <div className="font-black text-primary">
                                {localEmergency.firstAcknowledgedAt 
                                    ? `${Math.max(1, Math.round((localEmergency.firstAcknowledgedAt - localEmergency.createdAt) / 1000))} ثانية` 
                                    : 'بانتظار التأكيد'}
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900/40 p-2.5 rounded-2xl">
                            <div className="text-[10px] text-gray-400 font-bold mb-1">وقت بدء الاستجابة</div>
                            <div className="font-black text-primary">
                                {localEmergency.firstResponseAt 
                                    ? `${Math.max(1, Math.round((localEmergency.firstResponseAt - localEmergency.createdAt) / 1000))} ثانية` 
                                    : (hasResponded ? 'نشط' : 'قيد الانتظار')}
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900/40 p-2.5 rounded-2xl">
                            <div className="text-[10px] text-gray-400 font-bold mb-1">وقت الوصول الميداني</div>
                            <div className="font-black text-primary">
                                {localEmergency.firstArrivalAt 
                                    ? `${Math.max(1, Math.round((localEmergency.firstArrivalAt - localEmergency.createdAt) / 60000))} دقيقة` 
                                    : (isOnScene ? 'بالموقع' : 'في الطريق')}
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900/40 p-2.5 rounded-2xl">
                            <div className="text-[10px] text-gray-400 font-bold mb-1">إجمالي مدة الحادث</div>
                            <div className="font-black text-orange-600">{elapsedTime}</div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <StatBox icon={<MapPin className="text-red-500" size={16}/>} label={t('location')} value={localEmergency.locationName} />
                    <StatBox icon={<Users className="text-blue-500" size={16}/>} label={t('responders')} value={localEmergency.responders?.length || 0} />
                    <StatBox icon={<Clock className="text-orange-500" size={16}/>} label="الزمن" value={elapsedTime} />
                </div>

                {/* Phase 2.3: Explicit Acknowledgment Button */}
                {localEmergency.status === EmergencyStatus.ACTIVE && !hasAcknowledged && (
                    <motion.div 
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        className="bg-green-50 dark:bg-green-950/30 border-2 border-green-500 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-green-500 text-white flex items-center justify-center shrink-0 shadow-md">
                                <Check size={22} />
                            </div>
                            <div>
                                <div className="font-black text-sm text-green-900 dark:text-green-200">تأكيد استلام البلاغ رسمياً (Acknowledge)</div>
                                <div className="text-[11px] text-green-700 dark:text-green-400">الضغط هنا يوقف محرك التصعيد التلقائي ويوثق استلامك في السجل الرسمي</div>
                            </div>
                        </div>
                        <Button 
                            disabled={isAcknowledging} 
                            onClick={handleAcknowledge}
                            className="bg-green-600 hover:bg-green-700 text-white font-black px-6 py-3 rounded-2xl w-full sm:w-auto shadow-md"
                        >
                            {isAcknowledging ? 'جاري التأكيد...' : 'تأكيد الاستلام الآن'}
                        </Button>
                    </motion.div>
                )}

                {/* Arrival & On-Scene Action */}
                {localEmergency.status === EmergencyStatus.ACTIVE && !isOnScene && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-blue-50 dark:bg-blue-950/30 p-4 rounded-3xl border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                                <MapPin size={20} />
                            </div>
                            <div>
                                <div className="font-black text-sm text-blue-900 dark:text-blue-200">هل وصلت إلى موقع الحادث؟</div>
                                <div className="text-[11px] text-blue-700 dark:text-blue-400">يمكنك تأكيد الوصول عبر الزر المباشر أو مسح رمز التحقق QR</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button onClick={handleMarkArrival} disabled={isMarkingScene} className="bg-blue-600 text-white font-black px-5 py-2.5 rounded-2xl w-full sm:w-auto text-xs">
                                {isMarkingScene ? 'جاري التوثيق...' : 'تأكيد الوصول للموقع'}
                            </Button>
                            <Button variant="outline" onClick={startScanner} className="border-blue-400 text-blue-600 font-black px-3 py-2.5 rounded-2xl shrink-0 text-xs">
                                <QrCode size={16} />
                            </Button>
                        </div>
                    </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-900/10 border-r-4 border-blue-400 p-5 rounded-3xl">
                    <h4 className="flex items-center gap-2 font-black text-blue-700 dark:text-blue-300 mb-4 text-xs sm:text-sm"><Zap size={16} /> قائمة المهام الميدانية الذكية</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {!localEmergency.checklist ? (
                        <div className="col-span-full py-4 flex flex-col items-center gap-2 text-gray-400">
                            <Loader2 className="animate-spin" size={24} />
                            <span className="text-[10px] font-black">جاري تجهيز قائمة المهام التكتيكية...</span>
                        </div>
                    ) : (
                        localEmergency.checklist.map((task) => {
                            const isTaskCompleted = completedTaskIds.includes(task.id);
                            return (
                                <div key={task.id} onClick={() => toggleTask(task.id)} className={`flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer transition-all border ${isTaskCompleted ? 'bg-green-500 text-white border-green-600 shadow-md' : 'bg-white dark:bg-gray-800 border-blue-100 dark:border-gray-700'}`}>
                                    {isTaskCompleted ? <CheckCircle size={18}/> : <div className="w-5 h-5 border-2 border-blue-200 rounded-md shrink-0"></div>}
                                    <p className="text-[10px] sm:text-xs font-black leading-tight">{task.text}</p>
                                </div>
                            );
                        })
                    )}
                    </div>
                </div>

                {isResponder && !hasResponded && (
                <div className="space-y-4 bg-gray-50 dark:bg-gray-800/80 p-5 rounded-[2rem] border-2 border-primary shadow-xl">
                    <textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} placeholder="صف الإجراءات التي قمت بها هنا..." className="w-full p-4 rounded-3xl border-2 border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white outline-none text-sm font-bold min-h-[120px] focus:border-primary shadow-inner resize-none" />
                    <Button disabled={!actionNotes.trim() || isConfirming} className="w-full py-5 text-sm sm:text-lg font-black rounded-2xl shadow-2xl disabled:opacity-30 active:scale-95 bg-primary border-none text-white hover:opacity-90 overflow-hidden relative" onClick={handleConfirmResponse}>
                        <AnimatePresence mode="wait">
                            {isConfirming ? (
                                <motion.div key="loading" initial={{ y: 20 }} animate={{ y: 0 }} exit={{ y: -20 }} className="flex items-center justify-center gap-3">
                                    <Loader2 className="animate-spin" /> جاري الإرسال وتأمين الموقع...
                                </motion.div>
                            ) : (
                                <motion.div key="text" initial={{ y: 20 }} animate={{ y: 0 }} exit={{ y: -20 }}>
                                    إرسال الاستجابة وبدء التدخل الميداني
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Button>
                </div>
                )}
                
                {/* Phase 3.2: Authorized Emergency Closure Button */}
                {(localEmergency.createdBy === user?.id || isAdmin) && localEmergency.status === EmergencyStatus.ACTIVE && (
                    <Button 
                        variant="outline" 
                        className="w-full py-4 font-black rounded-2xl border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs shadow-sm flex items-center justify-center gap-2" 
                        onClick={() => {
                            setCloseError(null);
                            setIsCloseModalOpen(true);
                        }}
                    >
                        <ShieldCheck size={18} />
                        <span>{localEmergency.createdBy === user?.id ? 'إغلاق البلاغ نهائياً (بصفتك المنشئ)' : 'إغلاق البلاغ (صلاحية تجاوز إداري)'}</span>
                    </Button>
                )}
            </div>
        </motion.div>
      </div>

      <Modal isOpen={isScanning} onClose={stopScanner} title="ماسح رمز تأكيد الوصول">
          <div className="flex flex-col items-center gap-4">
              <div className="w-full aspect-square bg-black rounded-2xl overflow-hidden relative border-4 border-primary">
                  <div id="qr-reader" className="w-full h-full"></div>
              </div>
              <Button variant="outline" fullWidth onClick={stopScanner} className="rounded-xl font-black py-3">إلغاء</Button>
          </div>
      </Modal>

      {/* Phase 3.2: Secure Authorized Closure Modal */}
      <Modal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} title="إغلاق ملف حالة الطوارئ">
          <div className="space-y-4 text-right">
              {localEmergency.createdBy !== user?.id && isAdmin ? (
                  <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 p-4 rounded-2xl text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-2">
                      <div className="font-black flex items-center gap-1.5 text-sm">
                          <AlertTriangle size={18} className="text-amber-600" /> تنبيه أمني: تجاوز إداري معتمد
                      </div>
                      <p>أنت تقوم بإغلاق بلاغ لم تنشئه بنفسك. طبقاً لسياسة ERS الصارمة، يُلزم النظام إدخال سبب التجاوز الإداري وسيتم توثيقه في سجل التدقيق غير القابل للتعديل.</p>
                      <div>
                          <label className="font-black block mb-1">سبب التجاوز الإداري (إلزامي):</label>
                          <input 
                              type="text" 
                              value={overrideReason} 
                              onChange={(e) => setOverrideReason(e.target.value)} 
                              placeholder="مثال: انتهاء الحالة الميدانية بتفويض من مدير العمليات..." 
                              className="w-full p-2.5 rounded-xl border border-amber-300 dark:border-amber-700 dark:bg-gray-800 text-xs font-bold outline-none"
                          />
                      </div>
                  </div>
              ) : (
                  <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-2xl text-xs text-blue-900 dark:text-blue-200">
                      بصفتك منشئ البلاغ المصرح له، يمكنك اعتماد إنهاء الحالة الميدانية وتأمين الموقع.
                  </div>
              )}

              <div>
                  <label className="block text-xs font-black text-gray-700 dark:text-gray-300 mb-1">سبب وملاحظات الإغلاق الميداني:</label>
                  <textarea 
                      value={closureReason} 
                      onChange={(e) => setClosureReason(e.target.value)} 
                      rows={3} 
                      className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-xs font-bold outline-none resize-none"
                  />
              </div>

              {closeError && (
                  <div className="p-3 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-bold flex items-center gap-2">
                      <AlertTriangle size={16} /> {closeError}
                  </div>
              )}

              <div className="flex gap-2 pt-2">
                  <Button 
                      fullWidth 
                      disabled={isClosing || (localEmergency.createdBy !== user?.id && isAdmin && !overrideReason.trim())} 
                      className="bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl"
                      onClick={handleSecureClose}
                  >
                      {isClosing ? 'جاري توثيق الإغلاق...' : 'تأكيد الإغلاق النهائي وتوثيق السجل'}
                  </Button>
                  <Button variant="outline" onClick={() => setIsCloseModalOpen(false)} className="rounded-xl font-black py-3">إلغاء</Button>
              </div>
          </div>
      </Modal>
    </div>
  );
};

const StageItem = ({ label, time, active, completed }: { label: string; time: string; active: boolean; completed: boolean }) => (
    <div className={`p-2 rounded-2xl border text-center transition-all ${
        completed ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-900 dark:text-green-300' :
        active ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 text-blue-900 dark:text-blue-300 animate-pulse' :
        'bg-gray-100/50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-400'
    }`}>
        <div className="text-[10px] font-black truncate">{label}</div>
        <div className="text-[9px] font-bold opacity-80 mt-0.5">{time}</div>
    </div>
);

const formatArabicTime = (ts?: number) => {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return '';
    }
};

const StatBox = ({ icon, label, value }: any) => (
  <div className="p-2 sm:p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 text-center shadow-sm flex flex-col items-center justify-center overflow-hidden">
      <div className="mb-1">{icon}</div><div className="text-[7px] sm:text-[9px] text-gray-400 font-black uppercase mb-1">{label}</div><div className="text-[8px] sm:text-sm font-black dark:text-white truncate w-full">{value}</div>
  </div>
);

export default Alarm;
