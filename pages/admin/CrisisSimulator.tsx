import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldAlert, Play, ArrowLeft, Bot, RefreshCw, AlertTriangle, 
  Target, Zap, Loader2, Printer, FileDown, Save, MessageSquareText, 
  Settings2, CheckCircle2, Clock, Users, Flame, UserX, Award, StopCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, addDoc, collection, updateDoc } from 'firebase/firestore';
import { FacilityProfile, SimulatorConfig, EmergencyStatus } from '../../types';
import { generateCrisisScenario } from '../../services/geminiService';
import { useApp } from '../../context/AppContext';

interface PresetScenario {
  id: string;
  title: string;
  category: string;
  severity: 'High' | 'Medium';
  description: string;
  challenges: string[];
  objectives: string[];
  standardTimeMinutes: number;
  checklist: string[];
}

const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'fire',
    title: 'حريق صناعي وتصاعد أدخنة كثيفة',
    category: 'حريق',
    severity: 'High',
    description: 'اشتعال مفاجئ في غرفة التوزيع الكهربائية الرئيسية مع انتشار دخان كثيف في ممرات الطابق الأول وتهديد مخارج الطوارئ.',
    challenges: [
      'انعدام الرؤية في الممر الشرقي بسبب كثافة الدخان',
      'تعطل أحد مخارج الطوارئ التلقائية',
      'وجود عمال محاصرين في ورشة الصيانة المجاورة'
    ],
    objectives: [
      'فصل التيار الكهربائي الرئيسي خلال 60 ثانية',
      'إخلاء الطابق الأول بالكامل بنجاح',
      'تطويق بؤرة الحريق والتحقق من عدم وجود مصابين'
    ],
    standardTimeMinutes: 4,
    checklist: [
      'عزل مصدر الطاقة الرئيسي والمولدات',
      'توجيه الشاغلين نحو مخارج الطوارئ البديلة',
      'استخدام طفايات ثاني أكسيد الكربون والرغوة',
      'حصر الأفراد في نقطة التجمع الخارجية رقم 1',
      'التأكد من خلو المنطقة من الغازات السامة'
    ]
  },
  {
    id: 'evacuation',
    title: 'إخلاء شامل للمرافق العامة',
    category: 'إخلاء',
    severity: 'High',
    description: 'صدور أمر إخلاء عاجل وكامل للمنشأة نتيجة إنذار بتهديد إنشائي محتمل في الجناح الغربي.',
    challenges: [
      'تدافع متوقع عند السلالم الرئيسية',
      'وجود زوار غير مدرجين في كشوفات الحضور اليومية',
      'إعاقة مسار الخروج بسبب عربات التحميل'
    ],
    objectives: [
      'تفريغ المبنى خلال أقل من 3 دقائق',
      'تأمين ممرات الإخلاء من أي عوائق',
      'مطابقة كشوف الحصر في نقاط التجمع بنسبة 100%'
    ],
    standardTimeMinutes: 3,
    checklist: [
      'إطلاق نداء الإخلاء المنظم عبر الإذاعة الداخلية',
      'فتح كافة الأبواب المغناطيسية ومخارج الطوارئ',
      'تمشيط المكاتب ودورات المياه والمستودعات',
      'إرشاد الزوار إلى أقرب نقطة تجمع آمنة',
      'رفع تقرير الحصر النهائي لمدير العمليات'
    ]
  },
  {
    id: 'medical',
    title: 'حالة طبية حرجة - توقف تنفس وإنعاش قلبي (CPR)',
    category: 'طبي',
    severity: 'High',
    description: 'سقوط مفاجئ لأحد العاملين وفقدان الوعي مع توقف النبض والتنفس في صالة العمليات المركزية.',
    challenges: [
      'الحاجة الفورية لجهاز الصدمات الكهربائية (AED) خلال 90 ثانية',
      'تجمع الموظفين وإعاقة حركة المسعف الأول',
      'صعوبة دخول سيارة الإسعاف عبر البوابة الجنوبية'
    ],
    objectives: [
      'بدء الإنعاش القلبي الرئوي خلال 45 ثانية من البلاغ',
      'تطبيق صدمات AED والتنفس الاصطناعي',
      'فتح مسار دخول سريع لسيارة الإسعاف'
    ],
    standardTimeMinutes: 3,
    checklist: [
      'التحقق من التنفس والنبض فوراً',
      'طلب جهاز AED وحقيبة الإسعافات المتقدمة',
      'إجراء الضغطات الصدرية بمعدل 100-120 ضغطة/دقيقة',
      'عزل منطقة المصاب ومنع التجمهر',
      'تنسيق الاستلام مع طاقم الهلال الأحمر'
    ]
  },
  {
    id: 'power',
    title: 'انقطاع تام للتيار الكهربائي وفشل المولدات',
    category: 'طاقة',
    severity: 'Medium',
    description: 'انهيار مفاجئ لشبكة التغذية الكهربائية الرئيسية مع تعثر إقلاع المولدات الاحتياطية وتوقف أجهزة الإضاءة وأنظمة التهوية.',
    challenges: [
      'توقف المصاعد بين الطوابق واحتمال وجود ركاب داخلها',
      'ظلام دامس في الممرات السفلية والقبو',
      'توقف أنظمة المراقبة والتحكم المركزي'
    ],
    objectives: [
      'تفعيل كشافات الطوارئ المحمولة خلال دقيقتين',
      'فحص المصاعد وتحرير أي عالقين بأمان',
      'إعادة تشغيل المولد الاحتياطي يدوياً'
    ],
    standardTimeMinutes: 5,
    checklist: [
      'تشغيل إضاءة الطوارئ المستقلة',
      'التواصل الصوتي مع كبائن المصاعد',
      'إجراء الإنزال اليدوي للمصاعد وفتح الأبواب',
      'إعادة ضبط القواطع الكهربائية الرئيسية',
      'التحقق من سلامة أنظمة حفظ البيانات والخوادم'
    ]
  },
  {
    id: 'comms',
    title: 'تعطل شبكة الاتصالات اللاسلكية والإنترنت',
    category: 'اتصالات',
    severity: 'Medium',
    description: 'انقطاع كامل في إشارات الراديو وشبكة الواي فاي والإنترنت داخل المجمع الصناعي أثناء بلاغ تشغيلي.',
    challenges: [
      'استحالة وصول الإشعارات الفورية للهواتف المحمولة',
      'فقدان الاتصال المباشر بين المشرف والدوريات الميدانية',
      'الاعتماد الكلي على بروتوكول الرسل الميدانيين'
    ],
    objectives: [
      'تفعيل التردد الاحتياطي اللاسلكي ونظام الصافرات الصوتية',
      'نشر رسل المشاة بين القطاعات الميدانية',
      'استعادة التنسيق العملياتي خلال 3 دقائق'
    ],
    standardTimeMinutes: 4,
    checklist: [
      'إطلاق نداء الصفارات اليدوية المتفق عليها',
      'توزيع أجهزة الاتصال التناظرية قصيرة المدى',
      'تمركز ضباط اتصال في النقاط المحورية',
      'تدوين البلاغات يدوياً في السجلات الورقية',
      'إعادة فحص كبائن أجهزة التقوية ومزود الخدمة'
    ]
  },
  {
    id: 'multi',
    title: 'حوادث متعددة متزامنة (حريق + تدافع + انقطاع طاقة)',
    category: 'مركب',
    severity: 'High',
    description: 'سيناريو أزمة معقدة يبدأ بحريق في المطبخ المركزي يتبعه انقطاع للكهرباء وتدافع عند المخرج الرئيسي وإصابة شخصين.',
    challenges: [
      'تشتت فرق الاستجابة بين مكافحة الحريق والإنقاذ الطبي',
      'صعوبة اتخاذ القرار تحت الضغط متعدد الجبهات',
      'نفاد الموارد والمعدات المتوفرة في النقطة الأولى'
    ],
    objectives: [
      'تقسيم الفريق إلى فرقتين متخصصتين خلال 30 ثانية',
      'احتواء الحريق وإسعاف المصابين في آن واحد',
      'إعادة الهدوء وتوجيه الحشود دون خسائر'
    ],
    standardTimeMinutes: 6,
    checklist: [
      'تكليف قائد عمليات لكل مسار (إطفاء / إسعاف)',
      'تأمين ممر مخصص لنقل المصابين',
      'محاصرة النيران بطفايات الحريق المناسبة',
      'تنظيم حركة الأفراد ومنع التزاحم',
      'طلب دعم خارجي فوري من الجهات الرسمية'
    ]
  },
  {
    id: 'delayed_team',
    title: 'تأخر فريق الاستجابة وتفعيل التصعيد التلقائي',
    category: 'تصعيد',
    severity: 'High',
    description: 'محاكاة بلاغ طارئ لم يتم تأكيد استلامه من الفرق الأولية خلال 60 ثانية لاختبار محرك التصعيد التلقائي وسرعة تدخل الإدارة.',
    challenges: [
      'انشغال المستجيب الأول بمهمة ثانوية',
      'انتقال البلاغ آلياً للمشرف ثم مدير الطوارئ',
      'الحاجة لتدخل الكوادر الاحتياطية فوراً'
    ],
    objectives: [
      'اختبار عمل مراحل التصعيد الأربع (L1, L2, L3, L4)',
      'استجابة المستوى الإداري خلال المهلة المحددة',
      'توثيق أسباب التأخر في سجل التدقيق'
    ],
    standardTimeMinutes: 5,
    checklist: [
      'رصد وصول التنبيه لمستوى المشرف',
      'إعادة توجيه الدورية الأقرب جغرافياً عبر الـ GPS',
      'تأكيد الاستلام من قبل المدير المناوب',
      'إغلاق البلاغ مع إرفاق مذكرة التجاوز',
      'تحليل أسباب بطء الاستجابة في التقرير النهائي'
    ]
  },
  {
    id: 'notif_failure',
    title: 'تعطل شبكة الإشعارات والتحول للإنذار الصوتي البديل',
    category: 'إشعارات',
    severity: 'Medium',
    description: 'محاكاة فشل تسليم إشعارات الدفع (FCM Push Failover) وتفعيل صفارات الإنذار الصوتية والنداء العام بالذكاء الاصطناعي بدلاً منها.',
    challenges: [
      'عدم استلام رسائل الموبايل بسبب وضع الطيران أو البطارية',
      'ضرورة لفت انتباه الموظفين عبر الإنذار المسموع والمرئي',
      'التحقق الميداني المباشر من استجابة الغرف المعزولة'
    ],
    objectives: [
      'تفعيل النداء الصوتي الشامل خلال 15 ثانية',
      'تأكد الدوريات من وصول التحذير لكافة المقار',
      'التوثيق الفوري في سجل الأحداث البديل'
    ],
    standardTimeMinutes: 4,
    checklist: [
      'تشغيل صافرة الإنذار الرقمية عبر مركز ERS',
      'بث النداء العام الذكي التكراري بالصوت',
      'إرسال إشارات الضوء التحذيرية المتقطعة',
      'المرور المباشر على المكاتب المغلقة صوتياً',
      'استلام تأكيدات الإخلاء الشفهية من مسؤولي الأدوار'
    ]
  }
];

export const CrisisSimulator = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, users, geminiApiKey, geminiApiKeySecondary } = useApp();

  const [loading, setLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<PresetScenario>(PRESET_SCENARIOS[0]);
  const [customSituations, setCustomSituations] = useState('');
  const [facilityProfile, setFacilityProfile] = useState<FacilityProfile | null>(null);

  // Active Drill State (Isolated Mode)
  const [activeDrill, setActiveDrill] = useState<any>(null);
  const [drillElapsedTime, setDrillElapsedTime] = useState(0);
  const [drillCompletedTasks, setDrillCompletedTasks] = useState<string[]>([]);
  const [drillResults, setDrillResults] = useState<any>(null);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const profileSnap = await getDoc(doc(db, 'system', 'facility_profile'));
        if (profileSnap.exists()) setFacilityProfile(profileSnap.data() as FacilityProfile);
        
        const configSnap = await getDoc(doc(db, 'system', 'simulator_config'));
        if (configSnap.exists()) {
          const data = configSnap.data() as SimulatorConfig;
          setCustomSituations(data.customSituations || '');
        }
      } catch (e) {}
    };
    loadConfig();
  }, []);

  // Timer for active drill
  useEffect(() => {
    let interval: any = null;
    if (activeDrill && !drillResults) {
      interval = setInterval(() => {
        setDrillElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeDrill, drillResults]);

  // Start Isolated Drill
  const handleStartDrill = async () => {
    setLoading(true);
    const drillId = `drill_${Date.now()}`;
    const startTime = Date.now();

    const drillData = {
      id: drillId,
      scenarioId: selectedScenario.id,
      title: selectedScenario.title,
      category: selectedScenario.category,
      severity: selectedScenario.severity,
      targetTimeMinutes: selectedScenario.standardTimeMinutes,
      startTime,
      participants: selectedParticipants.length > 0 ? selectedParticipants : users.slice(0, 3).map(u => u.name || u.username),
      checklist: selectedScenario.checklist.map((item, idx) => ({ id: `t_${idx}`, text: item, completed: false })),
      isDrill: true,
      mode: 'ISOLATED_SIMULATION'
    };

    setActiveDrill(drillData);
    setDrillElapsedTime(0);
    setDrillCompletedTasks([]);
    setDrillResults(null);
    setLoading(false);

    // Save isolated record to Firestore with isDrill=true
    try {
      await addDoc(collection(db, 'emergencies'), {
        typeName: `[محاكاة تدريبية] ${selectedScenario.title}`,
        locationName: 'موقع التدريب المعزول',
        status: EmergencyStatus.ACTIVE,
        isDrill: true,
        drillScenarioId: selectedScenario.id,
        createdAt: startTime,
        createdBy: user?.id || 'admin',
        creatorName: `${user?.name || 'المدير'} (وضع المحاكاة)`,
        notes: `تدريب أزمات معزول: ${selectedScenario.description}`,
        checklist: drillData.checklist
      });
    } catch (e) {}
  };

  // Toggle checklist item
  const handleToggleTask = (taskId: string) => {
    setDrillCompletedTasks(prev => {
      if (prev.includes(taskId)) return prev.filter(id => id !== taskId);
      return [...prev, taskId];
    });
  };

  // Conclude Drill and Generate Evaluation
  const handleEndDrill = () => {
    if (!activeDrill) return;

    const totalTasks = selectedScenario.checklist.length;
    const completedTasksCount = drillCompletedTasks.length;
    const completionRate = Math.round((completedTasksCount / totalTasks) * 100);
    const actualMinutes = Math.round((drillElapsedTime / 60) * 10) / 10;
    const targetMinutes = selectedScenario.standardTimeMinutes;
    const isWithinTime = actualMinutes <= targetMinutes;
    const diffMinutes = Math.abs(Math.round((actualMinutes - targetMinutes) * 10) / 10);

    const results = {
      scenarioTitle: selectedScenario.title,
      category: selectedScenario.category,
      actualDuration: `${Math.floor(drillElapsedTime / 60)}د ${drillElapsedTime % 60}ث`,
      actualMinutes,
      targetMinutes,
      isWithinTime,
      diffMinutes,
      completionRate,
      completedTasksCount,
      totalTasks,
      score: Math.min(100, Math.round((completionRate * 0.7) + (isWithinTime ? 30 : Math.max(0, 30 - diffMinutes * 10)))),
      bottlenecks: isWithinTime 
        ? ['تم إنجاز المهام ضمن الوقت القياسي دون اختناقات ملحوظة.'] 
        : [`تجاوز الوقت المعياري بـ ${diffMinutes} دقيقة أثناء إنجاز مهام الإخلاء والعزل.`],
      lessonsLearned: [
        `تعزيز سرعة ارتداء ونشر تجهيزات الحماية الميدانية للمستجيبين.`,
        `إجراء تدريب مصغر على استخدام جهاز الصدمات وطفايات الحريق الخاصة.`,
        `التحقق الدوري من مسارات الإخلاء المغناطيسية لتجنب الازدحام.`
      ]
    };

    setDrillResults(results);
  };

  const handlePrintDebriefing = () => {
    const element = document.getElementById('debriefing-report');
    if (!element) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>تقرير تقييم الأزمة والدروس المستفادة</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
              body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 40px; color: #1e293b; }
              .header { text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }
              .badge { display: inline-block; padding: 4px 12px; background: #fee2e2; color: #991b1b; border-radius: 999px; font-size: 11px; font-weight: bold; }
              .kpi-row { display: flex; gap: 15px; justify-content: space-around; margin-bottom: 25px; }
              .kpi-box { border: 1px solid #e2e8f0; padding: 12px; border-radius: 12px; text-align: center; flex: 1; }
              .kpi-val { font-size: 18px; font-weight: 900; color: #0284c7; }
              ul { padding-right: 20px; }
              li { margin-bottom: 8px; font-size: 13px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <span class="badge">محاكاة تدريبية معزولة - ERS Crisis Simulator</span>
              <h2 style="margin: 8px 0;">تقرير التقييم واستخلاص الدروس المستفادة</h2>
              <p style="font-size: 12px; color: #64748b;">سيناريو: ${selectedScenario.title} | التاريخ: ${new Date().toLocaleString('ar-EG')}</p>
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
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 dark:border-gray-700">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <ShieldAlert size={28} className="text-red-600" /> محاكي الأزمات المتقدم (Phase 4.3)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            سيناريوهات تدريب معزولة 100% دون إطلاق إنذارات عامة حقيقية أو تلويث السجلات التشغيلية
          </p>
        </div>

        <Button variant="outline" onClick={() => navigate('/admin')} className="rounded-xl font-bold text-xs">
          <ArrowLeft size={16} className="mr-1.5 rtl:rotate-180" /> {t('back')}
        </Button>
      </div>

      {/* Isolation Guard Notice */}
      <div className="bg-amber-500/10 border-2 border-amber-500 p-4 rounded-3xl flex items-center gap-3 text-amber-900 dark:text-amber-200 text-xs">
        <AlertTriangle size={24} className="text-amber-600 shrink-0" />
        <div>
          <span className="font-black block text-sm">وضع المحاكاة التدريبية المعزولة (Isolated Drill Mode)</span>
          <span>جميع التدريبات في هذه الواجهة معزولة بنطاق اختباري خاص ولن ترسل إشعارات FCM حقيقية لأجهزة الموظفين غير المشاركين.</span>
        </div>
      </div>

      {!activeDrill ? (
        /* Scenario Selection Screen */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black dark:text-white flex items-center gap-2">
              <Zap size={18} className="text-primary" /> بنك السيناريوهات التدريبية الثمانية المعتمدة
            </h2>
            <span className="text-xs font-bold text-gray-500">8 سيناريوهات قياسية</span>
          </div>

          {/* 8 Preset Scenario Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {PRESET_SCENARIOS.map((scen) => {
              const isSelected = selectedScenario.id === scen.id;
              return (
                <div 
                  key={scen.id} 
                  onClick={() => setSelectedScenario(scen)}
                  className={`p-4 rounded-3xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected 
                      ? 'bg-red-50/50 dark:bg-red-950/30 border-red-500 shadow-md transform scale-[1.02]' 
                      : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        scen.severity === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {scen.category}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400">{scen.standardTimeMinutes} دقائق</span>
                    </div>
                    <h3 className="font-black text-sm text-gray-900 dark:text-white leading-tight">
                      {scen.title}
                    </h3>
                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                      {scen.description}
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t dark:border-gray-700 flex items-center justify-between text-[10px] font-black">
                    <span className="text-gray-400">{scen.checklist.length} مهام SOP</span>
                    <span className={isSelected ? 'text-red-600' : 'text-primary'}>
                      {isSelected ? 'محدد حالياً' : 'اختيار'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Scenario Preview & Launch Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 dark:border-gray-700">
              <div>
                <span className="text-xs font-black text-red-600 uppercase">تفاصيل السيناريو المختار</span>
                <h3 className="text-xl font-black dark:text-white mt-1">{selectedScenario.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                  <Clock size={14}/> الوقت المستهدف: {selectedScenario.standardTimeMinutes} دقائق
                </span>
              </div>
            </div>

            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 leading-relaxed">
              {selectedScenario.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-red-50/50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/30 space-y-2">
                <h4 className="font-black text-xs text-red-800 dark:text-red-300 flex items-center gap-1.5">
                  <AlertTriangle size={14} /> التحديات الميدانية الحرجة
                </h4>
                <ul className="text-xs space-y-1.5 text-gray-700 dark:text-gray-300">
                  {selectedScenario.challenges.map((c, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-red-500 font-black">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 space-y-2">
                <h4 className="font-black text-xs text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                  <Target size={14} /> الأهداف الاستراتيجية للنجاح
                </h4>
                <ul className="text-xs space-y-1.5 text-gray-700 dark:text-gray-300">
                  {selectedScenario.objectives.map((o, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-blue-500 font-black">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Launch Drill Button */}
            <div className="pt-2 flex justify-end">
              <Button 
                onClick={handleStartDrill} 
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white font-black px-8 py-4 rounded-2xl text-sm shadow-xl flex items-center gap-2"
              >
                <Play size={18} />
                بدء التدريب والمحاكاة الميدانية الآن
              </Button>
            </div>
          </div>
        </div>
      ) : !drillResults ? (
        /* Active Live Drill Screen */
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border-2 border-red-500 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4 dark:border-gray-700">
            <div>
              <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider animate-pulse">
                تدريب نشط - وضع المحاكاة
              </span>
              <h2 className="text-2xl font-black dark:text-white mt-2">{activeDrill.title}</h2>
            </div>
            
            <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl border dark:border-gray-700">
              <div className="text-right">
                <div className="text-[10px] text-gray-400 font-bold uppercase">الزمن المنقضي</div>
                <div className="text-2xl font-black font-mono text-red-600">
                  {Math.floor(drillElapsedTime / 60).toString().padStart(2, '0')}:{(drillElapsedTime % 60).toString().padStart(2, '0')}
                </div>
              </div>
              <div className="text-right border-r pr-3 dark:border-gray-700">
                <div className="text-[10px] text-gray-400 font-bold uppercase">الهدف</div>
                <div className="text-xl font-bold font-mono text-gray-500">
                  0{activeDrill.targetTimeMinutes}:00
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Drill Checklist */}
          <div className="space-y-3">
            <h3 className="font-black text-sm dark:text-white flex items-center gap-2">
              <CheckCircle2 size={18} className="text-primary" /> قائمة إجراءات التشغيل القياسية (SOP Checklist)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedScenario.checklist.map((taskText, idx) => {
                const taskId = `t_${idx}`;
                const isCompleted = drillCompletedTasks.includes(taskId);
                return (
                  <div 
                    key={taskId}
                    onClick={() => handleToggleTask(taskId)}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-3 ${
                      isCompleted 
                        ? 'bg-green-50 dark:bg-green-950/40 border-green-500 text-green-900 dark:text-green-200' 
                        : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border-2 ${
                      isCompleted ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {isCompleted && <CheckCircle2 size={16} />}
                    </div>
                    <span className="text-xs font-black leading-snug">{taskText}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* End Drill Action */}
          <div className="pt-4 border-t dark:border-gray-700 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500">
              تم إنجاز {drillCompletedTasks.length} من {selectedScenario.checklist.length} مهام
            </span>
            <Button 
              onClick={handleEndDrill}
              className="bg-red-600 hover:bg-red-700 text-white font-black px-8 py-3 rounded-2xl text-xs flex items-center gap-2"
            >
              <StopCircle size={18} /> إنهاء التدريب واستخراج التقييم
            </Button>
          </div>
        </div>
      ) : (
        /* Post-Drill Evaluation & Debriefing Report */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black dark:text-white flex items-center gap-2">
              <Award size={24} className="text-amber-500" /> تقرير تقييم الأزمة واستخلاص الدروس المستفادة
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrintDebriefing} className="rounded-xl text-xs font-black">
                <Printer size={16} className="mr-1.5" /> طباعة التقرير
              </Button>
              <Button onClick={() => setActiveDrill(null)} className="rounded-xl text-xs font-black">
                تدريب جديد
              </Button>
            </div>
          </div>

          <div id="debriefing-report" className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm space-y-6">
            {/* KPI Metrics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                <div className="text-[10px] text-gray-400 font-bold uppercase">النتيجة الإجمالية</div>
                <div className="text-3xl font-black text-primary mt-1">{drillResults.score}%</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                <div className="text-[10px] text-gray-400 font-bold uppercase">زمن الاستجابة المحقق</div>
                <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{drillResults.actualDuration}</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                <div className="text-[10px] text-gray-400 font-bold uppercase">نسبة استيفاء الـ SOP</div>
                <div className="text-2xl font-black text-green-600 mt-1">{drillResults.completionRate}%</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                <div className="text-[10px] text-gray-400 font-bold uppercase">الالتزام بالزمن القياسي</div>
                <div className={`text-xl font-black mt-1 ${drillResults.isWithinTime ? 'text-green-600' : 'text-red-600'}`}>
                  {drillResults.isWithinTime ? 'ناجح (ضمن الهدف)' : 'متأخر'}
                </div>
              </div>
            </div>

            {/* Bottlenecks and Lessons Learned */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/40 space-y-2">
                <h4 className="font-black text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle size={16} /> أوجه التأخير والاختناقات المرصودة
                </h4>
                <ul className="text-xs space-y-1.5 text-gray-700 dark:text-gray-300">
                  {drillResults.bottlenecks.map((b: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-500 font-bold">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 bg-green-50/50 dark:bg-green-950/20 rounded-2xl border border-green-200 dark:border-green-900/40 space-y-2">
                <h4 className="font-black text-xs text-green-900 dark:text-green-300 flex items-center gap-1.5">
                  <Award size={16} /> التوصيات الإجرائية والدروس المستفادة
                </h4>
                <ul className="text-xs space-y-1.5 text-gray-700 dark:text-gray-300">
                  {drillResults.lessonsLearned.map((l: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-green-500 font-bold">•</span>
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrisisSimulator;
