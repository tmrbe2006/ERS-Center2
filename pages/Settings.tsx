
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Bell, Globe, Palette, ArrowLeft, Check, Plus, User as UserIcon, Lock, Save, Loader2, Languages, Eye, EyeOff, VolumeX, Volume2, MapPin } from 'lucide-react';
import { Button } from '../components/Button';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRole } from '../types';

const MaterialSwitch = ({ checked, onChange, label, description, icon: Icon }: any) => (
  <div className="flex items-center justify-between py-4">
    <div className="flex items-start gap-4">
      {Icon && (
        <div className={`p-2 rounded-full ${checked ? 'bg-primary/10 text-primary' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
          <Icon size={20} />
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{label}</h3>
        {description && <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
    </div>
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        checked ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className={`${checked ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
    </button>
  </div>
);

const SectionHeader = ({ title }: { title: string }) => (
  <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-4 mt-6 px-1">{title}</h4>
);

const SettingsPage = () => {
  const { user, settings, updateSettings, updateProfile } = useApp();
  const { t, i18n: i18nInstance } = useTranslation();
  const navigate = useNavigate();

  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    username: user?.username || '',
    password: user?.password || '',
    country: user?.country || 'Saudi Arabia'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const languages = [
    { id: 'ar', name: 'العربية' },
    { id: 'ku', name: 'کوردی' },
    { id: 'en', name: 'English' },
    { id: 'fr', name: 'Français' },
    { id: 'de', name: 'Deutsch' },
  ];

  const countries = [
    { id: 'Egypt', name: 'مصر (Egypt)' },
    { id: 'Saudi Arabia', name: 'السعودية (KSA)' },
    { id: 'Kuwait', name: 'الكويت (Kuwait)' },
    { id: 'United Arab Emirates', name: 'الإمارات (UAE)' },
    { id: 'Qatar', name: 'قطر (Qatar)' },
  ];

  const presetColors = [
    { id: 'blue', value: '#1976d2', name: 'أزرق' },
    { id: 'red', value: '#dc004e', name: 'أحمر' },
    { id: 'green', value: '#10b981', name: 'أخضر' },
    { id: 'purple', value: '#7c3aed', name: 'بنفسجي' },
    { id: 'indigo', value: '#6366f1', name: 'نيلي' },
    { id: 'orange', value: '#f59e0b', name: 'برتقالي' },
    { id: 'teal', value: '#14b8a6', name: 'سماوي' },
    { id: 'pink', value: '#ec4899', name: 'وردي' },
    { id: 'amber', value: '#d97706', name: 'عنبري' },
  ];

  const handleLanguageChange = (langId: string) => {
    updateSettings({ language: langId as any });
    i18nInstance.changeLanguage(langId);
    const isRTL = langId === 'ar' || langId === 'ku';
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = langId;
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile(profileData);
      setTimeout(() => setIsSaving(false), 1000);
    } catch (e) { 
      alert("حدث خطأ أثناء حفظ البيانات"); 
      setIsSaving(false); 
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" onClick={() => navigate('/')} className="!p-2 rounded-full h-10 w-10 flex items-center justify-center">
            <ArrowLeft size={20} className="rtl:rotate-180" />
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('settings')}</h1>
      </div>

      <div className="space-y-6">
        <section>
             <SectionHeader title={t('appearance_and_lang')} />
             <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
                <MaterialSwitch checked={settings.darkMode} onChange={(val: boolean) => updateSettings({ darkMode: val })} label={t('dark_mode')} icon={Sun} />
                
                <MaterialSwitch 
                    checked={settings.muteSiren} 
                    onChange={(val: boolean) => updateSettings({ muteSiren: val })} 
                    label={t('mute_global_siren')} 
                    description={t('siren_mute_desc')}
                    icon={settings.muteSiren ? VolumeX : Volume2} 
                />

                <div className="py-4 border-t dark:border-gray-700">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 rounded-full bg-primary/10 text-primary"><Globe size={20} /></div>
                        <h3 className="font-bold dark:text-white">{t('language')}</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {languages.map(lang => (
                            <button 
                                key={lang.id} 
                                onClick={() => handleLanguageChange(lang.id)}
                                className={`p-3 rounded-2xl text-xs font-black border-2 transition-all ${settings.language === lang.id ? 'border-primary bg-primary/5 text-primary' : 'border-gray-100 dark:border-gray-700 dark:text-gray-400'}`}
                            >
                                {lang.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="py-4 border-t dark:border-gray-700">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 rounded-full bg-primary/10 text-primary"><Palette size={20} /></div>
                        <h3 className="font-bold dark:text-white">{t('system_theme_color')}</h3>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                        {presetColors.map(color => (
                            <button 
                                key={color.id} 
                                onClick={() => updateSettings({ themeColor: color.id })}
                                className={`h-12 rounded-2xl flex items-center justify-center border-4 transition-all ${settings.themeColor === color.id ? 'border-white dark:border-gray-900 scale-110 shadow-lg' : 'border-transparent opacity-60'}`}
                                style={{ backgroundColor: color.value }}
                                title={color.name}
                            >
                                {settings.themeColor === color.id && <Check size={20} className="text-white" />}
                            </button>
                        ))}
                    </div>
                </div>
             </div>
        </section>

        <section>
             <SectionHeader title={t('my_profile_settings')} />
             <form onSubmit={handleProfileUpdate} className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('full_name')}</label>
                        <div className="relative">
                            <input type="text" value={profileData.name} onChange={(e) => setProfileData({...profileData, name: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-primary pl-10" />
                            <UserIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('username')}</label>
                        <div className="relative">
                            <input type="text" value={profileData.username} onChange={(e) => setProfileData({...profileData, username: e.target.value})} className="w-full p-3 bg-gray-50 dark:bg-gray-700 border rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-primary pl-10" />
                            <Globe className="absolute left-3 top-3 text-gray-400" size={18} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">دولة العمل (للتمركز على الخريطة)</label>
                        <div className="relative">
                            <select 
                                value={profileData.country} 
                                onChange={(e) => setProfileData({...profileData, country: e.target.value})}
                                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-primary pl-10 font-bold"
                            >
                                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <MapPin className="absolute left-3 top-3 text-gray-400" size={18} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">{t('password')}</label>
                        <div className="relative">
                            <input 
                                type={showPassword ? "text" : "password"} 
                                value={profileData.password} 
                                onChange={(e) => setProfileData({...profileData, password: e.target.value})} 
                                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-primary pl-10 pr-10" 
                            />
                            <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                            <button 
                                type="button" 
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-gray-400 hover:text-primary transition-colors"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                </div>
                <Button type="submit" disabled={isSaving} fullWidth className="h-12 text-base font-bold">
                    {isSaving ? <Loader2 className="animate-spin mx-auto" /> : t('save')}
                </Button>
             </form>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
