
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { LoginLog } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AdminTable, Column } from '../../components/AdminTable';
import { ArrowLeft, History, User, RefreshCw, Smartphone, Monitor } from 'lucide-react';
import { Button } from '../../components/Button';
import { useApp } from '../../context/AppContext';

const LoginLogs = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { users } = useApp();
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchName, setSearchName] = useState('');
  const [startDate, setStartDate] = useState('');

  useEffect(() => {
    // جلب البيانات لكافة الأجهزة
    const q = query(collection(db, 'login_logs'), orderBy('loginTime', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LoginLog[];
      setLogs(data);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching logs:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatDuration = (login: number, logout?: number) => {
      if (!logout) return <span className="text-green-500 font-bold text-xs animate-pulse">متصل الآن</span>;
      const diffMs = logout - login;
      if (diffMs < 0) return '-';
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      return `${hours}س ${minutes}د`;
  };

  const filteredLogs = useMemo(() => {
      return logs.filter(log => {
          if (searchName && !log.userName.toLowerCase().includes(searchName.toLowerCase())) return false;
          
          const logDate = new Date(log.loginTime).setHours(0,0,0,0);
          if (startDate) {
              const start = new Date(startDate).setHours(0,0,0,0);
              if (logDate < start) return false;
          }
          return true;
      });
  }, [logs, searchName, startDate]);

  const columns: Column<LoginLog>[] = [
    {
      header: t('username'),
      accessor: (log) => (
        <div className="flex flex-col">
            <span className="font-bold text-gray-800 dark:text-gray-200">{log.userName}</span>
            {log.device && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                {log.device.toLowerCase().includes('mobile') ? <Smartphone size={10}/> : <Monitor size={10}/>}
                {log.device}
              </span>
            )}
        </div>
      )
    },
    {
        header: t('date'),
        accessor: (log) => new Date(log.loginTime).toLocaleDateString()
    },
    {
        header: "توقيت الدخول",
        accessor: (log) => (
            <span className="text-blue-600 font-mono text-xs bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg font-black">
                {new Date(log.loginTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
        )
    },
    {
        header: t('duration'),
        accessor: (log) => formatDuration(log.loginTime, log.logoutTime)
    }
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between border-b pb-4 dark:border-gray-700">
        <h2 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2 uppercase tracking-tighter">
          <History size={24} className="text-primary" /> {t('login_logs')}
        </h2>
        <Button variant="outline" onClick={() => navigate('/admin')} className="rounded-xl">
          <ArrowLeft size={16} className="mr-2 rtl:rotate-180" /> {t('back')}
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
              <User size={16} className="absolute top-3.5 left-4 text-gray-400" />
              <input 
                type="text" 
                placeholder={t('search_by_username')} 
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border-none rounded-2xl dark:text-white text-sm font-bold shadow-inner"
              />
          </div>
          <div className="grid grid-cols-2 gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-2 text-[10px] font-bold dark:text-white" />
              <Button variant="secondary" onClick={() => { setSearchName(''); setStartDate(''); }} className="rounded-xl py-2 text-[10px] font-black">
                  <RefreshCw size={12} className="mr-1" /> إعادة تعيين
              </Button>
          </div>
      </div>

      <div className="overflow-x-auto">
        <AdminTable 
            columns={columns}
            data={filteredLogs}
            isLoading={loading}
            showActions={false}
            enableSelection={false}
        />
      </div>
    </div>
  );
};

export default LoginLogs;
