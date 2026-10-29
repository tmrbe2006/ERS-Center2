
import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Briefcase, Award, TrendingUp, MapPin, PieChart, Activity, CheckCircle, List } from 'lucide-react';
import { Button } from '../components/Button';
import { motion } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ScriptableContext
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PersonalReport = () => {
  const { user, emergencies, settings } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 1. Filter Data for Current User
  // Cases where user is CREATOR or RESPONDER
  const myCases = useMemo(() => {
    if (!user) return [];
    return emergencies.filter(e => 
      e.createdBy === user.id || 
      (e.responders && e.responders.includes(user.name))
    );
  }, [emergencies, user]);

  const createdCount = myCases.filter(e => e.createdBy === user?.id).length;
  const respondedCount = myCases.filter(e => e.responders?.includes(user?.name || '')).length;
  const totalInvolved = myCases.length;
  
  // Contribution Rate (approximate against total system emergencies)
  const contributionRate = emergencies.length > 0 ? Math.round((totalInvolved / emergencies.length) * 100) : 0;

  // 2. Prepare Charts Data
  
  // A. Timeline (Last 7 Days Activity)
  const timelineData = useMemo(() => {
    const days: Record<string, number> = {};
    const today = new Date();
    for(let i=6; i>=0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days[d.toLocaleDateString()] = 0;
    }

    myCases.forEach(e => {
      const dateStr = new Date(e.createdAt).toLocaleDateString();
      if (days[dateStr] !== undefined) {
        days[dateStr]++;
      }
    });

    return {
      labels: Object.keys(days).map(d => d.split('/').slice(0,2).join('/')),
      datasets: [
        {
          label: 'My Activity',
          data: Object.values(days),
          fill: true,
          backgroundColor: (context: ScriptableContext<"line">) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(124, 58, 237, 0.5)'); // Purple
            gradient.addColorStop(1, 'rgba(124, 58, 237, 0.0)');
            return gradient;
          },
          borderColor: '#7c3aed',
          tension: 0.4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#7c3aed',
          pointRadius: 5,
        }
      ]
    };
  }, [myCases]);

  // B. Emergency Types (Doughnut)
  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    myCases.forEach(e => {
      counts[e.typeName] = (counts[e.typeName] || 0) + 1;
    });
    
    return {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: [
          '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'
        ],
        borderWidth: 2,
        borderColor: settings.darkMode ? '#1f2937' : '#fff'
      }]
    };
  }, [myCases, settings.darkMode]);

  // C. Top Locations (Bar)
  const locationData = useMemo(() => {
    const counts: Record<string, number> = {};
    myCases.forEach(e => {
      counts[e.locationName] = (counts[e.locationName] || 0) + 1;
    });
    
    // Sort and take top 5
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);

    return {
      labels: sorted.map(i => i[0]),
      datasets: [{
        label: 'Visits',
        data: sorted.map(i => i[1]),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderRadius: 6,
      }]
    };
  }, [myCases]);

  // Chart Options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: settings.darkMode ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)',
        titleColor: settings.darkMode ? '#fff' : '#000',
        bodyColor: settings.darkMode ? '#fff' : '#000',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        usePointStyle: true,
      }
    },
    scales: {
        x: { 
            grid: { display: false },
            ticks: { color: settings.darkMode ? '#9ca3af' : '#6b7280', font: { family: 'Cairo' } }
        },
        y: { 
            grid: { color: settings.darkMode ? '#374151' : '#f3f4f6', borderDash: [5, 5] },
            ticks: { color: settings.darkMode ? '#9ca3af' : '#6b7280', stepSize: 1, font: { family: 'Cairo' } },
            beginAtZero: true
        }
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header Profile Section - Optimized for Mobile Vertical Layout */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-6 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
           <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0">
             {user?.name.charAt(0).toUpperCase()}
           </div>
           <div className="flex-1 w-full">
             <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">{t('personal_report')}</h1>
             
             {/* User Details Stack - Vertical on Mobile, Horizontal on Desktop */}
             <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                    <User size={14} className="text-primary" /> 
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{user?.name}</span>
                </div>
                
                <span className="hidden sm:inline text-gray-300">|</span>
                
                <div className="flex items-center gap-2">
                    <Briefcase size={14} /> 
                    <span>{user?.jobTitle || 'N/A'}</span>
                </div>

                <span className="hidden sm:inline text-gray-300">|</span>

                <div className="self-start sm:self-auto">
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full dark:bg-blue-900/30 dark:text-blue-200 font-medium">
                        {user?.role}
                    </span>
                </div>
             </div>
           </div>
        </div>
        <Button variant="outline" onClick={() => navigate('/')} className="w-full md:w-auto justify-center">
          <ArrowLeft size={16} className="mr-2 rtl:rotate-180" /> {t('back_to_dashboard')}
        </Button>
      </div>

      {/* Summary Cards - Grid on larger screens, Stack on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border-l-4 border-blue-500">
           <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm font-medium">{t('total_involved')}</p>
                <h3 className="text-3xl font-bold text-gray-800 dark:text-white mt-1">{totalInvolved}</h3>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl">
                <Activity size={24} />
              </div>
           </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border-l-4 border-green-500">
           <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm font-medium">{t('my_responses')}</p>
                <h3 className="text-3xl font-bold text-gray-800 dark:text-white mt-1">{respondedCount}</h3>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-xl">
                <CheckCircle size={24} />
              </div>
           </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border-l-4 border-purple-500">
           <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm font-medium">{t('my_opened_cases')}</p>
                <h3 className="text-3xl font-bold text-gray-800 dark:text-white mt-1">{createdCount}</h3>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-xl">
                <List size={24} />
              </div>
           </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border-l-4 border-orange-500">
           <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm font-medium">{t('contribution_rate')}</p>
                <h3 className="text-3xl font-bold text-gray-800 dark:text-white mt-1">{contributionRate}%</h3>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-xl">
                <Award size={24} />
              </div>
           </div>
        </motion.div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         
         {/* Timeline */}
         <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
               <TrendingUp className="text-purple-500" /> {t('activity_timeline')}
            </h3>
            <div className="h-[300px]">
               {myCases.length > 0 ? (
                  <Line data={timelineData} options={chartOptions} />
               ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl">
                    No activity recorded yet
                  </div>
               )}
            </div>
         </div>

         {/* Distribution */}
         <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
               <PieChart className="text-blue-500" /> {t('participation_by_type')}
            </h3>
            <div className="h-[300px] flex items-center justify-center relative">
               {myCases.length > 0 ? (
                  <Doughnut data={typeData} options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: { legend: { position: 'bottom', labels: { color: settings.darkMode ? '#fff' : '#333' } } }
                  }} />
               ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl">
                    No data
                  </div>
               )}
            </div>
         </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Locations */}
         <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
               <MapPin className="text-red-500" /> {t('top_locations')}
            </h3>
            <div className="h-[250px]">
                {myCases.length > 0 ? (
                    <Bar data={locationData} options={chartOptions} />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl">
                        No locations visited
                    </div>
                )}
            </div>
         </div>

         {/* Recent List - Vertical items on mobile */}
         <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col">
            <h3 className="font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
               <List className="text-green-500" /> {t('recent_activity')}
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 max-h-[250px]">
               {myCases.length > 0 ? (
                 myCases.slice(0, 5).map(e => (
                   <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors gap-3">
                      <div className="flex items-center gap-3">
                         <div className={`w-2 h-10 rounded-full ${e.status === 'active' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                         <div>
                            <div className="font-bold text-gray-800 dark:text-white">{e.typeName}</div>
                            <div className="text-xs text-gray-500">{new Date(e.createdAt).toLocaleDateString()}</div>
                         </div>
                      </div>
                      <div className="flex flex-row sm:flex-col justify-between items-center sm:items-end w-full sm:w-auto pl-5 sm:pl-0 border-t sm:border-0 pt-2 sm:pt-0 border-gray-200 dark:border-gray-700">
                         <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{e.locationName}</div>
                         <div className="text-xs text-gray-400">
                             {e.createdBy === user?.id ? 'Creator' : 'Responder'}
                         </div>
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="text-center text-gray-400 py-10">No recent cases</div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default PersonalReport;
