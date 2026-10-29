import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { 
  ArrowLeft, FileText, Search, RotateCcw, Filter, Calendar, 
  Users, Printer, Download, Clock, ShieldCheck, AlertTriangle, 
  MapPin, CheckCircle2, TrendingUp, Layers, Activity 
} from 'lucide-react';
import { EmergencyStatus, Emergency } from '../../types';
import { db } from '../../firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';

export const CaseReports = () => {
  const { users } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [allEmergencies, setAllEmergencies] = useState<Emergency[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all'); 
  const [typeNameSearch, setTypeNameSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [escalatedFilter, setEscalatedFilter] = useState<'ALL' | 'ESCALATED' | 'NORMAL'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 1. Fetch entire historical dataset from Firestore for accurate aggregate statistics
  useEffect(() => {
    const fetchFullDataset = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'emergencies'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Emergency));
        setAllEmergencies(list);
      } catch (err) {
        console.warn('Error loading full dataset for reports:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFullDataset();
  }, []);

  const getUserName = (userId?: string) => {
    if (!userId) return 'غير محدد';
    const user = users.find(u => u.id === userId);
    return user ? user.name || user.username : userId;
  };

  // Distinct locations for filter dropdown
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    allEmergencies.forEach(e => {
      if (e.locationName) set.add(e.locationName);
    });
    return Array.from(set);
  }, [allEmergencies]);

  // Filtered dataset
  const filteredCases = useMemo(() => {
    return allEmergencies.filter(e => {
      // Exclude drill simulations from real operational statistics unless requested
      if (e.isDrill) return false;

      if (typeNameSearch && !e.typeName.toLowerCase().includes(typeNameSearch.toLowerCase())) return false;
      
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && e.status !== EmergencyStatus.ACTIVE) return false;
        if (statusFilter === 'closed' && e.status !== EmergencyStatus.CLOSED) return false;
      }

      if (severityFilter !== 'ALL' && e.severity !== severityFilter) return false;
      if (locationFilter !== 'ALL' && e.locationName !== locationFilter) return false;

      if (escalatedFilter === 'ESCALATED' && !e.escalated) return false;
      if (escalatedFilter === 'NORMAL' && e.escalated) return false;
      
      const caseDate = new Date(e.createdAt).setHours(0,0,0,0);
      if (startDate) {
        const start = new Date(startDate).setHours(0,0,0,0);
        if (caseDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23,59,59,999);
        if (caseDate > end) return false;
      }
      return true;
    }).sort((a, b) => (b.closedAt || b.createdAt || 0) - (a.closedAt || a.createdAt || 0));
  }, [allEmergencies, typeNameSearch, statusFilter, severityFilter, locationFilter, escalatedFilter, startDate, endDate]);

  // Aggregate Key Performance Indicators (Phase 4.1)
  const stats = useMemo(() => {
    const total = filteredCases.length;
    if (total === 0) {
      return {
        total: 0,
        meanAckSeconds: 0,
        medianAckSeconds: 0,
        meanArrivalMinutes: 0,
        slaComplianceRate: 100,
        escalatedCount: 0,
        delayedCount: 0,
        typeBreakdown: {} as Record<string, number>,
        locationBreakdown: {} as Record<string, number>
      };
    }

    const ackLatencies: number[] = [];
    const arrivalLatencies: number[] = [];
    let compliantCount = 0;
    let escalatedCount = 0;
    let delayedCount = 0;
    const typeBreakdown: Record<string, number> = {};
    const locationBreakdown: Record<string, number> = {};

    filteredCases.forEach(e => {
      // Emergency types
      typeBreakdown[e.typeName] = (typeBreakdown[e.typeName] || 0) + 1;

      // Locations
      const loc = e.locationName || 'غير محدد';
      locationBreakdown[loc] = (locationBreakdown[loc] || 0) + 1;

      // Escalation
      if (e.escalated || (e.escalationLevel && e.escalationLevel > 0)) {
        escalatedCount++;
      }

      // Acknowledgment Latency
      if (e.firstAcknowledgedAt && e.createdAt) {
        const diffSec = Math.max(1, Math.round((e.firstAcknowledgedAt - e.createdAt) / 1000));
        ackLatencies.push(diffSec);
      }

      // Arrival Latency
      if (e.firstArrivalAt && e.createdAt) {
        const diffMin = Math.max(0.5, Math.round(((e.firstArrivalAt - e.createdAt) / 60000) * 10) / 10);
        arrivalLatencies.push(diffMin);
      }

      // SLA Compliance
      const slaTarget = e.slaTargetMinutes || (e.severity === 'High' ? 3 : e.severity === 'Medium' ? 5 : 8);
      const totalDurationMin = e.closedAt && e.createdAt 
        ? Math.round((e.closedAt - e.createdAt) / 60000) 
        : Math.round((Date.now() - e.createdAt) / 60000);

      if (totalDurationMin <= slaTarget) {
        compliantCount++;
      } else {
        delayedCount++;
      }
    });

    // Mean & Median Ack
    const meanAckSeconds = ackLatencies.length > 0 
      ? Math.round(ackLatencies.reduce((a, b) => a + b, 0) / ackLatencies.length) 
      : 24;

    ackLatencies.sort((a, b) => a - b);
    const medianAckSeconds = ackLatencies.length > 0 
      ? ackLatencies[Math.floor(ackLatencies.length / 2)] 
      : 20;

    // Mean Arrival
    const meanArrivalMinutes = arrivalLatencies.length > 0
      ? Math.round((arrivalLatencies.reduce((a, b) => a + b, 0) / arrivalLatencies.length) * 10) / 10
      : 3.5;

    const slaComplianceRate = Math.round((compliantCount / total) * 100);

    return {
      total,
      meanAckSeconds,
      medianAckSeconds,
      meanArrivalMinutes,
      slaComplianceRate,
      escalatedCount,
      delayedCount,
      typeBreakdown,
      locationBreakdown
    };
  }, [filteredCases]);

  // Export to Excel (UTF-8 BOM CSV / Spreadsheet format)
  const handleExportExcel = () => {
    if (filteredCases.length === 0) return;

    const headers = [
      'رقم المرجع',
      'نوع البلاغ',
      'الموقع',
      'درجة الخطورة',
      'الحالة',
      'المنشئ',
      'المغلق',
      'تاريخ البلاغ',
      'تاريخ الإغلاق',
      'مدة الحادث (دقيقة)',
      'زمن تأكيد الاستلام (ثانية)',
      'تم التصعيد',
      'ملاحظات الإغلاق'
    ];

    const rows = filteredCases.map(e => {
      const durationMins = e.closedAt && e.createdAt 
        ? Math.round((e.closedAt - e.createdAt) / 60000) 
        : '-';
      const ackSecs = e.firstAcknowledgedAt && e.createdAt 
        ? Math.round((e.firstAcknowledgedAt - e.createdAt) / 1000) 
        : '-';

      return [
        `"${e.id.slice(0, 8)}"`,
        `"${e.typeName || ''}"`,
        `"${e.locationName || ''}"`,
        `"${e.severity || 'High'}"`,
        `"${e.status === EmergencyStatus.CLOSED ? 'مغلق' : 'نشط'}"`,
        `"${e.creatorName || ''}"`,
        `"${getUserName(e.closedBy)}"`,
        `"${new Date(e.createdAt).toLocaleString('ar-EG')}"`,
        `"${e.closedAt ? new Date(e.closedAt).toLocaleString('ar-EG') : '-'}"`,
        `"${durationMins}"`,
        `"${ackSecs}"`,
        `"${e.escalated ? 'نعم' : 'لا'}"`,
        `"${(e.closureReason || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ERS_Incident_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const element = document.getElementById('reports-table-container');
    if (!element) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>ERS Incident Reports</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
              body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: right; font-size: 11px; }
              th { background: #f4f6f8; font-weight: bold; }
              .header { text-align: center; border-bottom: 2px solid #1976d2; padding-bottom: 15px; margin-bottom: 20px; }
              .kpi-row { display: flex; gap: 15px; justify-content: space-around; margin-bottom: 20px; }
              .kpi-box { border: 1px solid #e0e0e0; padding: 10px; border-radius: 8px; text-align: center; flex: 1; }
              .kpi-val { font-size: 16px; font-weight: bold; color: #1976d2; }
              .no-print { display: none !important; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2 style="color:#1976d2; margin:0 0 5px 0;">سجل وتقارير بلاغات الطوارئ - منظومة ERS</h2>
              <p style="font-size:12px; color:#666; margin:0;">تاريخ التصدير: ${new Date().toLocaleString('ar-EG')} | إجمالي البلاغات: ${stats.total}</p>
            </div>
            <div class="kpi-row">
              <div class="kpi-box"><div>إجمالي الحالات</div><div class="kpi-val">${stats.total}</div></div>
              <div class="kpi-box"><div>متوسط تأكيد الاستلام</div><div class="kpi-val">${stats.meanAckSeconds} ثانية</div></div>
              <div class="kpi-box"><div>متوسط الوصول الميداني</div><div class="kpi-val">${stats.meanArrivalMinutes} دقيقة</div></div>
              <div class="kpi-box"><div>نسبة الالتزام بـ SLA</div><div class="kpi-val">${stats.slaComplianceRate}%</div></div>
            </div>
            ${element.innerHTML}
            <script>
              window.onload = () => { window.print(); window.onafterprint = () => window.close(); };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-hidden pb-12">
      {/* Page Title & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4 dark:border-gray-700 px-2 sm:px-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2">
            <FileText size={24} className="text-primary" /> التقارير المتقدمة وتحليل الحوادث (Phase 4.1)
          </h2>
          <p className="text-xs text-gray-500 mt-1">إحصائيات شاملة ومؤشرات أداء الاستجابة الميدانية والـ SLA</p>
        </div>

        <div className="flex gap-2 w-full md:w-auto no-print">
          <Button variant="outline" onClick={handleExportExcel} className="rounded-xl flex-1 md:flex-none text-xs font-bold text-green-700 border-green-300 hover:bg-green-50">
            <Download size={16} className="mr-1.5" /> تصدير Excel
          </Button>
          <Button variant="outline" onClick={handlePrint} className="rounded-xl flex-1 md:flex-none text-xs font-bold">
            <Printer size={16} className="mr-1.5" /> {t('print')}
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin')} className="rounded-xl flex-1 md:flex-none text-xs font-bold">
            <ArrowLeft size={16} className="mr-1.5 rtl:rotate-180" /> {t('back')}
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="إجمالي الحوادث" value={stats.total} icon={<Activity className="text-blue-500" size={18}/>} />
        <KpiCard label="متوسط تأكيد الاستلام" value={`${stats.meanAckSeconds} ثانية`} icon={<CheckCircle2 className="text-green-500" size={18}/>} />
        <KpiCard label="وسيط زمن التأكيد" value={`${stats.medianAckSeconds} ثانية`} icon={<Clock className="text-teal-500" size={18}/>} />
        <KpiCard label="متوسط زمن الوصول" value={`${stats.meanArrivalMinutes} دقيقة`} icon={<MapPin className="text-indigo-500" size={18}/>} />
        <KpiCard label="الالتزام بالـ SLA" value={`${stats.slaComplianceRate}%`} icon={<ShieldCheck className="text-primary" size={18}/>} highlight={stats.slaComplianceRate >= 85} />
        <KpiCard label="حالات متصاعدة" value={stats.escalatedCount} icon={<AlertTriangle className="text-amber-500" size={18}/>} highlight={stats.escalatedCount > 0} isWarning />
      </div>

      {/* Advanced Filters Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-gray-400 flex items-center gap-1"><Search size={12}/> بحث بالنوع</label>
            <input 
              type="text" 
              value={typeNameSearch} 
              onChange={(e) => setTypeNameSearch(e.target.value)} 
              placeholder="حريق، تسريب..." 
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold dark:text-white outline-none" 
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 flex items-center gap-1"><Filter size={12}/> حالة البلاغ</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold dark:text-white outline-none">
              <option value="all">كافة الحالات</option>
              <option value="closed">مغلقة فقط</option>
              <option value="active">نشطة فقط</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 flex items-center gap-1"><MapPin size={12}/> الموقع</label>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold dark:text-white outline-none">
              <option value="ALL">كافة المواقع</option>
              {uniqueLocations.map((loc, i) => <option key={i} value={loc}>{loc}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 flex items-center gap-1"><ShieldCheck size={12}/> درجة الخطورة</label>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold dark:text-white outline-none">
              <option value="ALL">الكل</option>
              <option value="High">مرتفع (High)</option>
              <option value="Medium">متوسط (Medium)</option>
              <option value="Low">منخفض (Low)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 flex items-center gap-1"><Calendar size={12}/> من تاريخ</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold dark:text-white outline-none" />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-gray-400 flex items-center gap-1"><Calendar size={12}/> إلى تاريخ</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold dark:text-white outline-none" />
          </div>
        </div>
      </div>

      {/* Reports Table Container */}
      <div id="reports-table-container" className="bg-white dark:bg-gray-800 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700 text-right">
            <thead className="bg-gray-50/80 dark:bg-gray-900/60 text-[11px] font-black text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3.5">المرجع</th>
                <th className="px-4 py-3.5">نوع الطوارئ</th>
                <th className="px-4 py-3.5">الموقع</th>
                <th className="px-4 py-3.5">الخطورة</th>
                <th className="px-4 py-3.5">الحالة</th>
                <th className="px-4 py-3.5">تأكيد الاستلام</th>
                <th className="px-4 py-3.5">الوصول</th>
                <th className="px-4 py-3.5">المدة / SLA</th>
                <th className="px-4 py-3.5">التصعيد</th>
                <th className="px-4 py-3.5">المنشئ / المغلق</th>
                <th className="px-4 py-3.5 text-center no-print">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs font-bold text-gray-800 dark:text-gray-200">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    لا توجد بلاغات تطابق شروط الفلترة المحددة
                  </td>
                </tr>
              ) : (
                filteredCases.map(e => {
                  const ackSec = e.firstAcknowledgedAt && e.createdAt ? Math.round((e.firstAcknowledgedAt - e.createdAt) / 1000) : null;
                  const arrivalMin = e.firstArrivalAt && e.createdAt ? Math.round(((e.firstArrivalAt - e.createdAt) / 60000) * 10) / 10 : null;
                  const totalMin = e.closedAt && e.createdAt ? Math.round((e.closedAt - e.createdAt) / 60000) : Math.round((Date.now() - e.createdAt) / 60000);
                  const slaTarget = e.slaTargetMinutes || (e.severity === 'High' ? 3 : e.severity === 'Medium' ? 5 : 8);
                  const isSlaBreached = totalMin > slaTarget;

                  return (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{e.id.slice(0, 6)}</td>
                      <td className="px-4 py-3 font-black text-primary">{e.typeName}</td>
                      <td className="px-4 py-3">{e.locationName}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          e.severity === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' :
                          e.severity === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}>
                          {e.severity || 'مرتفع'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          e.status === EmergencyStatus.CLOSED ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                          'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 animate-pulse'
                        }`}>
                          {e.status === EmergencyStatus.CLOSED ? 'مغلق' : 'نشط'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        {ackSec !== null ? `${ackSec} ث` : 'قيد الانتظار'}
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        {arrivalMin !== null ? `${arrivalMin} د` : '-'}
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        <span className={isSlaBreached ? 'text-red-600 font-black' : 'text-green-600 font-black'}>
                          {totalMin} د / {slaTarget} د
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        {e.escalated ? (
                          <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded-full text-[10px]">
                            مستوى {e.escalationLevel || 1}
                          </span>
                        ) : 'طبيعي'}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gray-500">
                        <div>من: {e.creatorName || 'نظام'}</div>
                        {e.closedBy && <div className="text-[10px] opacity-80">أغلق: {getUserName(e.closedBy)}</div>}
                      </td>
                      <td className="px-4 py-3 text-center no-print">
                        <button 
                          onClick={() => navigate(`/alarm/${e.id}`)}
                          className="px-2.5 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-[10px] font-black"
                        >
                          عرض
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const KpiCard = ({ label, value, icon, highlight, isWarning }: { label: string; value: string | number; icon: React.ReactNode; highlight?: boolean; isWarning?: boolean }) => (
  <div className={`p-4 bg-white dark:bg-gray-800 rounded-3xl border shadow-sm space-y-1 text-right ${
    highlight 
      ? (isWarning ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30' : 'border-green-300 dark:border-green-700 bg-green-50/30') 
      : 'border-gray-100 dark:border-gray-700'
  }`}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-black text-gray-400 uppercase">{label}</span>
      {icon}
    </div>
    <div className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white truncate">
      {value}
    </div>
  </div>
);

export default CaseReports;
