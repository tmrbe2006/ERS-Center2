
import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { User, UserRole } from '../../types';
import { useTranslation } from 'react-i18next';
import { AdminTable, Column } from '../../components/AdminTable';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Smartphone, MapPin, Monitor, Tablet, WifiOff, Globe } from 'lucide-react';
import { Button } from '../../components/Button';

const ActiveUsersReport = () => {
    const { users, user: loggedInUser } = useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const isSuperAdmin = loggedInUser?.role === UserRole.SUPER_ADMIN;

    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            if (!isSuperAdmin && u.role === UserRole.SUPER_ADMIN) return false;
            const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 u.username.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSearch;
        }).sort((a, b) => (b.lastHeartbeat || 0) - (a.lastHeartbeat || 0));
    }, [users, searchQuery, isSuperAdmin]);

    const getDeviceIcon = (type?: string) => {
        switch(type) {
            case 'mobile': return <Smartphone size={16} className="text-blue-500" />;
            case 'tablet': return <Tablet size={16} className="text-purple-500" />;
            default: return <Monitor size={16} className="text-gray-500" />;
        }
    };

    const columns: Column<User>[] = [
        {
            header: t('full_name'),
            accessor: (user) => {
                const diff = now - (user.lastHeartbeat || 0);
                const isOnline = diff < 30000;
                return (
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 shadow-sm ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                        <div>
                            <div className="font-black text-gray-900 dark:text-white text-xs">{user.name}</div>
                            <div className="text-[9px] text-gray-400 uppercase tracking-widest">@{user.username}</div>
                        </div>
                    </div>
                );
            }
        },
        {
            header: "الجهاز",
            accessor: (user) => (
                <div className="flex items-center gap-1.5">
                    {getDeviceIcon(user.deviceInfo?.type)}
                    <span className="capitalize text-[10px] font-bold text-gray-500">{user.deviceInfo?.type || 'Desktop'}</span>
                </div>
            )
        },
        {
            header: "الموقع (IP)",
            accessor: (user) => (
                <div className="flex flex-col">
                    <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter">
                        <Globe size={12}/> {user.country || 'Unknown'}
                    </div>
                    <span className="text-[9px] font-mono text-gray-400">{user.ip || '0.0.0.0'}</span>
                </div>
            )
        },
        {
            header: t('location'),
            accessor: (user) => (
                user.lastLocation && user.lastLocation.lat !== 0 ? (
                    <a href={`https://www.google.com/maps?q=${user.lastLocation.lat},${user.lastLocation.lng}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline text-[10px] bg-primary/10 px-2 py-1 rounded-lg font-black uppercase"
                    >
                        <MapPin size={12} /> View Map
                    </a>
                ) : <span className="text-gray-300 text-[10px] italic flex items-center gap-1"><WifiOff size={12}/> Offline GPS</span>
            )
        }
    ];

    return (
        <div className="space-y-6 pb-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b pb-4 dark:border-gray-700">
                <h2 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2 uppercase tracking-tighter">
                     <Activity className="text-green-500" /> {t('active_users_report')}
                </h2>
                <div className="flex gap-2 w-full md:w-auto">
                     <Button variant="outline" onClick={() => navigate('/admin')} className="rounded-xl flex-1 md:flex-none">
                        <ArrowLeft size={16} className="mr-2 rtl:rotate-180" /> {t('back')}
                    </Button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-[2rem] shadow-sm border border-gray-100">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث عن اسم الناشط..."
                    className="w-full pl-4 pr-4 py-3 text-sm bg-gray-50 dark:bg-gray-700 border-none rounded-2xl dark:text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner"
                />
            </div>

            <AdminTable 
                columns={columns} 
                data={filteredUsers} 
                isLoading={false} 
                showActions={false} 
                enableSelection={false} 
            />
        </div>
    );
};

export default ActiveUsersReport;
