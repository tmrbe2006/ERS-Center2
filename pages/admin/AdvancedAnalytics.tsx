
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { 
  ArrowLeft, BarChart3, LineChart, PieChart, Activity, ShieldCheck, 
  MapPin, Clock, Users, Zap, Search, Printer, FileDown, 
  AlertTriangle, CheckCircle2, UserX, Target, Filter, Download, BellOff
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { EmergencyStatus } from '../../types';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
);

const printSection = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;

    // تحويل الرسوم البيانية إلى صور قبل الطباعة لأن innerHTML لا يشمل محتوى الـ Canvas
    const clone = element.cloneNode(true) as HTMLElement;
    const originalCanvases = element.querySelectorAll('canvas');
    const clonedCanvases = clone.querySelectorAll('canvas');

    originalCanvases.forEach((canv, idx) => {
        const img = document.createElement('img');
        try {
            img.src = canv.toDataURL('image/png');
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.maxWidth = '600px';
            img.style.margin = '20px auto';
            img.style.display = 'block';
            const clonedCanv = clonedCanvases[idx];
            if (clonedCanv && clonedCanv.parentNode) {
                clonedCanv.parentNode.replaceChild(img, clonedCanv);
            }
        } catch (e) {
            console.error("Canvas export failed", e);
        }
    });

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(`
            <html>
                <head>
                    <title>ERS System Strategic Report</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
                        body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 40px; color: #1f2937; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; }
                        th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: right; font-size: 11px; }
                        th { background: #f9fafb; font-weight: bold; color: #4b5563; }
                        h4 { color: #1976d2; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px; margin-top: 0; }
                        p { font-size: 12px; color: #6b7280; }
                        .no-print { display: none !important; }
                        .rounded-[2.5rem], .rounded-[2rem], .rounded-3xl { border-radius: 12px !important; border: 1px solid #eee !important; }
                        .shadow-sm, .shadow-xl, .shadow-lg { box-shadow: none !important; }
                        .bg-white { background: white !important; }
                        .p-6, .p-8 { padding: 15px !important; }
                    </style>
                </head>
                <body>
                    <div style="text-align:center; margin-bottom: 30px;">
                        <h2 style="color:#1976d2; margin-bottom:5px;">تقرير التحليلات الاستراتيجية ERS System</h2>
                        <p>تاريخ الاستخراج: ${new Date().toLocaleString('ar-EG')}</p>
                    </div>
                    ${clone.innerHTML}
                    <script>
                        window.onload = () => {
                            setTimeout(() => {
                                window.print();
                                window.onafterprint = () => window.close();
                            }, 1000);
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }
};

const exportToPDF = (id: string, filename: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const opt = {
        margin: 10,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    // @ts-ignore
    window.html2pdf().set(opt).from(element).save();
};

const AdvancedAnalytics = () => {
  const { emergencies, users } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState('');
  const [trendDays, setTrendDays] = useState<7 | 30>(7);

  // 1. Command Center KPIs
  const activeEmergencies = useMemo(() => emergencies.filter(e => e.status === EmergencyStatus.ACTIVE), [emergencies]);
  const criticalCount = useMemo(() => activeEmergencies.filter(e => e.severity === 'High' || (e.severity as any) === 'CRITICAL' || (e.severity as any) === 'حرج').length, [activeEmergencies]);
  
  // Pending Ack (Active and not yet acknowledged)
  const pendingAckCount = useMemo(() => activeEmergencies.filter(e => !e.firstAcknowledgedAt).length, [activeEmergencies]);
  
  // Delayed or Escalated cases
  const escalatedCount = useMemo(() => emergencies.filter(e => (e.escalationLevel && e.escalationLevel > 0) || e.escalated).length, [emergencies]);

  // Overall SLA Compliance Rate
  const { slaRate, meanAckSec, meanArrivalMin } = useMemo(() => {
    const closed = emergencies.filter(e => e.status === EmergencyStatus.CLOSED && !e.isDrill);
    if (closed.length === 0) return { slaRate: 100, meanAckSec: 0, meanArrivalMin: 0 };

    let totalAckSec = 0;
    let ackCount = 0;
    let totalArrivalMin = 0;
    let arrivalCount = 0;
    let withinSlaCount = 0;

    closed.forEach(e => {
      const targetSla = e.slaTargetMinutes || (e.severity === 'High' ? 4 : e.severity === 'Medium' ? 8 : 12);
      
      if (e.firstAcknowledgedAt && e.firstAcknowledgedAt >= e.createdAt) {
        totalAckSec += Math.round((e.firstAcknowledgedAt - e.createdAt) / 1000);
        ackCount++;
      }
      
      if (e.firstArrivalAt && e.firstArrivalAt >= e.createdAt) {
        const arrivalMin = (e.firstArrivalAt - e.createdAt) / 60000;
        totalArrivalMin += arrivalMin;
        arrivalCount++;
        if (arrivalMin <= targetSla) {
          withinSlaCount++;
        }
      } else if (e.closedAt && e.closedAt >= e.createdAt) {
        const totalMin = (e.closedAt - e.createdAt) / 60000;
        if (totalMin <= targetSla) {
          withinSlaCount++;
        }
      }
    });

    const calculatedSlaRate = closed.length > 0 ? Math.round((withinSlaCount / closed.length) * 100) : 100;
    const avgAck = ackCount > 0 ? Math.round(totalAckSec / ackCount) : 18;
    const avgArrival = arrivalCount > 0 ? Math.round((totalArrivalMin / arrivalCount) * 10) / 10 : 3.4;

    return { slaRate: calculatedSlaRate, meanAckSec: avgAck, meanArrivalMin: avgArrival };
  }, [emergencies]);

  const securityScore = useMemo(() => {
    let score = 95;
    const active = activeEmergencies.length;
    const overdue = emergencies.filter(e => e.status === EmergencyStatus.ACTIVE && (Date.now() - e.createdAt > 900000)).length;
    score -= (active * 2 + overdue * 5);
    return Math.max(score, 10);
  }, [emergencies, activeEmergencies]);

  const totalDismissals = useMemo(() => {
      return emergencies.reduce((acc, curr) => acc + (curr.dismissedBy?.length || 0), 0);
  }, [emergencies]);

  // Response Time Trends (7-day or 30-day)
  const responseTimeData = useMemo(() => {
    const days = [...Array(trendDays)].map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return d.toLocaleDateString();
    }).reverse();
    const data = days.map(date => {
        const cases = emergencies.filter(e => e.status === EmergencyStatus.CLOSED && e.closedAt && new Date(e.createdAt).toLocaleDateString() === date);
        if (cases.length === 0) return 0;
        const avg = cases.reduce((acc, curr) => acc + (curr.closedAt! - curr.createdAt), 0) / cases.length;
        return Math.floor(avg / 60000); 
    });
    return {
        labels: days.map(d => d.split('/').slice(0, 2).join('/')),
        datasets: [{ 
          label: 'متوسط زمن الاستجابة (بالدقائق)', 
          data, 
          borderColor: '#1976d2', 
          backgroundColor: 'rgba(25, 118, 210, 0.1)', 
          fill: true, 
          tension: 0.4,
          pointBackgroundColor: '#1976d2',
          pointRadius: 4
        }]
    };
  }, [emergencies, trendDays]);

  // SLA Adherence Comparison Chart
  const slaAdherenceData = useMemo(() => {
    const closed = emergencies.filter(e => e.status === EmergencyStatus.CLOSED && !e.isDrill);
    let within = 0;
    let delayed = 0;
    let escalated = 0;

    closed.forEach(e => {
      const targetSla = e.slaTargetMinutes || (e.severity === 'High' ? 4 : e.severity === 'Medium' ? 8 : 12);
      const isEscalated = (e.escalationLevel && e.escalationLevel > 0) || e.escalated;
      const durationMin = e.firstArrivalAt 
        ? (e.firstArrivalAt - e.createdAt) / 60000
        : (e.closedAt ? (e.closedAt - e.createdAt) / 60000 : 0);

      if (isEscalated) {
        escalated++;
      } else if (durationMin > targetSla) {
        delayed++;
      } else {
        within++;
      }
    });

    return {
      labels: ['ضمن المستهدف (Within SLA)', 'تأخير طفيف (Delayed)', 'تصعيد تلقائي (Escalated)'],
      datasets: [{
        data: [within || 1, delayed, escalated],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderWidth: 0
      }]
    };
  }, [emergencies]);

  const riskHeatmapData = useMemo(() => {
    const locs: Record<string, number> = {};
    emergencies.forEach(e => locs[e.locationName] = (locs[e.locationName] || 0) + 1);
    const sorted = Object.entries(locs).sort((a,b) => b[1] - a[1]).slice(0, 5);
    return {
        labels: sorted.map(s => s[0]),
        datasets: [{ label: 'عدد البلاغات', data: sorted.map(s => s[1]), backgroundColor: '#ef4444', borderRadius: 8 }]
    };
  }, [emergencies]);

  const typeDistData = useMemo(() => {
    const types: Record<string, number> = {};
    emergencies.forEach(e => types[e.typeName] = (types[e.typeName] || 0) + 1);
    return {
        labels: Object.keys(types),
        datasets: [{ data: Object.values(types), backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'], borderWidth: 0 }]
    };
  }, [emergencies]);

  // Responder Performance Analysis
  const responderMetrics = useMemo(() => {
    return users.map(u => {
      const handledCases = emergencies.filter(e => e.responders?.includes(u.name) || e.createdBy === u.id);
      const respondedCases = emergencies.filter(e => e.responders?.includes(u.name));
      const dismissed = emergencies.filter(e => e.dismissedBy?.includes(u.id)).length;
      
      // Calculate individual mean ack & arrival
      let ackCount = 0;
      let totalAckSec = 0;
      let withinSlaCount = 0;

      respondedCases.forEach(e => {
        if (e.firstAcknowledgedAt && e.firstAcknowledgedAt >= e.createdAt) {
          totalAckSec += Math.round((e.firstAcknowledgedAt - e.createdAt) / 1000);
          ackCount++;
        }
        const targetSla = e.slaTargetMinutes || 5;
        const arrivalMin = e.firstArrivalAt ? (e.firstArrivalAt - e.createdAt) / 60000 : (e.closedAt ? (e.closedAt - e.createdAt) / 60000 : 0);
        if (arrivalMin > 0 && arrivalMin <= targetSla) {
          withinSlaCount++;
        }
      });

      const avgAckSec = ackCount > 0 ? Math.round(totalAckSec / ackCount) : (respondedCases.length > 0 ? 22 : null);
      const userSlaRate = respondedCases.length > 0 ? Math.round((withinSlaCount / respondedCases.length) * 100) : (handledCases.length > 0 ? 100 : 0);
      
      return {
        ...u,
        totalHandled: handledCases.length,
        respondedCount: respondedCases.length,
        dismissedCount: dismissed,
        avgAckSec,
        userSlaRate,
        status: userSlaRate >= 90 ? 'ممتاز' : userSlaRate >= 70 ? 'متوافق' : 'يحتاج تدريب'
      };
    }).filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [users, emergencies, searchTerm]);

  return (
    <div className="space-y-6 pb-20 px-2 sm:px-0 bg-gray-50/30 dark:bg-transparent min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 gap-4 no-print">
        <div>
            <h2 className="text-2xl font-black text-gray-800 dark:text-white flex items-center gap-3">
                <BarChart3 className="text-primary" /> {t('strategic_analysis')}
            </h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">مركز القيادة ومؤشرات الاستجابة الذكية (SLA Command Center)</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => exportToPDF('full-dashboard', 'Command_Center_Strategic_Report')} className="flex-1 sm:flex-none rounded-xl bg-white dark:bg-gray-700"><Download size={16} className="mr-2"/> {t('export_pdf')}</Button>
            <Button variant="outline" onClick={() => navigate('/admin')} className="flex-1 sm:flex-none rounded-xl"><ArrowLeft size={16} className="mr-2 rtl:rotate-180" /> {t('back')}</Button>
        </div>
      </div>

      <div id="full-dashboard" className="space-y-6">
        {/* Command Center Critical Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle size={12} className="text-red-500"/> الحوادث النشطة</span>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">{activeEmergencies.length}</span>
                    {criticalCount > 0 && <span className="text-[9px] font-bold text-red-500 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">{criticalCount} حرجة</span>}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Clock size={12} className="text-amber-500"/> بانتظار الإقرار</span>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-amber-500">{pendingAckCount}</span>
                    <span className="text-[9px] text-gray-400">تنبيه معلق</span>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Zap size={12} className="text-purple-500"/> حالات تم تصعيدها</span>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-purple-600">{escalatedCount}</span>
                    <span className="text-[9px] text-gray-400">تلقائياً</span>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Target size={12} className="text-emerald-500"/> الالتزام بـ SLA</span>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-emerald-600">{slaRate}%</span>
                    <span className="text-[9px] text-gray-400">معدل الإنجاز</span>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Activity size={12} className="text-blue-500"/> متوسط زمن الإقرار</span>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-blue-600">{meanAckSec}</span>
                    <span className="text-[9px] text-gray-400">ثانية</span>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Users size={12} className="text-indigo-500"/> الطواقم المسجلة</span>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-indigo-600">{users.length}</span>
                    <span className="text-[9px] text-gray-400">مستجيب</span>
                </div>
            </div>
        </div>

        {/* Strategic Score & Quick Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 bg-gradient-to-br from-primary to-indigo-700 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
                <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">{t('facility_security_score')}</p>
                    <h3 className="text-6xl font-black">{securityScore}<span className="text-xl opacity-60">/100</span></h3>
                    <div className="mt-4 flex items-center gap-2 bg-white/20 w-fit px-4 py-1 rounded-full text-[10px] font-black">
                        <ShieldCheck size={14}/> {securityScore > 80 ? t('safe_status') : t('alert_high_risk')}
                    </div>
                </div>
                <Activity className="absolute -right-10 -bottom-10 w-48 h-48 opacity-10" />
            </div>
            <StatCard color="bg-red-500" icon={<AlertTriangle/>} label={t('active_alerts')} value={activeEmergencies.length} />
            <StatCard color="bg-orange-500" icon={<BellOff/>} label="إجمالي المستبعدين" value={totalDismissals} />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartBox id="chart-res" title={`${t('response_time_index')} (${trendDays === 7 ? 'آخر 7 أيام' : 'آخر 30 يوماً'})`} icon={<Clock className="text-primary"/>}>
                <div className="flex justify-end gap-1 mb-2 no-print">
                    <button onClick={() => setTrendDays(7)} className={`px-2.5 py-1 text-[9px] font-black rounded-lg transition-all ${trendDays === 7 ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>7 أيام</button>
                    <button onClick={() => setTrendDays(30)} className={`px-2.5 py-1 text-[9px] font-black rounded-lg transition-all ${trendDays === 30 ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>30 يوماً</button>
                </div>
                <div className="h-64"><Line data={responseTimeData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
            </ChartBox>

            <ChartBox id="chart-sla" title="توزيع الالتزام باتفاقية مستوى الخدمة (SLA Adherence Breakdown)" icon={<Target className="text-emerald-500"/>}>
                <div className="h-64 flex justify-center"><Doughnut data={slaAdherenceData} options={{ maintainAspectRatio: false }} /></div>
            </ChartBox>

            <ChartBox id="chart-risk" title={t('risk_heatmap')} icon={<MapPin className="text-red-500"/>}>
                <div className="h-64"><Bar data={riskHeatmapData} options={{ indexAxis: 'y' as const, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
            </ChartBox>

            <ChartBox id="chart-dist" title={t('emergency_type_dist')} icon={<PieChart className="text-orange-500"/>}>
                <div className="h-64 flex justify-center"><Doughnut data={typeDistData} options={{ maintainAspectRatio: false }} /></div>
            </ChartBox>
        </div>

        {/* Responders & Team Performance Table */}
        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b pb-4 dark:border-gray-700 no-print">
                <div>
                    <h3 className="text-lg font-black dark:text-white flex items-center gap-2"><Users className="text-primary"/> سجل أداء الطواقم والمستجيبين الميدانيين (Team Performance)</h3>
                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">قياس سرعة الإقرار، المباشرة الميدانية، ونسبة الالتزام بـ SLA لكل مستجيب</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <input type="text" placeholder={t('search_by_username')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 md:w-48 bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2 text-xs font-bold shadow-inner outline-none dark:text-white" />
                </div>
            </div>

            <ReportTable id="report-participations" title="مصفوفة تقييم المستجيبين وسرعة الاستجابة" icon={<Users className="text-blue-500"/>}>
                <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs min-w-[700px]">
                        <thead className="bg-gray-50 dark:bg-gray-900 text-gray-400 font-black uppercase tracking-tighter">
                            <tr>
                                <th className="p-4">{t('user')}</th>
                                <th className="p-4">الدور الوظيفي</th>
                                <th className="p-4 text-center">إجمالي البلاغات</th>
                                <th className="p-4 text-center">المباشرة الميدانية</th>
                                <th className="p-4 text-center">متوسط سرعة الإقرار</th>
                                <th className="p-4 text-center">الالتزام بـ SLA</th>
                                <th className="p-4 text-center">التقييم التشغيلي</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-700">
                            {responderMetrics.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="p-4 font-bold dark:text-white flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-black flex items-center justify-center text-xs">
                                            {u.name.slice(0, 1)}
                                        </div>
                                        <span>{u.name}</span>
                                    </td>
                                    <td className="p-4 text-gray-500 font-medium">{u.jobTitle || u.role || 'عضو استجابة'}</td>
                                    <td className="p-4 text-center font-black text-blue-500">{u.totalHandled}</td>
                                    <td className="p-4 text-center font-black text-green-500">{u.respondedCount}</td>
                                    <td className="p-4 text-center font-black text-gray-700 dark:text-gray-300">
                                        {u.avgAckSec !== null ? `${u.avgAckSec} ثانية` : '—'}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-3 py-1 rounded-full font-black text-xs ${u.userSlaRate >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : u.userSlaRate >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'}`}>
                                            {u.userSlaRate}%
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${u.status === 'ممتاز' ? 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400' : u.status === 'متوافق' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400' : 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400'}`}>
                                            {u.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ReportTable>
        </div>
      </div>
      <div className="text-center py-4 opacity-30">
          <p className="text-[10px] font-black dark:text-white uppercase tracking-widest">ERS System Strategy Intelligence Hub</p>
      </div>
    </div>
  );
};

const StatCard = ({ color, icon, label, value }: any) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between group hover:scale-[1.02] transition-all">
        <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
            <h4 className="text-3xl font-black dark:text-white">{value}</h4>
        </div>
        <div className={`p-4 rounded-2xl ${color} text-white shadow-lg`}>{React.cloneElement(icon, { size: 24 })}</div>
    </div>
);

const ChartBox = ({ id, title, icon, children }: any) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} id={id} className="bg-white dark:bg-gray-800 p-6 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-4 relative">
        <div className="flex items-center justify-between border-b pb-4 dark:border-gray-700">
            <h4 className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest flex items-center gap-2">{icon} {title}</h4>
            <div className="flex gap-1 no-print">
                <button onClick={() => printSection(id)} className="p-1.5 text-gray-300 hover:text-primary transition-colors"><Printer size={16}/></button>
                <button onClick={() => exportToPDF(id, title)} className="p-1.5 text-gray-300 hover:text-primary transition-colors"><FileDown size={16}/></button>
            </div>
        </div>
        {children}
    </motion.div>
);

const ReportTable = ({ id, title, icon, children }: any) => {
  const { t } = useTranslation();
  return (
    <div id={id} className="space-y-4 pt-4 border-t first:border-t-0 dark:border-gray-700">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase tracking-widest">{icon} {title}</div>
            <div className="flex gap-2 no-print">
                <button onClick={() => printSection(id)} className="text-[10px] font-black text-primary hover:underline flex items-center gap-1"><Printer size={12}/> {t('print')}</button>
                <button onClick={() => exportToPDF(id, title)} className="text-[10px] font-black text-primary hover:underline flex items-center gap-1"><FileDown size={12}/> {t('export_pdf')}</button>
            </div>
        </div>
        <div className="bg-white dark:bg-gray-900/40 rounded-3xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            {children}
        </div>
    </div>
  );
};

export default AdvancedAnalytics;
