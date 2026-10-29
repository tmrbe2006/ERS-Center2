import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Volume2, Bot, Loader2, AlertCircle, PhoneOff, MessageSquare } from 'lucide-react';

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const AiLiveAssistant: React.FC<{ emergencyContext?: string; onClose: () => void }> = ({ emergencyContext, onClose }) => {
  const [active, setActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const isMutedRef = useRef(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const startSession = async () => {
    setError(null);
    setIsProcessing(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live-assistant`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setActive(true);
        setIsProcessing(false);

        if (emergencyContext) {
          ws.send(JSON.stringify({ type: 'context', context: emergencyContext }));
        }

        const source = inputCtx.createMediaStreamSource(stream);
        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
        
        scriptProcessor.onaudioprocess = (e) => {
          if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);
          ws.send(JSON.stringify({ type: 'audio', audio: pcmBlob.data }));
        };
        
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputCtx.destination);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'transcription' && msg.text) {
            setTranscripts(prev => [...prev, "AI: " + msg.text]);
          }

          if (msg.type === 'audio' && msg.audio && outputAudioContextRef.current) {
            const ctx = outputAudioContextRef.current;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            const audioBuffer = await decodeAudioData(decode(msg.audio), ctx, 24000, 1);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.addEventListener('ended', () => { sourcesRef.current.delete(source); });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }

          if (msg.type === 'interrupted') {
            for (const s of sourcesRef.current) {
              try { s.stop(); } catch(e) {}
            }
            sourcesRef.current.clear();
            if (outputAudioContextRef.current) {
              nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
            }
          }

          if (msg.type === 'error') {
            setError(msg.error || 'تم قطع الاتصال مع خادم الذكاء الاصطناعي.');
            setActive(false);
            setIsProcessing(false);
          }
        } catch (e) {
          console.warn('Error handling live message:', e);
        }
      };

      ws.onclose = () => {
        setActive(false);
        setIsProcessing(false);
        cleanup();
      };

      ws.onerror = (e) => {
        console.error("Live Assistant WebSocket Error:", e);
        setError("تعذر استقرار المكالمة الصوتية مع الخادم.");
        setActive(false);
        setIsProcessing(false);
        cleanup();
      };

    } catch (err: any) {
      setIsProcessing(false);
      setError("تعذر الوصول للميكروفون أو بدء المكالمة.");
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(() => {});
      outputAudioContextRef.current = null;
    }
    for (const source of sourcesRef.current.values()) { 
      try { source.stop(); } catch(e) {} 
    }
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const stopSession = () => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch(e) {}
      wsRef.current = null;
    }
    cleanup();
    onClose();
  };

  return (
    <motion.div initial={{ y: 100, opacity: 0 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-4 right-4 w-[90vw] sm:w-96 z-[100] bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl border-4 border-primary overflow-hidden">
      <div className="bg-primary p-5 flex justify-between items-center text-white">
        <div className="flex items-center gap-2">
            <Bot size={20} className={active ? "animate-pulse" : ""} />
            <h3 className="font-black text-xs uppercase tracking-tighter">الدعم الفني الذكي (Live API)</h3>
        </div>
        <button onClick={stopSession} className="hover:bg-white/20 p-1 rounded-full transition-colors"><X size={20}/></button>
      </div>
      
      <div className="p-6 space-y-4">
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl text-[10px] font-bold border border-red-100 flex items-center gap-3">
            <AlertCircle size={20} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!active ? (
          <div className="text-center py-6 flex flex-col items-center gap-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isProcessing ? 'bg-primary/20 scale-110' : 'bg-primary/10 text-primary'}`}>
                {isProcessing ? <Loader2 className="animate-spin" size={40} /> : <PhoneOff size={40} />}
            </div>
            <div className="space-y-2">
                <p className="text-sm font-black dark:text-white">بدء نداء الدعم الفني</p>
                <p className="text-[10px] text-gray-500 font-bold px-4 leading-relaxed">اتصل بوحدة الاستجابة الذكية ERS للحصول على ملخص الحالة وتوجيهات الاستجابة الفورية.</p>
                <button 
                  onClick={startSession} 
                  disabled={isProcessing} 
                  className="mt-4 w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-3"
                >
                  {isProcessing ? 'جاري الربط...' : 'بدء المكالمة الآن'}
                </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-green-500 animate-ping"></span>
                    <span className="text-[10px] font-black text-green-600 uppercase">مكالمة نشطة</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsMuted(!isMuted)} 
                    className={`p-2 rounded-xl transition-all ${isMuted ? 'bg-red-100 text-red-600 shadow-inner' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {isMuted ? <MicOff size={18}/> : <Mic size={18}/>}
                  </button>
                  <Volume2 size={18} className="text-primary animate-pulse mt-2"/>
                </div>
            </div>
            <div className="h-40 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 space-y-2 text-[10px] border border-gray-100 dark:border-gray-700 font-bold scroll-smooth">
               {transcripts.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                      <MessageSquare className="animate-pulse mb-2" size={24}/>
                      <p className="italic text-center">بانتظار ملخص الدعم الفني...</p>
                   </div>
               ) : (
                   transcripts.map((t, i) => (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={i} className={t.startsWith('AI') ? 'text-primary' : 'text-gray-50'}>
                        {t}
                    </motion.div>
                   ))
               )}
            </div>
            <button onClick={stopSession} className="w-full py-3 text-[10px] font-black text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-100">إنهاء المكالمة</button>
          </div>
        )}
      </div>
    </motion.div>
  );
};
