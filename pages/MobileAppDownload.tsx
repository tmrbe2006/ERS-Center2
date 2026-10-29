
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Smartphone, Tablet, Download, Settings, Save, Check, ExternalLink } from 'lucide-react';
import { UserRole } from '../types';
import { motion } from 'framer-motion';

const MobileAppDownload = () => {
  const { user, appLinks, updateAppLinks } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [androidLink, setAndroidLink] = useState(appLinks.androidUrl || '');
  const [iosLink, setIosLink] = useState(appLinks.iosUrl || '');
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    await updateAppLinks({
      androidUrl: androidLink,
      iosUrl: iosLink,
      lastUpdated: Date.now()
    });
    setIsEditing(false);
    setMessage(t('links_updated'));
    setTimeout(() => setMessage(''), 3000);
  };

  const handleDownload = (url: string) => {
    if (!url) return;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/')} className="!p-2 rounded-full h-10 w-10 flex items-center justify-center">
            <ArrowLeft size={20} className="rtl:rotate-180" />
        </Button>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('mobile_app')}</h1>
            <p className="text-gray-500 dark:text-gray-400">{t('mobile_app_desc')}</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => navigate('/mobile-diagnostics')}
            className="flex items-center gap-2 border-primary text-primary hover:bg-primary/10 self-start sm:self-auto"
          >
            <Smartphone size={18} /> تشخيص واختبار الجهاز
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Android Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-t-4 border-green-500 p-8 flex flex-col items-center text-center gap-6"
          >
              <div className="bg-green-100 dark:bg-green-900/30 p-6 rounded-full text-green-600 dark:text-green-400">
                  <Smartphone size={64} />
              </div>
              <div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Android</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Compatible with Android 8.0+</p>
              </div>
              <Button 
                onClick={() => handleDownload(appLinks.androidUrl)}
                disabled={!appLinks.androidUrl}
                className="w-full py-4 text-lg bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2"
              >
                  <Download size={24} /> {t('download_android')}
              </Button>
              {!appLinks.androidUrl && <p className="text-xs text-red-500">Link not available yet</p>}
          </motion.div>

          {/* iOS Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-t-4 border-blue-500 p-8 flex flex-col items-center text-center gap-6"
          >
              <div className="bg-blue-100 dark:bg-blue-900/30 p-6 rounded-full text-blue-600 dark:text-blue-400">
                  <Tablet size={64} />
              </div>
              <div>
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">iPhone (iOS)</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Compatible with iOS 14.0+</p>
              </div>
              <Button 
                onClick={() => handleDownload(appLinks.iosUrl)}
                disabled={!appLinks.iosUrl}
                className="w-full py-4 text-lg bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                  <Download size={24} /> {t('download_ios')}
              </Button>
              {!appLinks.iosUrl && <p className="text-xs text-red-500">Link not available yet</p>}
          </motion.div>
      </div>

      {/* Admin Panel for Uploading Links */}
      {isAdmin && (
        <div className="mt-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 border border-dashed border-gray-300 dark:border-gray-600">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Settings className="text-primary" /> {t('admin_upload_links')}
                </h3>
                {!isEditing ? (
                    <Button variant="secondary" onClick={() => setIsEditing(true)}>Edit Links</Button>
                ) : (
                    <div className="flex gap-2">
                         <Button variant="outline" onClick={() => setIsEditing(false)}>{t('cancel')}</Button>
                         <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                             <Save size={16} className="mr-2" /> {t('save')}
                         </Button>
                    </div>
                )}
            </div>

            {message && (
                <div className="mb-4 bg-green-100 text-green-800 p-3 rounded flex items-center gap-2">
                    <Check size={16} /> {message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {t('android_link')}
                    </label>
                    <div className="relative">
                        <Smartphone size={18} className="absolute top-3 left-3 text-gray-400 rtl:right-3 rtl:left-auto" />
                        <input 
                            type="text"
                            disabled={!isEditing}
                            value={isEditing ? androidLink : appLinks.androidUrl}
                            onChange={(e) => setAndroidLink(e.target.value)}
                            placeholder="https://..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-500"
                        />
                        {!isEditing && appLinks.androidUrl && (
                             <a href={appLinks.androidUrl} target="_blank" rel="noreferrer" className="absolute top-2.5 right-3 text-gray-400 hover:text-blue-500 rtl:left-3 rtl:right-auto">
                                 <ExternalLink size={16} />
                             </a>
                        )}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {t('ios_link')}
                    </label>
                    <div className="relative">
                        <Tablet size={18} className="absolute top-3 left-3 text-gray-400 rtl:right-3 rtl:left-auto" />
                        <input 
                            type="text"
                            disabled={!isEditing}
                            value={isEditing ? iosLink : appLinks.iosUrl}
                            onChange={(e) => setIosLink(e.target.value)}
                            placeholder="https://..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-500"
                        />
                         {!isEditing && appLinks.iosUrl && (
                             <a href={appLinks.iosUrl} target="_blank" rel="noreferrer" className="absolute top-2.5 right-3 text-gray-400 hover:text-blue-500 rtl:left-3 rtl:right-auto">
                                 <ExternalLink size={16} />
                             </a>
                        )}
                    </div>
                </div>
            </div>
            {isEditing && (
                 <p className="mt-4 text-xs text-gray-500">
                    Note: Paste the direct download link (e.g., Google Drive, Dropbox, or App Store URL).
                 </p>
            )}
        </div>
      )}
    </div>
  );
};

export default MobileAppDownload;
