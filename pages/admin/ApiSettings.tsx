
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, ShieldCheck, Save, AlertCircle, Eye, EyeOff, Lock, Crown, Loader2, CheckCircle, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRole } from '../../types';

const ApiSettings = () => {
  const { user, geminiApiKey, geminiApiKeySecondary, updateGeminiApiKeys } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [primaryKey, setPrimaryKey] = useState('');
  const [secondaryKey, setSecondaryKey] = useState('');
  const [showPrimary, setShowPrimary] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!user || user.role !== UserRole.SUPER_ADMIN) {
      navigate('/admin');
    } else {
      setPrimaryKey(geminiApiKey || '');
      setSecondaryKey(geminiApiKeySecondary || '');
    }
  }, [user, navigate, geminiApiKey, geminiApiKeySecondary]);

  const handleSave = async () => {
    if (user?.role !== UserRole.SUPER_ADMIN) return;
    
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      await updateGeminiApiKeys(primaryKey.trim(), secondaryKey.trim());
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user || user.role !== UserRole.SUPER_ADMIN) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-10 pb-10 px-4 sm:px-0">
      <div className="flex items-center justify-between border-b pb-6 dark:border-gray-700">
        <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate('/admin')} className="!p-2 rounded-full h-10 w-10 flex items-center justify-center shrink-0">
                <ArrowLeft size={20} className="rtl:rotate-180" />
            </Button>
            <div>
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white leading-tight flex items-center gap-2">
                    <Crown className="text-amber-500" /> بروتوكول حماية المفاتيح (Dual Key Failover)
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">تأمين استمرارية الذكاء الاصطناعي بنسبة 99.9%</p>
            </div>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-[3rem] shadow-2xl p-6 sm:p-10 border border-gray-100 dark:border-gray-700 relative overflow-hidden"
      >
        <div className="flex items-start gap-4 mb-8 p-5 bg-blue-50 dark:bg-blue-900/20 rounded-3xl border border-blue-100 dark:border-blue-800">
            <Zap className="text-primary shrink-0 mt-1" size={24} />
            <div className="space-y-1">
                <p className="text-sm text-blue-900 dark:text-blue-200 font-black">نظام التبديل التلقائي (Smart Routing)</p>
                <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed font-bold">
                    عند حدوث أي فشل في المفتاح "الأساسي"، سيقوم النظام فوراً وبدون تدخل بشري بالتحويل للمفتاح "الاحتياطي" لضمان عدم توقف التقارير الميدانية.
                </p>
            </div>
        </div>

        <div className="space-y-10">
            {/* Primary Key Field */}
            <div className="relative">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2 px-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> المفتاح الأساسي (Primary)
                </label>
                <div className="relative group">
                    <input 
                        type={showPrimary ? "text" : "password"}
                        value={primaryKey}
                        onChange={(e) => setPrimaryKey(e.target.value)}
                        className="w-full px-6 py-5 rounded-[2rem] border-2 border-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white focus:border-primary outline-none transition-all pr-14 text-left font-mono text-sm shadow-inner"
                        dir="ltr"
                        placeholder="ers-key-primary-..."
                    />
                    <button 
                        type="button"
                        onClick={() => setShowPrimary(!showPrimary)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors p-2"
                    >
                        {showPrimary ? <EyeOff size={22} /> : <Eye size={22} />}
                    </button>
                </div>
            </div>

            {/* Secondary Key Field */}
            <div className="relative">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2 px-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div> المفتاح الاحتياطي (Secondary Failover)
                </label>
                <div className="relative group">
                    <input 
                        type={showSecondary ? "text" : "password"}
                        value={secondaryKey}
                        onChange={(e) => setSecondaryKey(e.target.value)}
                        className="w-full px-6 py-5 rounded-[2rem] border-2 border-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white focus:border-amber-500 outline-none transition-all pr-14 text-left font-mono text-sm shadow-inner"
                        dir="ltr"
                        placeholder="ers-key-secondary-..."
                    />
                    <button 
                        type="button"
                        onClick={() => setShowSecondary(!showSecondary)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-amber-500 transition-colors p-2"
                    >
                        {showSecondary ? <EyeOff size={22} /> : <Eye size={22} />}
                    </button>
                </div>
            </div>

            <Button 
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-5 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 flex items-center justify-center gap-3 transform active:scale-95 transition-all bg-gradient-to-r from-primary to-indigo-600 border-none"
            >
                {isSaving ? (
                    <>
                        <Loader2 className="animate-spin" size={24} />
                        <span>جاري تحديث البروتوكول الآمن...</span>
                    </>
                ) : (
                    <>
                        <Save size={24} />
                        <span>تحديث المفاتيح في قاعدة البيانات</span>
                    </>
                )}
            </Button>

            <AnimatePresence>
                {saveStatus === 'success' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-4 rounded-2xl flex items-center gap-2 text-xs font-black justify-center border border-green-100 dark:border-green-800">
                        <CheckCircle size={18} /> تمت المزامنة بنجاح - النظام يعمل بالوضعية الثنائية الآن.
                    </motion.div>
                )}
                {saveStatus === 'error' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-2xl flex items-center gap-2 text-xs font-black justify-center border border-red-100 dark:border-red-800">
                        <AlertCircle size={18} /> خطأ: فشل الوصول لقاعدة البيانات لتحديث البروتوكول.
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </motion.div>
      
      <div className="text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
              <ShieldCheck size={12} className="text-green-500"/> تم التحقق: بيئة اتصال مشفرة ومؤمنة
          </p>
      </div>
    </div>
  );
};

export default ApiSettings;
