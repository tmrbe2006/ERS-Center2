
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, AlertTriangle, User, MapPin, ChevronRight, X, Trash2, CheckSquare, Square, CheckCircle2 } from 'lucide-react';
import { UserRole } from '../types';
import { db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { ConfirmModal } from '../components/Modal';

const ActiveAlerts = () => {
  const { activeEmergencies, user, logAdminAction } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  const filteredEmergencies = activeEmergencies.filter(e => {
    const query = search.toLowerCase();
    const matchesSearch = 
      e.typeName.toLowerCase().includes(query) ||
      e.locationName.toLowerCase().includes(query) ||
      e.creatorName.toLowerCase().includes(query);
    return matchesSearch;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredEmergencies.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredEmergencies.map(e => e.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, 'emergencies', id));
      });
      await batch.commit();
      await logAdminAction('BULK_DELETE_ALERTS', `تم حذف ${selectedIds.length} بلاغ نشط جماعياً`);
      setSelectedIds([]);
      setIsDeleteModalOpen(false);
    } catch (e) {
      alert("حدث خطأ أثناء الحذف");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <h2 className="text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2">
            <AlertTriangle className="text-red-500" /> {t('active_alerts')}
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-medium">إدارة ومتابعة حالات الطوارئ القائمة حالياً</p>
        </div>
        
        <div className="relative flex-1 max-w-md group">
           <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-primary">
             <Search size={18} className="text-gray-400" />
           </div>
           <input 
             type="text"
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             placeholder={t('search_placeholder')}
             className="w-full pl-12 pr-10 py-3 bg-gray-50 dark:bg-gray-700/50 border-none rounded-2xl focus:ring-2 focus:ring-primary dark:text-white transition-all shadow-inner font-medium text-sm"
           />
           {search && (
             <button onClick={() => setSearch('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-red-500">
               <X size={16} />
             </button>
           )}
        </div>

        <Button variant="outline" onClick={() => navigate('/')} className="rounded-2xl px-6">
          {t('back')}
        </Button>
      </div>

      {isAdmin && filteredEmergencies.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-primary/5 rounded-2xl border border-primary/10">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-black text-primary">
                  {selectedIds.length === filteredEmergencies.length ? <CheckSquare size={18}/> : <Square size={18}/>}
                  تحديد الكل ({filteredEmergencies.length})
              </button>
              <AnimatePresence>
                  {selectedIds.length > 0 && (
                      <motion.button 
                        initial={{ scale: 0.8, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }} 
                        exit={{ scale: 0.8, opacity: 0 }}
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg shadow-red-500/20"
                      >
                          <Trash2 size={14}/> حذف المحدد ({selectedIds.length})
                      </motion.button>
                  )}
              </AnimatePresence>
          </div>
      )}

      <div className="grid gap-4 min-h-[400px]">
        <AnimatePresence mode="popLayout">
          {filteredEmergencies.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-700">
              <Search size={48} className="text-gray-200 mb-4" />
              <p className="text-lg font-bold text-gray-400">{t('no_active_alerts')}</p>
            </motion.div>
          ) : (
            filteredEmergencies.map((e) => {
              const diffMs = now - e.createdAt;
              const isOverdue = diffMs > 15 * 60 * 1000; 
              const isEscalated = e.escalated || isOverdue;
              const m = Math.floor(diffMs / 60000);
              const s = Math.floor((diffMs % 60000) / 1000);
              const elapsedStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
              const isSelected = selectedIds.includes(e.id);

              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`group relative bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border-l-8 transition-all flex items-center gap-4 ${isSelected ? 'ring-2 ring-primary' : ''} ${isEscalated ? 'border-red-600' : 'border-red-500'}`}
                >
                  {isAdmin && (
                      <button onClick={(event) => { event.stopPropagation(); toggleSelect(e.id); }} className={`shrink-0 transition-colors ${isSelected ? 'text-primary' : 'text-gray-300 hover:text-gray-400'}`}>
                          {isSelected ? <CheckCircle2 size={24}/> : <Square size={24}/>}
                      </button>
                  )}
                  
                  <div className="flex-1 cursor-pointer" onClick={() => navigate(`/alarm/${e.id}`)}>
                    <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-black text-gray-900 dark:text-white">{e.typeName}</h3>
                            {isEscalated && <span className="bg-red-600 text-white text-[9px] px-2 py-0.5 rounded-full font-black animate-pulse">{t('escalated')}</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5 font-bold text-gray-700 dark:text-gray-300"><MapPin size={14} className="text-red-500" /> {e.locationName}</span>
                            <span className="flex items-center gap-1.5"><User size={14} /> {e.creatorName}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <div className={`px-4 py-1 rounded-xl font-mono font-bold text-sm ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{elapsedStr}</div>
                            <ChevronRight size={20} className="text-gray-300 group-hover:text-primary transition-colors rtl:rotate-180" />
                        </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      <ConfirmModal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        onConfirm={handleBulkDelete}
        isDeleting={isDeleting}
        title="تأكيد الحذف الجماعي"
        message={`هل أنت متأكد من حذف ${selectedIds.length} بلاغ نشط؟ سيؤدي هذا لإزالة البلاغات من النظام تماماً.`}
      />
    </div>
  );
};

export default ActiveAlerts;
