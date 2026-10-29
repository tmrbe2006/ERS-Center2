
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../firebase';
import { collection, addDoc, query, onSnapshot, where, limit, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, X, Send, User as UserIcon, ShieldCheck, ChevronRight, 
  ArrowLeft, Users, LogOut, ChevronDown, Languages, Loader2, 
  Paperclip, Mic, MicOff, Image as ImageIcon, FileText, Play, Pause, Trash2, Download, DownloadCloud, Bell
} from 'lucide-react';

// وظيفة لضغط الصور برمجياً
const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxSide = 1024;
            if (width > height) {
                if (width > maxSide) { height *= maxSide / width; width = maxSide; }
            } else {
                if (height > maxSide) { width *= maxSide / height; height = maxSide; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
    });
};

const AudioBubble = ({ url, isOwn }: { url: string, isOwn: boolean }) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => { 
    if (playing) audioRef.current?.pause(); 
    else audioRef.current?.play(); 
    setPlaying(!playing); 
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 min-w-[150px] py-1">
      <button onClick={toggle} className={`p-2 rounded-full transition-all active:scale-90 ${isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-primary/10 hover:bg-primary/20 text-primary'}`}>
        {playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
      </button>
      <div className="flex-1 space-y-1">
        <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full relative overflow-hidden">
          <motion.div 
            className={`absolute top-0 bottom-0 left-0 ${isOwn ? 'bg-white' : 'bg-primary'}`} 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between text-[8px] font-black ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
          <span>{Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}</span>
          <span>{duration > 0 ? `${Math.floor(duration / 60)}:${(Math.floor(duration % 60)).toString().padStart(2, '0')}` : '--:--'}</span>
        </div>
      </div>
      <audio 
        ref={audioRef} 
        src={url} 
        onEnded={() => setPlaying(false)} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        className="hidden" 
      />
    </div>
  );
};

export const PrivateChatOverlay = () => {
    const { user, users } = useApp();
    const [isOpen, setIsOpen] = useState(false);
    const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});
    const [incomingToast, setIncomingToast] = useState<{senderName: string, text: string} | null>(null);
    const mountTime = useRef(Date.now());

    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<any>(null);

    const isUserOnline = (u: any) => (Date.now() - (u.lastHeartbeat || 0)) < 45000;
    const availableUsers = users.filter(u => u.id !== user?.id && u.role !== 'super-admin');
    const totalUnread = Object.values(unreadBySender).reduce((a: number, b: number) => a + b, 0) as number;

    useEffect(() => {
        if (!user) return;
        
        let isInitialLoad = true;
        const q = query(
            collection(db, 'private_messages'), 
            where('recipientId', '==', user.id)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (isInitialLoad) {
                isInitialLoad = false;
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data() as any;
                    if (data.timestamp > mountTime.current && data.senderId !== user.id) {
                        if (!isOpen || selectedRecipient?.id !== data.senderId) {
                            setUnreadBySender(prev => ({ 
                                ...prev, 
                                [data.senderId]: ((prev[data.senderId] as number) || 0) + 1 
                            }));
                            setIncomingToast({ 
                                senderName: data.senderName, 
                                text: data.mediaType === 'text' ? data.text : `أرسل ${data.mediaType}` 
                            });
                            setTimeout(() => setIncomingToast(null), 5000);
                        }
                    }
                }
            });
        });
        
        return () => unsubscribe();
    }, [user, isOpen, selectedRecipient]);

    useEffect(() => {
        if (!user || !selectedRecipient) return;
        setUnreadBySender(prev => { const next = { ...prev }; delete next[selectedRecipient.id]; return next; });
        const chatRoomId = [user.id, selectedRecipient.id].sort().join('_');
        const q = query(collection(db, 'private_messages'), where('chatRoomId', '==', chatRoomId), limit(150));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            msgs.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
            setMessages(msgs);
            setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
        return () => unsubscribe();
    }, [selectedRecipient, user]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 1024 * 1024 && !file.type.startsWith('image/')) {
            alert("حجم الملف كبير جداً. الحد الأقصى هو 1 ميجابايت.");
            return;
        }

        setIsUploading(true);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
            let base64 = reader.result as string;
            const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
            
            if (type === 'image' && file.size > 200 * 1024) {
                base64 = await compressImage(base64);
            }

            if (base64.length > 1500000) {
                alert("تعذر إرسال الملف: الحجم يتجاوز حدود قاعدة البيانات.");
                setIsUploading(false);
                return;
            }

            await sendMediaMessage(base64, type, file.name);
            setIsUploading(false);
        };
    };

    const sendMediaMessage = async (content: string, type: string, fileName?: string) => {
        if (!user || !selectedRecipient) return;
        const chatRoomId = [user.id, selectedRecipient.id].sort().join('_');
        await addDoc(collection(db, 'private_messages'), {
            chatRoomId,
            text: type === 'text' ? content : (fileName || type),
            mediaUrl: content,
            mediaType: type,
            senderId: user.id,
            senderName: user.name,
            recipientId: selectedRecipient.id,
            timestamp: Date.now()
        });
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        await sendMediaMessage(newMessage.trim(), 'text');
        setNewMessage('');
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];
            mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
            mediaRecorderRef.current.onstop = async () => {
                if (audioChunksRef.current.length === 0) return;
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64 = reader.result as string;
                    if (base64.length > 1500000) {
                        alert("التسجيل طويل جداً، يرجى إرسال رسالة أقصر.");
                        return;
                    }
                    await sendMediaMessage(base64, 'audio');
                };
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
            setRecordingDuration(0);
            timerRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
        } catch (e) { 
            alert("إذن الميكروفون مطلوب لتسجيل الرسائل الصوتية."); 
        }
    };

    const stopRecording = (shouldSend = true) => {
        if (mediaRecorderRef.current && isRecording) {
            if (!shouldSend) audioChunksRef.current = [];
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    const handleDownload = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'ERS_Media';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!user) return null;

    return (
        <>
            <div className="fixed bottom-8 right-4 sm:right-8 z-[100] print:hidden flex flex-col items-end gap-4">
                <AnimatePresence>
                    {incomingToast && !isOpen && (
                        <motion.div initial={{ opacity: 0, x: 50, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} onClick={() => { setIsOpen(true); setIncomingToast(null); }} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-2xl border-2 border-primary flex items-center gap-3 cursor-pointer w-64">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0 animate-bounce"><Bell size={20} /></div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-primary uppercase">{incomingToast.senderName}</p>
                                <p className="text-xs font-bold truncate dark:text-white">{incomingToast.text}</p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setIncomingToast(null); }} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
                        </motion.div>
                    )}
                </AnimatePresence>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsOpen(!isOpen)} className={`${isOpen ? 'bg-red-500' : 'bg-primary'} text-white p-4 rounded-[1.5rem] shadow-xl flex items-center justify-center relative border-4 border-white dark:border-gray-900 transition-colors duration-300`}>
                    {isOpen ? <X size={32} /> : <MessageSquare size={32} />}
                    {!isOpen && totalUnread > 0 && <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black w-6 h-6 rounded-full border-2 border-white flex items-center justify-center animate-pulse shadow-lg">{totalUnread}</span>}
                </motion.button>
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, scale: 0.8, y: 100 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 100 }} className="fixed bottom-28 right-4 sm:right-8 w-[calc(100vw-2rem)] sm:w-80 h-[550px] sm:h-[600px] bg-white dark:bg-gray-900 shadow-2xl rounded-[2.5rem] z-[101] overflow-hidden flex flex-col border border-gray-100 dark:border-gray-800">
                        <div className="bg-gradient-to-r from-primary to-indigo-600 p-4 sm:p-5 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                {selectedRecipient && <button onClick={() => setSelectedRecipient(null)} className="p-1.5 sm:p-2 bg-white/10 rounded-xl"><ArrowLeft size={18} className="rtl:rotate-180"/></button>}
                                <h3 className="font-black text-[13px] sm:text-sm truncate max-w-[150px]">{selectedRecipient ? selectedRecipient.name : "دردشة العمليات"}</h3>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="bg-white/10 p-1.5 sm:p-2 rounded-xl hover:bg-white/20 transition-colors"><ChevronDown size={24} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50 p-4 sm:p-6">
                            {!selectedRecipient ? (
                                <div className="space-y-3">
                                    {availableUsers.map(u => {
                                        const isOnline = isUserOnline(u);
                                        return (
                                            <div key={u.id} onClick={() => setSelectedRecipient(u)} className="flex items-center justify-between p-3 sm:p-4 bg-white dark:bg-gray-800 rounded-2xl cursor-pointer hover:bg-primary/5 transition-all shadow-sm relative group">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center font-black text-primary">{u.name.charAt(0)}</div>
                                                        {(unreadBySender[u.id] || 0) > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">{unreadBySender[u.id]}</span>}
                                                    </div>
                                                    <div className="text-[11px] sm:text-xs font-black dark:text-white">{u.name}</div>
                                                </div>
                                                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-gray-300'}`}></div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {messages.map((msg, i) => (
                                        <div key={i} className={`flex flex-col ${msg.senderId === user?.id ? 'items-end' : 'items-start'}`}>
                                            <div className={`group relative max-w-[90%] p-2.5 sm:p-3 rounded-2xl text-[11px] sm:text-xs font-bold shadow-sm ${msg.senderId === user?.id ? 'bg-primary text-white rounded-tr-none' : 'bg-white dark:bg-gray-800 dark:text-white rounded-tl-none'}`}>
                                                {msg.mediaType === 'image' && (
                                                    <div className="relative group/img">
                                                        <img src={msg.mediaUrl} className="rounded-lg mb-2 cursor-pointer max-h-48 object-cover" onClick={() => window.open(msg.mediaUrl)}/>
                                                        <button onClick={() => handleDownload(msg.mediaUrl, `P_IMG_${Date.now()}.png`)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"><Download size={14}/></button>
                                                    </div>
                                                )}
                                                {msg.mediaType === 'video' && (
                                                    <div className="relative group/vid">
                                                        <video src={msg.mediaUrl} controls className="rounded-lg mb-2 max-h-48" />
                                                        <button onClick={() => handleDownload(msg.mediaUrl, `P_VID_${Date.now()}.mp4`)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover/vid:opacity-100 transition-opacity z-10"><DownloadCloud size={14}/></button>
                                                    </div>
                                                )}
                                                {msg.mediaType === 'audio' && <AudioBubble url={msg.mediaUrl} isOwn={msg.senderId === user?.id} />}
                                                {msg.mediaType === 'file' && (
                                                    <div className="flex items-center justify-between gap-3 p-2 bg-black/10 rounded-lg">
                                                        <div className="flex items-center gap-2 truncate"><FileText size={16}/> <span className="truncate">{msg.text}</span></div>
                                                        <button onClick={() => handleDownload(msg.mediaUrl, msg.text)} className="text-white"><Download size={14}/></button>
                                                    </div>
                                                )}
                                                {msg.mediaType === 'text' && msg.text}
                                            </div>
                                            <span className="text-[8px] text-gray-400 mt-1 font-bold">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    ))}
                                    <div ref={scrollRef} />
                                </div>
                            )}
                        </div>
                        {selectedRecipient && (
                            <div className="p-3 sm:p-4 bg-white dark:bg-gray-900 border-t dark:border-gray-800 flex flex-col gap-2">
                                <AnimatePresence>
                                    {isRecording && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl border border-red-100 dark:border-red-900/50">
                                            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 animate-pulse">
                                                <Mic size={18} />
                                                <span className="text-xs font-black">{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={() => stopRecording(false)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
                                                <button onClick={() => stopRecording(true)} className="bg-red-500 text-white p-1.5 rounded-full shadow-lg active:scale-90 transition-transform"><Send size={20}/></button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div className="flex gap-2 items-center">
                                    {!isRecording && (
                                        <>
                                            <label className="cursor-pointer p-2 text-gray-400 hover:text-primary transition-colors">
                                                <Paperclip size={18}/>
                                                <input type="file" className="hidden" onChange={handleFileUpload} accept="*/*"/>
                                            </label>
                                            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="اكتب رسالة..." className="flex-1 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl px-3 sm:px-4 py-2.5 text-[11px] sm:text-xs outline-none font-bold dark:text-white" onKeyPress={(e) => e.key === 'Enter' && sendMessage(e)} />
                                        </>
                                    )}
                                    {newMessage.trim() ? (
                                        <button onClick={sendMessage} className="bg-primary text-white p-2.5 sm:p-3 rounded-2xl shadow-lg active:scale-95 transition-transform"><Send size={18}/></button>
                                    ) : !isRecording && (
                                        <button onClick={startRecording} className="p-2.5 sm:p-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400 hover:text-primary transition-all active:scale-95"><Mic size={18}/></button>
                                    )}
                                </div>
                                {isUploading && <div className="text-[8px] text-primary font-black animate-pulse text-center">جاري معالجة ورفع الملف...</div>}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
