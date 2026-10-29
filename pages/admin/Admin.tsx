
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { 
  Briefcase, Users, Shield, Map, FileText, ArrowLeft, History, 
  ClipboardList, Key, ShieldAlert, Activity, Radio, 
  Download, Upload, Database, Loader2, CheckCircle, AlertCircle, 
  Building2, BarChart3, RotateCcw, ListChecks, Bot, MessageCircleWarning,
  LineChart, FileWarning, Crown, Globe
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, onSnapshot } from 'firebase/firestore';

const Admin = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logAdminAction } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [opStatus, setOpStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [dbCounts, setDbCounts] = useState<Record<string, number>>({});

  // تحديد نوع الصلاحية بدقة
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  useEffect(() => {
    if (!isAdmin) return;
    const collections = ['users', 'emergencies', 'locations', 'emergency_types', 'job_titles'];
    const unsubscribes = collections.map(col => 
      onSnapshot(collection(db, col), (snap) => {
        setDbCounts(prev => ({ ...prev, [col]: snap.size }));
      })
    );
    return () => unsubscribes.forEach(unsub => unsub());
  }, [isAdmin]);

  const handleBackup = async () => {
      setIsBackingUp(true);
      try {
          const collections = ['users', 'emergencies', 'locations', 'emergency_types', 'job_titles', 'admin_logs', 'login_logs', 'private_messages', 'system'];
          const backupData: any = {};
          for (const colName of collections) {
              const snap = await getDocs(collection(db, colName));
              backupData[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
          const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ERS_System_Full_Backup_${new Date().toISOString().split('T')[0]}.json`;
          link.click();
          setOpStatus({ type: 'success', msg: t('db_initialized_success') });
      } catch (e) { 
          setOpStatus({ type: 'error', msg: 'Backup failed' }); 
      } finally { 
          setIsBackingUp(false); 
      }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !window.confirm(t('confirm_delete'))) return;
      setIsRestoring(true);
      setOpStatus(null);
      try {
          const text = await file.text();
          const data = JSON.parse(text);
          let batch = writeBatch(db);
          let count = 0;
          for (const colName in data) {
              const items = data[colName];
              if (!Array.isArray(items)) continue;
              for (const item of items) {
                  const { id, ...body } = item;
                  if (!id) continue;
                  batch.set(doc(db, colName, String(id)), body, { merge: true });
                  count++;
                  if (count >= 450) { await batch.commit(); batch = writeBatch(db); count = 0; }
              }
          }
          if (count > 0) await batch.commit();
          setOpStatus({ type: 'success', msg: t('db_initialized_success') });
          await logAdminAction('RESTORE_DB', 'Database restored');
      } catch (err: any) {
          setOpStatus({ type: 'error', msg: `Error: ${err.message}` });
      } finally {
          setIsRestoring(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  if (!isAdmin) return null;

  // الأدوات القياسية المتاحة لجميع المشرفين (Admin + Super Admin)
  const standardAdminActions = [
    { label: 'مراقبة الأجهزة والخريطة العالمية', icon: <Globe />, path: '/admin/devices', highlight: true },
    { label: t('strategic_analysis'), icon: <BarChart3 />, path: '/admin/analytics', highlight: true },
    { label: t('ai_reports'), icon: <Bot />, path: '/ai-reports', highlight: true },
    { label: t('user_statistics'), icon: <LineChart />, path: '/admin/analytics', highlight: true },
    { label: t('user_complaints'), icon: <MessageCircleWarning />, path: '/admin/reports' },
    { label: t('site_complaints'), icon: <FileWarning />, path: '/admin/reports' },
    { label: t('emergency_type'), icon: <Shield />, path: '/admin/types' },
    { label: t('locations'), icon: <Map />, path: '/admin/locations' },
    { label: t('status_reports'), icon: <ClipboardList />, path: '/admin/reports' }, 
    { label: t('roles'), icon: <Users />, path: '/admin/roles' },
    { label: t('job_titles'), icon: <Briefcase />, path: '/admin/jobs' },
    { label: t('login_logs'), icon: <History />, path: '/admin/login-logs' },
    { label: t('company_context'), icon: <Building2 />, path: '/admin/facility' },
    { label: t('simulated_emergencies'), icon: <ShieldAlert />, path: '/admin/simulator' }
  ];

  return (
    <div className="space-y-10 pb-20 px-4">
      <div className="flex justify-between items-center border-b pb-4 dark:border-gray-700">
        <div>
            <h2 className="text-3xl font-black text-gray-800 dark:text-white uppercase tracking-tighter">{t('admin_panel')}</h2>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{isSuperAdmin ? 'Full Authority Access (Master)' : 'Standard Administrative Access'}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl"><ArrowLeft size={16} /> {t('back')}</Button>
      </div>

      {/* أدوات السوبر أدمن (مخفية تماماً عن الـ Admin العادي) */}
      {isSuperAdmin && (
        <motion.section 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
            <div className="flex items-center gap-3">
                <Crown className="text-amber-500" size={24} />
                <h3 className="text-xl font-black text-amber-600 dark:text-amber-400 uppercase tracking-tighter">صلاحيات المدير الخارق (Super Admin Only)</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <DashboardCard 
                    item={{ label: t('api_key_settings'), icon: <Key />, path: '/admin/api-key', highlight: true }} 
                    onClick={() => navigate('/admin/api-key')} 
                    isSuper 
                />
            </div>
        </motion.section>
      )}

      {/* الأدوات القياسية */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
            <Shield className="text-blue-500" size={24} />
            <h3 className="text-xl font-black text-gray-800 dark:text-white uppercase tracking-tighter">أدوات الإدارة القياسية</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {standardAdminActions.map((item, idx) => (
            <DashboardCard key={idx} item={item} onClick={() => navigate(item.path)} />
            ))}
        </div>
      </section>

      {/* أدوات قاعدة البيانات */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-10">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border dark:border-gray-700 relative overflow-hidden">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-primary/10 text-primary rounded-2xl"><Database size={24}/></div>
                <div><h3 className="font-black dark:text-white">{t('db_tools')}</h3><p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Backup & Secure Restore</p></div>
            </div>
            <div className="flex flex-wrap gap-3">
                <Button variant="primary" onClick={handleBackup} disabled={isBackingUp} className="flex-1 rounded-2xl py-4">{isBackingUp ? <Loader2 className="animate-spin" /> : <Download />} Backup</Button>
                <input type="file" ref={fileInputRef} onChange={handleRestore} className="hidden" accept=".json" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isRestoring} className="flex-1 rounded-2xl py-4">{isRestoring ? <Loader2 className="animate-spin" /> : <Upload />} Restore</Button>
            </div>
            <AnimatePresence>{opStatus && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className={`mt-4 p-4 rounded-xl flex items-center gap-2 text-xs font-black ${opStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{opStatus.type === 'success' ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}{opStatus.msg}</motion.div>}</AnimatePresence>
          </motion.div>

          <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-[2.5rem] border dark:border-gray-800 flex flex-col justify-center">
              <h4 className="text-[10px] font-black text-gray-400 uppercase mb-4 flex items-center gap-2 tracking-widest"><ListChecks size={14}/> {t('site_statistics')}</h4>
              <div className="space-y-3">
                  <DbCountItem label={t('users')} count={dbCounts.users || 0} icon={<Users size={12}/>} />
                  <DbCountItem label={t('emergencies')} count={dbCounts.emergencies || 0} icon={<ShieldAlert size={12}/>} />
                  <DbCountItem label={t('locations')} count={dbCounts.locations || 0} icon={<Map size={12}/>} />
              </div>
          </div>
      </div>
    </div>
  );
};

const DashboardCard = ({ item, onClick, isSuper = false }: any) => (
    <motion.div 
      whileHover={{ scale: 1.02 }} 
      className={`p-8 rounded-[2.5rem] shadow-md cursor-pointer flex flex-col items-center gap-4 text-center group border transition-all ${isSuper ? 'bg-amber-50/30 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30' : (item.highlight ? 'bg-primary/5 border-primary' : 'bg-white dark:bg-gray-800 dark:border-gray-700')}`} 
      onClick={onClick}
    >
      <div className={`p-5 rounded-3xl ${isSuper ? 'bg-amber-500 text-white shadow-amber-500/30' : (item.highlight ? 'bg-primary text-white shadow-primary/30' : 'bg-gray-50 dark:bg-gray-900 text-primary group-hover:bg-primary group-hover:text-white group-hover:shadow-lg')}`}>{React.cloneElement(item.icon as any, { size: 32 })}</div>
      <h3 className={`text-lg font-black ${isSuper ? 'text-amber-800 dark:text-amber-200' : 'text-gray-800 dark:text-gray-200'}`}>{item.label}</h3>
    </motion.div>
);

const DbCountItem = ({ label, count, icon }: any) => (
    <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 font-bold text-[11px]">{icon} {label}</div>
        <div className="font-black text-primary text-sm">{count}</div>
    </div>
);

export default Admin;
