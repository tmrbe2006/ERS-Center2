
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, AlertCircle, Camera, Upload, Bot, X, Loader2, ShieldAlert, Users, Construction, FlaskConical, Map as MapIcon, Mic, MicOff } from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { EmergencyType, Location, SOPTask } from '../types';
import { performComprehensiveVisionAnalysis, parseVoiceEmergencyCommand } from '../services/geminiService';

const NewEmergency = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createEmergency, isOfflineMode, geminiApiKey, geminiApiKeySecondary } = useApp();
  
  const [types, setTypes] = useState<EmergencyType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [typeId, setTypeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [smartRoute, setSmartRoute] = useState<string | null>(null);
  
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribeTypes = onSnapshot(collection(db, 'emergency_types'), (snapshot) => {
      const loadedTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as EmergencyType[];
      setTypes(loadedTypes);
    });
    const unsubscribeLocs = onSnapshot(collection(db, 'locations'), (snapshot) => {
      const loadedLocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[];
      setLocations(loadedLocs);
    });
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.lang = 'ar-SA';
        recognitionRef.current.interimResults = false;
        recognitionRef.current.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setVoiceTranscript(transcript);
            handleVoiceParse(transcript);
        };
        recognitionRef.current.onend = () => setIsListening(false);
        recognitionRef.current.onerror = () => setIsListening(false);
    }

    return () => { unsubscribeTypes(); unsubscribeLocs(); };
  }, []);

  const handleVoiceParse = async (text: string) => {
      setIsParsingVoice(true);
      try {
          const result = await parseVoiceEmergencyCommand(text, types, locations, geminiApiKey, geminiApiKeySecondary);
          if (result) {
              if (result.type_name) {
                  const matchedType = types.find(t => t.type_name === result.type_name);
                  if (matchedType) setTypeId(matchedType.id);
              }
              if (result.location_name) {
                  const matchedLoc = locations.find(l => l.name === result.location_name);
                  if (matchedLoc) setLocationId(matchedLoc.id);
              }
              if (result.notes) setNotes(prev => `${prev}\n[صوت]: ${result.notes}`);
          }
      } catch (e) {}
      setIsParsingVoice(false);
  };

  const toggleListening = async () => {
      if (isListening) { recognitionRef.current?.stop(); } 
      else {
          try {
              await navigator.mediaDevices.getUserMedia({ audio: true });
              setVoiceTranscript('');
              recognitionRef.current?.start();
              setIsListening(true);
          } catch (err) { setMicError("إذن الميكروفون مطلوب."); }
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setImagePreview(reader.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleDeepAnalysis = async () => {
      if (!imagePreview) return;
      setAnalyzingImage(true);
      try {
          const analysis = await performComprehensiveVisionAnalysis(imagePreview, geminiApiKey, geminiApiKeySecondary);
          setAiAnalysis(analysis);
          setNotes(prev => `${prev}\n[AI Vision]: ${analysis.summary_ar}`);
      } catch (e) {}
      setAnalyzingImage(false);
  };

  const handleSubmit = async () => {
    if (!typeId || !locationId) { alert("يرجى اختيار النوع والموقع"); return; }
    setIsSubmitting(true);
    try {
      const selectedType = types.find(t => t.id === typeId);
      const selectedLocation = locations.find(l => l.id === locationId);
      
      const emergencyData = {
        typeId: selectedType?.id || 'other',
        typeName: selectedType?.type_name || 'طوارئ عامة',
        locationId: selectedLocation?.id || 'unknown',
        locationName: selectedLocation?.name || 'غير محدد',
        notes
      };

      const id = await createEmergency(emergencyData);
      navigate(`/alarm/${id}`);
    } catch (e) { alert("حدث خطأ أثناء إرسال البلاغ"); }
    setIsSubmitting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6 pb-20 px-2">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-[2.5rem] shadow-xl border-t-8 border-primary transition-all">
        <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl sm:text-3xl font-black text-gray-800 dark:text-white flex items-center gap-3">
                <AlertCircle size={32} className="text-primary" /> بلاغ طوارئ جديد
            </h2>
            <button onClick={toggleListening} className={`p-4 rounded-full transition-all shadow-lg ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-primary/10 text-primary'}`}>
                {isListening ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    {!imagePreview ? (
                        <div onClick={() => fileInputRef.current?.click()} className="h-40 cursor-pointer rounded-2xl bg-white dark:bg-gray-800 flex flex-col items-center justify-center gap-2 text-gray-400">
                            <Upload size={40} />
                            <span className="font-bold text-center">ارفع صورة الحادث (اختياري)</span>
                        </div>
                    ) : (
                        <div className="space-y-4 text-center">
                            <img src={imagePreview} className="w-full h-48 object-cover rounded-2xl shadow-md" />
                            <Button onClick={handleDeepAnalysis} disabled={analyzingImage} className="w-full py-4 rounded-2xl">
                                {analyzingImage ? <Loader2 className="animate-spin" /> : <><Bot className="mr-2" /> تحليل الذكاء الاصطناعي للمشهد</>}
                            </Button>
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                </div>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-widest px-2">نوع الطوارئ</label>
                    <div className="grid grid-cols-2 gap-3">
                        {types.map(t => (
                            <div key={t.id} onClick={() => setTypeId(t.id)} className={`cursor-pointer p-3 rounded-2xl border-2 transition-all flex items-center gap-3 ${typeId === t.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-gray-50 dark:bg-gray-900/50 border-transparent hover:bg-gray-100'}`}>
                                <div className="w-6 h-6 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: t.alert_color }} />
                                <span className="text-[10px] sm:text-xs font-black dark:text-white truncate">{t.type_name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-widest px-2">الموقع المحدد</label>
                    <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full p-4 rounded-2xl border-2 dark:bg-gray-700 dark:text-white outline-none font-bold text-sm shadow-inner">
                        <option value="">اختر الموقع من القائمة</option>
                        {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                    </select>
                </div>

                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اكتب أي تفاصيل إضافية عن المشهد..." className="w-full p-4 rounded-2xl border-2 dark:bg-gray-700 dark:text-white outline-none min-h-[100px] font-bold text-sm shadow-inner" />

                <div className="pt-4 flex gap-4">
                    <Button variant="outline" className="flex-1 py-4 rounded-2xl font-black" onClick={() => navigate('/')}>{t('back')}</Button>
                    <Button variant="danger" className="flex-[2] py-4 rounded-2xl text-lg font-black shadow-lg shadow-red-500/20" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تفعيل الإنذار والنداء الموحد'}
                    </Button>
                </div>
            </div>
        </div>
      </div>
    </motion.div>
  );
};

export default NewEmergency;
