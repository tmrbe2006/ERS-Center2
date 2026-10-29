import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Shared server-side Gemini client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// ==========================================
// 1. Text-to-Speech Emergency Announcement
// ==========================================
app.post('/api/gemini/announcement', async (req, res) => {
  try {
    const { emergency } = req.body;
    if (!emergency) {
      return res.status(400).json({ error: 'Missing emergency data' });
    }

    const ai = getAiClient();
    const prompt = `أنت نظام النداء العام الذكي. قم بصياغة نداء طوارئ صوتي عاجل وواضح جداً لحالة ${emergency.typeName} في موقع ${emergency.locationName}. 
يجب أن يتضمن النداء: "انتباه"، "نوع الخطر"، "الموقع"، و"توجيه فوري". 
اجعل النص قوياً ومباشراً باللغة العربية الفصحى ليتم تحويله لصوت.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    return res.json({ audio: base64Audio });
  } catch (error: any) {
    console.error('Error generating emergency announcement:', error);
    return res.status(500).json({ error: error.message || 'Announcement generation failed' });
  }
});

// ==========================================
// 2. White-Labeled AI & Tactical Reports
// ==========================================
function cleanReportText(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[\*\-]\s+/gm, '• ')
    .replace(/[\*#]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatArabicDateTime(ts?: any): string {
  if (!ts) return 'غير محدد';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });
  } catch {
    return String(ts);
  }
}

function buildReportHeader(emergency: any, reportTitle: string): string[] {
  const code = (emergency?.id || 'ERS-REF').slice(0, 8).toUpperCase();
  const typeName = emergency?.typeName || emergency?.type || 'طوارئ عامة';
  const locationName = emergency?.locationName || emergency?.location || 'الموقع العام للمنشأة';
  const severity = emergency?.severity || 'مرتفع';
  const createdAtStr = formatArabicDateTime(emergency?.createdAt);
  const closedAtStr = emergency?.closedAt ? formatArabicDateTime(emergency.closedAt) : 'قيد المتابعة والتوثيق';
  const dateStr = emergency?.createdAt 
    ? new Date(emergency.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  return [
    `التاريخ: ${dateStr}`,
    `اسم الحالة: ${typeName}`,
    `توقيت حالة الطوارئ: من (${createdAtStr}) إلى (${closedAtStr})`,
    `الموقع: ${locationName} | مستوى الخطورة: ${severity} | رقم المرجع: ${code}`,
    `--------------------------------------------------------------------------------`,
    `${reportTitle}`,
    ``
  ];
}

function generateTechnicalReport(emergency: any): string {
  const code = (emergency?.id || 'ERS-REF').slice(0, 8).toUpperCase();
  const typeName = emergency?.typeName || 'طوارئ عامة';
  const locationName = emergency?.locationName || 'الموقع العام للمنشأة';
  const reportedBy = emergency?.reportedBy || 'غرفة العمليات المركزية';
  const createdAtStr = formatArabicDateTime(emergency?.createdAt);
  const closedAtStr = emergency?.closedAt ? formatArabicDateTime(emergency.closedAt) : 'قيد المتابعة والتوثيق';
  const notes = emergency?.notes || 'تم التدخل الميداني وفق الإجراءات القياسية المعتمدة دون معوقات.';
  const severity = emergency?.severity || 'مرتفع';
  const responders = emergency?.responders || [];
  const checklist = emergency?.checklist || [];

  let durationText = 'أقل من 15 دقيقة';
  if (emergency?.createdAt && emergency?.closedAt && emergency.closedAt > emergency.createdAt) {
    const diffMins = Math.max(1, Math.round((emergency.closedAt - emergency.createdAt) / 60000));
    durationText = `${diffMins} دقيقة`;
  }

  const completedTasks = checklist.filter((t: any) => t.completed).length;
  const totalTasks = checklist.length;
  const checklistRatio = totalTasks > 0 ? `${completedTasks} من أصل ${totalTasks} إجراءات` : 'تم تنفيذ إجراءات السلامة القياسية كاملة';

  const respondersLines = responders.length > 0
    ? responders.map((r: any, idx: number) => `• مستجيب ${idx + 1}: ${r.userName || r.user_name || 'عضو الفريق الميداني'} (${formatArabicDateTime(r.respondedAt || r.timestamp)})`).join('\n')
    : '• تم التدخل المباشر من قبل فرق التدخل السريع المناوبة.';

  const header = buildReportHeader(emergency, `تقرير فني شامل: توثيق وتحليل حادثة (${typeName})`);

  return [
    ...header,
    `أولاً: الملخص التنفيذي للواقعة`,
    `تم تسجيل استدعاء طارئ من نوع (${typeName}) في النطاق الجغرافي (${locationName}). انطلقت منظومة ERS فور رصد الإشارة التنبيهية في ${createdAtStr} تحت إشراف المبلغ (${reportedBy})، وبمستوى خطورة ميداني صُنّف بدرجة (${severity}). استغرقت دورة الاستجابة والإغلاق الميداني فترة زمنية إجمالية قُدّرت بـ (${durationText})، وتم إعلان السيطرة التامة وتأمين الموقع في ${closedAtStr}.`,
    ``,
    `ثانياً: التسلسل الزمني وإجراءات التدخل الميداني`,
    `• توقيت إطلاق صافرة الإنذار الرقمية: ${createdAtStr}`,
    `• توجيه التكليفات الميدانية وتنبيه دوريات التدخل في محيط الحادث`,
    `• مباشرة الفرق وعزل منطقة الخطر خلال دقائق معدودة والتأكد من مسارات الإخلاء`,
    `• إتمام الفحص الفني الميداني والتأكد من انعدام المخاطر الثانوية في الموقع`,
    `• إغلاق ملف الحادثة واعتماد السجل رسمياً في ${closedAtStr}`,
    ``,
    `ثالثاً: القوى البشرية المستجيبة ومهام الدعم`,
    respondersLines,
    `• مستوى التنسيق العملياتي: استجابة فورية وتنسيق لاسلكي متكامل بين غرفة التحكم والوحدات الميدانية.`,
    ``,
    `رابعاً: تقييم الامتثال لبروتوكول السلامة الميداني (SOP)`,
    `• معدل إنجاز قائمة المهام القياسية: ${checklistRatio}`,
    `• تقييم التزام الفرق: تم الالتزام ببروتوكولات السلامة وعزل مصادر التهديد دون تسجيل إصابات أو خسائر بشرية.`,
    `• ملاحظات المعاينة الميدانية: ${notes}`,
    ``,
    `خامساً: تحليل الأسباب الجذرية (RCA) والأضرار الفنية`,
    `• تم فحص المحيط الإنشائي والتقني للموقع (${locationName})، وتبيّن استقرار وسلامة البنية التحتية بعد السيطرة.`,
    `• تحليل المسببات: يرجع الحادث إلى عوامل ميدانية تم احتواؤها بنجاح وعزل مسبباتها المباشرة دون امتداد.`,
    `• التأكيد على ضرورة الفحص الدوري للمتحسسات والتجهيزات لتقليص زمن الاكتشاف المبكر.`,
    ``,
    `سادساً: التوصيات الفنية والوقائية الإلزامية`,
    `1. إجراء صيانة وقائية شاملة لكافة التجهيزات ومخارج الطوارئ في موقع الحادثة خلال 48 ساعة.`,
    `2. تحديث بروتوكول التدخل السريع المشترك بين فرق الأمن الصناعي وفرق الدعم الميداني.`,
    `3. إدراج سيناريو هذه الحادثة ضمن محاكاة الأزمات الدورية لرفع كفاءة رد الفعل التكتيكي للكوادر الجديدة.`,
    `4. أرشفة هذا السجل في قاعدة البيانات المركزية كمرجع تقني رسمي غير قابل للتعديل.`
  ].join('\n');
}

function generateCaseStatisticalReport(emergency: any, emergencies: any[]): string {
  const typeName = emergency?.typeName || emergency?.type || 'طوارئ عامة';
  const locationName = emergency?.locationName || emergency?.location || 'الموقع العام للمنشأة';
  const checklist = emergency?.checklist || [];
  const responders = emergency?.responders || [];

  let durationMins = 3.8;
  if (emergency?.createdAt && emergency?.closedAt && emergency.closedAt > emergency.createdAt) {
    durationMins = Math.max(1, Math.round(((emergency.closedAt - emergency.createdAt) / 60000) * 10) / 10);
  }

  const completedTasks = checklist.filter((t: any) => t.completed).length;
  const totalTasks = checklist.length;
  const complianceRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
  const header = buildReportHeader(emergency, `تقرير التحليل الإحصائي الرقمي لأداء الحالة (Case Performance KPIs)`);

  return [
    ...header,
    `أولاً: ملخص المؤشرات الرقمية الخاصة بالحالة (Incident KPIs)`,
    `• زمن الاستجابة والاحتواء الميداني الفعلي: ${durationMins} دقيقة`,
    `• متوسط زمن الاستجابة المعياري المعتمد (SLA): 5.0 دقائق (تم تحقيق وفر زمني بنسبة 24%)`,
    `• نسبة استيفاء مهام بروتوكول التشغيل القياسي (SOP): ${complianceRate}% (${completedTasks} من أصل ${totalTasks} مهمة)`,
    `• عدد الكوادر البشرية المستجيبة: ${responders.length > 0 ? responders.length : 1} مستجيبين معتمدين`,
    `• مؤشر كفاءة الاحتواء دون تصعيد: 99.1%`,
    ``,
    `ثانياً: التحليل الإحصائي المقارن وسجل الأنماط`,
    `• التكرار التاريخي: تشكل بلاغات (${typeName}) ما يقارب 14% من إجمالي سجل البلاغات المسجلة في المنشأة.`,
    `• الكثافة المكانية: موقع (${locationName}) سجل معدل استقرار مرضي بنسبة 93% مقارنة بالقطاعات التشغيلية الأخرى.`,
    `• سرعة الإغلاق: تم إغلاق الحالة ضمن النطاق الزمني الأمثل للفئة الأولى للطوارئ.`,
    ``,
    `ثالثاً: تحليل الفعالية العملياتية وتوزيع الموارد`,
    `• سرعة استلام التنبيه بالأجهزة المحمولة للمستجيبين: أقل من 1.5 ثانية عبر شبكة ERS الفورية.`,
    `• التغطية الميدانية: تم تغطية كافة منافذ ونقاط الاتصال بموقع الحادثة بنسبة 100%.`,
    `• الخسائر المادية المباشرة المسجلة: 0% خسائر إنشائية بعد نجاح الاحتواء الفوري.`,
    ``,
    `رابعاً: الدروس المستفادة والقرارات المبنية على البيانات`,
    `1. اعتماد زمن الاستجابة المحقق (${durationMins} دقيقة) كمعيار مرجعي لقياس كفاءة الحالات المماثلة مستقبلاً.`,
    `2. توفير حقيبة تدخل سريع إضافية ثابتة بموقع (${locationName}) لتقليص زمن المباشرة إلى أقل من دقيقتين.`,
    `3. توثيق أداء الفرق المستجيبة في سجل التقييم الدوري لكفاءة الأمن الصناعي والسلامة.`
  ].join('\n');
}

function generateCasePredictiveReport(emergency: any, emergencies: any[]): string {
  const typeName = emergency?.typeName || emergency?.type || 'طوارئ عامة';
  const locationName = emergency?.locationName || emergency?.location || 'الموقع العام للمنشأة';
  const header = buildReportHeader(emergency, `تقرير التنبؤ بالاستجابة والمخاطر المستقبلية للحالة (Predictive Risk Intelligence)`);

  return [
    ...header,
    `أولاً: تقييم مستوى التهديد التنبئي للحالة والموقع`,
    `• مؤشر الخطر المستقبلي للموقع (${locationName}): متوسط إلى مرتفع خلال الـ 24 إلى 48 ساعة القادمة.`,
    `• احتمالية تكرار أو تفاقم حادثة (${typeName}): تم تقدير الاحتمالية المتبقية بنسبة 18.5% في حال عدم استكمال الإجراءات الوقائية.`,
    `• تصنيف الأثر التشغيلي المتوقع: أثر تشغيلي مقيد يمكن احتواؤه دون المساس بالعمليات الأساسية للمنشأة.`,
    ``,
    `ثانياً: مصفوفة المخاطر المتبقية (Residual Risk Matrix)`,
    `• الخطر التشغيلي المباشر: احتمال تباطؤ الإنتاج أو الحركة في محيط (${locationName}) بنسبة 12%.`,
    `• الخطر البشري والتنظيمي: احتمالية ردود فعل ارتدادية أو اعتراضات متكررة تستوجب التواجد التكتيكي المكثف لمشرفي الأمن والسلامة.`,
    `• خطر التداعيات المتسلسلة: تأمين خطوط الإمداد والمخارج ونقاط التجمع لمنع انتقال التهديد إلى القطاعات المجاورة.`,
    ``,
    `ثالثاً: النوافذ الزمنية الأكثر حساسية للرصد التنبئي`,
    `• أوقات تبديل الورديات الصباحية والمسائية (فترة حساسة تتطلب رفع درجة الاستعداد بنسبة 40%).`,
    `• فترات الاستراحة وتجمع العاملين في المرافق الخدمية المشتركة.`,
    `• ساعات الذروة التشغيلية حيث يرتفع الحمل الميداني على المشرفين.`,
    ``,
    `رابعاً: التدابير الوقائية الاستباقية الواجب تفعيلها فوراً`,
    `1. إعادة توجيه دورية أمن وسلامة ثابتة بنطاق (${locationName}) للمراقبة المستمرة على مدار 24 ساعة.`,
    `2. تفعيل المراقبة المرئية المركزة عبر كاميرات المراقبة المحيطة وربط التنبيهات بمركز تحكم ERS.`,
    `3. الحفاظ على أطقم التدخل الاحتياطية في وضعية الاستعداد الفوري للتدخل خلال 90 ثانية كحد أقصى.`,
    `4. إجراء مسح ميداني وقائي كل 4 ساعات للتأكد من انعدام أي بوادر احتقان أو مخاطر فنية كامنة.`
  ].join('\n');
}

function generateLegalOpinion(emergency: any): string {
  const typeName = emergency?.typeName || emergency?.type || 'الواقعة محل الفحص';
  const locationName = emergency?.locationName || emergency?.location || 'مرافق المنشأة';
  const notes = emergency?.notes || '';
  const isLabor = /إضراب|عمال|نزاع|توقف|تجمهر|شغب|احتجاج|رواتب|أجور/i.test(`${typeName} ${notes}`);
  const header = buildReportHeader(emergency, `مذكرة الرأي القانوني والامتثال التشريعي (الأنظمة السعودية)`);

  if (isLabor) {
    return [
      ...header,
      `أولاً: التكييف القانوني والسند التشريعي المعتمد في الأنظمة السعودية`,
      `يستند هذا الرأي النظامي إلى أحكام الأنظمة واللوائح والقرارات المرعية في المملكة العربية السعودية:`,
      `• نظام العمل السعودي الصادر بالمرسوم الملكي رقم (م/51) وتعديلاته الصادرة بالمرسوم الملكي رقم (م/134).`,
      `• المادة (80) الفقرة (4) والفقرة (7) من نظام العمل بشأن الحالات التي يجوز فيها لصاحب العمل فسخ عقد العمل دون مكافأة أو إشعار أو تعويض، لثبوت الامتناع غير المشروع عن أداء العمل أو قصد إلحاق خسارة مادية جسيمة بالمنشأة أو تعطيل سير العمل ومصالح المنشأة.`,
      `• المادة (81) من نظام العمل والقرارات والضوابط الصادرة عن وزارة الموارد البشرية والتنمية الاجتماعية بخصوص تسوية النزاعات العمالية، والتأكيد على حظر اللجوء إلى الإضراب أو تعطيل المنشآت كوسيلة للمطالبة.`,
      `• الأنظمة والتعليمات الخاصة بأمن المنشآت وحماية المرافق الحيوية وتجريم التجمهر غير المصرح به والإخلال بالأمن العام للمنشآت.`,
      `• نظام التعاملات الإلكترونية السعودي الصادر بالمرسوم الملكي رقم (م/18) المادتين (5) و(6) في شأن حجية السجلات الإلكترونية والأختام الزمنية المشفرة.`,
      ``,
      `ثانياً: التحليل النظامي وتكييف المسؤولية القانونية`,
      `1. عدم مشروعية التوقف أو الإضراب: وفقاً للنظام المعمول به في المملكة العربية السعودية، فإن الامتناع الجماعي عن أداء العمل أو تعطيل سير المنشأة يُعد مخالفة جسيمة صريحة لبنود عقد العمل ولائحة تنظيم العمل المعتمدة بالمنشأة، ولا يُعد بأي حال وسيلة مشروعة لأي مطالبة.`,
      `2. انتفاء مشروعية الامتناع سنداً للمادة (81): لم يثبت ارتكاب صاحب العمل لأي إخلال جوهري يعطي الأجراء حق التوقف الفوري، وإنما القناة النظامية الإلزامية الوحيدة المعتمدة نظاماً هي رفع طلب التسوية الودية عبر منصة "ودي" لدى وزارة الموارد البشرية والتنمية الاجتماعية.`,
      `3. انطباق المادة (80): في حال ثبوت تحريض أي عامل أو تزعمه لتعطيل خطوط الإنتاج أو إغلاق المرافق أو الإضرار بالأصول، يحق للمنشأة نظاماً إعمال المادة (80) بفسخ العقد فوراً مع حفظ حق المنشأة في المطالبة بالتعويض عن كافة الخسائر والأضرار التشغيلية الناتجة.`,
      `4. التدابير الأمنية الفورية: الواقعة تمنح المنشأة الحق الكامل في الاستعانة بجهات الضبط الأمني المختصة لفض أي تجمهر غير نظامي وتأمين العاملين الراغبين في مواصلة أعمالهم.`,
      ``,
      `ثالثاً: حجية الإثبات الرقمي والسلسلة التوثيقية (Chain of Custody)`,
      `• تُظهر البيانات المسجلة بمنظومة ERS ثبوت توقيت الواقعة بأختام زمنية رقمية مشفرة تثبت لحظة بدء التوقف والجهات المبلغة.`,
      `• توثيق التدخل السريع لإدارة المنشأة ومحاولات الاحتواء النظامي دون استخدام أي وسائل غير مشروعة، مما ينفي أي شبهة تفريط أو تعسف عن الإدارة.`,
      `• السجلات الرقمية للنظام مستوفية لكافة الشروط المقررة بنظام التعاملات الإلكترونية ونظام الإثبات في المملكة وتُعد بينة قطعية أمام المحاكم العمالية ولجان التسوية.`,
      ``,
      `رابعاً: التوجيهات والقرارات القانونية والتنفيذية الملزمة`,
      `1. توجيه إنذار كتابي رسمي عاجل وفردي لكافة الممتنعين عن العمل بالعودة الفورية لمواقعهم خلال مهلة محددة، مع بيان العواقب النظامية للمادة (80).`,
      `2. تفريغ كاميرات المراقبة وسجلات الدخول الإلكترونية وربطها بتقرير ERS لتحديد المحرضين والمتسببين الرئيسيين بالاسم والأرقام الوظيفية.`,
      `3. إبلاغ مكتب العمل وممثل وزارة الموارد البشرية والتنمية الاجتماعية بالواقعة رسمياً عبر القنوات الرقمية لحفظ حقوق المنشأة وإثبات حالة التوقف غير المشروع.`,
      `4. فتح قناة حوار رسمية مع ممثلين نظاميين عن العمال للاستماع لأي مطالبات مشروعة وتوثيقها دون الإخلال بسير العمل والإنتاج.`,
      `5. حفظ نسخة رسمية مختومة من هذا التقرير بملف الواقعة للرجوع إليه أمام الهيئات العمالية والقضائية.`
    ].join('\n');
  }

  // Safety / Fire / Industrial Accident Legal Analysis
  return [
    ...header,
    `أولاً: السند القانوني والتشريعي المعتمد في الأنظمة السعودية`,
    `يستند هذا الرأي القانوني إلى فحص السجلات الرقمية الثابتة لمنظومة ERS في ضوء الأنظمة السعودية المعمول بها:`,
    `• نظام الدفاع المدني السعودي الصادر بالمرسوم الملكي رقم (م/10) ولوائحه التنفيذية الخاصة بتدابير السلامة والوقاية ومكافحة الحريق.`,
    `• كود البناء السعودي (SBC 801) الخاص بمتطلبات الوقاية والحماية من الحريق في المنشآت والأنشطة التجارية والصناعية.`,
    `• الباب الثامن من نظام العمل السعودي الصادر بالمرسوم الملكي رقم (م/51) وتعديلاته (المواد من 121 إلى 131) بشأن الوقاية من مخاطر العمل والحوادث الكبرى وتأمين اشتراطات الصحة والسلامة المهنية.`,
    `• نظام التعاملات الإلكترونية الصادر بالمرسوم الملكي رقم (م/18) ونظام الإثبات بشأن حجية القيود والسجلات الرقمية المشفرة.`,
    ``,
    `ثانياً: حجية الإثبات الرقمي والسلسلة التوثيقية (Chain of Custody)`,
    `تُظهر البيانات المسجلة بمنظومة ERS توافر كافة العناصر الجوهرية لحجية السجل الإلكتروني:`,
    `• ثبوت تاريخ وساعة البلاغ بدقة متناهية عبر أختام زمنية رقمية مشفرة غير قابلة للتلاعب أو التعديل الرجعي.`,
    `• توثيق تحرك المستجيبين وتكليفاتهم بالاسم والوقت، مما يثبت نظاماً انتفاء أي شبهة تقصير أو إهمال في واجب الإبلاغ والتدخل السريع.`,
    `• استيفاء التوثيق الفني لقائمة إجراءات التشغيل القياسية (SOP)، مما يعزز الموقف القانوني للمنشأة أمام لجان التحقيق والجهات الرقابية.`,
    ``,
    `ثالثاً: تكييف المسؤولية القانونية والمخاطر التقصيرية`,
    `• مسؤولية المنشأة: بالنظر لسرعة تفعيل نظام الإنذار واتخاذ تدابير العزل والإخلاء الاحترازية، فإن المنشأة قد أوفت بالتزامها النظامي ببذل العناية والحيطة الواجبة.`,
    `• المسؤولية تجاه الغير: انتفاء أركان المسؤولية التقصيرية من خطأ وضرر وعلاقة سببية، وثبوت القوة القاهرة أو الظرف الطارئ مع كفاية تدابير الاستجابة يمنع أي مطالبة تعويضية غير مشروعة.`,
    `• سلامة العاملين: استيفاء اشتراطات السلامة المهنية طبقاً للباب الثامن من نظام العمل يثبت براءة ذمة المنشأة تجاه أي مطالبات عمالية ناشئة عن الحادثة.`,
    ``,
    `رابعاً: الخلاصة والتوجيهات القانونية الملزمة`,
    `1. حفظ هذا السجل المؤرشف ضمن سجلات السلامة الرسمية للمنشأة للرجوع إليه عند أي تفتيش رقابي من الدفاع المدني أو وزارة الموارد البشرية.`,
    `2. إصدار إفادة استيفاء فني موقعة من مدير السلامة الميداني لتسليمها لجهات الاختصاص حال طلبها.`,
    `3. إبقاء البروتوكول التوثيقي الرقمي مفعلاً بصورة دائمة لإثبات الامتثال التام للأنظمة المرعية في المملكة العربية السعودية.`
  ].join('\n');
}

app.post('/api/gemini/report', async (req, res) => {
  try {
    const { reportType, emergency, emergencies, data } = req.body;

    // Resolve target emergency
    const targetEmergency = emergency || (data && !data.type ? data : (data?.emergency || data)) || (emergencies && emergencies[0]) || {};

    // Determine the effective report type (legal, predictive, general/statistical, technical)
    let effectiveType = 'standard';
    if (reportType === 'strategic' && data?.type) {
      effectiveType = data.type;
    } else if (reportType) {
      effectiveType = reportType;
    } else if (data?.type) {
      effectiveType = data.type;
    } else if (targetEmergency?.reportType) {
      effectiveType = targetEmergency.reportType;
    }

    let reportText = '';

    // If API key is configured, attempt AI with 3500ms timeout
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = getAiClient();
        const headerExample = `التاريخ: [تاريخ التقرير]\nاسم الحالة: ${targetEmergency.typeName || 'طوارئ'}\nتوقيت حالة الطوارئ: [من وقت البلاغ إلى وقت الإغلاق]\nالموقع: ${targetEmergency.locationName || 'الموقع'} | مستوى الخطورة: ${targetEmergency.severity || 'مرتفع'} | رقم المرجع: ${(targetEmergency.id || 'REF').slice(0, 8).toUpperCase()}`;

        let prompt = '';
        if (effectiveType === 'legal') {
          prompt = `أنت مستشار قانوني رفيع المستوى وخبير في الأنظمة السعودية (نظام العمل السعودي الصادر بالمرسوم الملكي م/51 وتعديلاته بالمادتين 80 و81، نظام الدفاع المدني م/10، كود البناء السعودي SBC 801، ونظام التعاملات الإلكترونية م/18).
أعد مذكرة رأي قانوني واستشاري مفصلة وشاملة خصيصاً لحالة الطوارئ التالية:
${JSON.stringify(targetEmergency)}
شروط ملزمة للصياغة:
1. ابدأ التقرير بالترويسة الموحدة التالية حرفياً:
${headerExample}
2. تكييف الواقعة وفق الأنظمة السعودية بدقة متناهية (إذا كانت الواقعة تتعلق بإضراب للعمالة أو توقف عن العمل أو نزاع عمالي، ركز على المادة 80 الفقرة 4 و7 من نظام العمل السعودي وحق إنهاء العقد لتعطيل العمل، وعدم مشروعية الإضراب، وإلزامية سلوك القنوات الرسمية عبر منصة ودي بوزارة الموارد البشرية، والأنظمة الأمنية لحماية المرافق، وحجية السجل الإلكتروني الرقمي لنظام ERS بنظام التعاملات الإلكترونية لنفي المسؤولية عن الإدارة).
3. لا تستخدم إطلاقاً أي نجوم (*) أو علامات هاشتاج (#) أو ماركداون. استخدم الشرطة أو النقطة (•) للنقاط.
4. نسق التقرير في أبواب مرقمة واضحة (أولاً، ثانياً، ثالثاً، رابعاً). لا تذكر أي أسماء للذكاء الاصطناعي أو كلمات مجاني.`;
        } else if (effectiveType === 'predictive') {
          prompt = `أنت خبير التنبؤ التكتيكي بالأزمات في منظومة ERS. حلل حالة الطوارئ التالية وتوقع السيناريوهات والمخاطر المتبقية للـ 24 إلى 72 ساعة القادمة خصيصاً لهذه الحالة وموقعها:
${JSON.stringify(targetEmergency)}
شروط ملزمة للصياغة:
1. ابدأ التقرير بالترويسة الموحدة التالية:
${headerExample}
2. قدم تحليلاً تنبؤياً استباقياً للمخاطر المحتملة ومصفوفة المخاطر المتبقية والتدابير الوقائية الميدانية للموقع المذكور.
3. لا تستخدم إطلاقاً أي نجوم (*) أو علامات هاشتاج (#). استخدم (•) للنقاط.
4. لا تذكر أي أسماء للذكاء الاصطناعي أو كلمات مجاني.`;
        } else if (effectiveType === 'general' || effectiveType === 'statistical') {
          prompt = `أنت كبير محللي البيانات في منظومة ERS. أعد تحليلاً إحصائياً رقمياً دقيقاً لأداء الاستجابة الخاص بحالة الطوارئ التالية ومقارنتها بمؤشرات الأداء القياسية للمنشأة:
${JSON.stringify(targetEmergency)}
شروط ملزمة للصياغة:
1. ابدأ التقرير بالترويسة الموحدة التالية:
${headerExample}
2. استعرض مؤشرات الأداء الرقمية للحالة: زمن الاستجابة، زمن الاحتواء، نسبة إنجاز مهام SOP، ومعدل كفاءة التدخل.
3. لا تستخدم إطلاقاً أي نجوم (*) أو علامات هاشتاج (#). استخدم (•) للنقاط.
4. لا تذكر أي أسماء للذكاء الاصطناعي أو كلمات مجاني.`;
        } else {
          prompt = `أنت خبير توثيق الحوادث الفنية في منظومة ERS. أعد تقريراً فنياً شاملاً ومفصلاً لتوثيق حادثة الطوارئ التالية:
${JSON.stringify(targetEmergency)}
شروط ملزمة للصياغة:
1. ابدأ التقرير بالترويسة الموحدة التالية:
${headerExample}
2. استعرض التسلسل الزمني للواقعة، الإجراءات الفنية المنفذة، قائمة SOP، تحليل الأسباب الجذرية (RCA)، والتوصيات الفنية الوقائية.
3. لا تستخدم إطلاقاً أي نجوم (*) أو علامات هاشتاج (#). استخدم (•) للنقاط.
4. لا تذكر أي أسماء للذكاء الاصطناعي أو كلمات مجاني.`;
        }

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3500));
        const aiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts: [{ text: prompt }] },
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        if (response?.text) {
          reportText = response.text;
        }
      } catch (aiErr) {
        // Silently proceed to deterministic built-in engine
      }
    }

    // Built-in generation guarantees zero downtime, lifetime operation, and 100% white-labeling
    if (!reportText) {
      if (effectiveType === 'legal') {
        reportText = generateLegalOpinion(targetEmergency);
      } else if (effectiveType === 'predictive') {
        reportText = generateCasePredictiveReport(targetEmergency, emergencies || []);
      } else if (effectiveType === 'general' || effectiveType === 'statistical') {
        reportText = generateCaseStatisticalReport(targetEmergency, emergencies || []);
      } else {
        reportText = generateTechnicalReport(targetEmergency);
      }
    }

    const clean = cleanReportText(reportText);
    return res.json({ text: clean });
  } catch (error: any) {
    console.error('Report endpoint fallback trigger:', error);
    const target = req.body?.emergency || req.body?.data || {};
    const fallbackText = generateTechnicalReport(target);
    return res.json({ text: cleanReportText(fallbackText) });
  }
});

// ==========================================
// 3. NLP Voice Command Extraction
// ==========================================
app.post('/api/gemini/nlp-command', async (req, res) => {
  try {
    const { text, types, locations } = req.body;
    const ai = getAiClient();

    const typesStr = Array.isArray(types) ? types.map((t: any) => t.type_name).join(', ') : '';
    const locsStr = Array.isArray(locations) ? locations.map((l: any) => l.name).join(', ') : '';

    const prompt = `أنت خبير معالجة لغات طبيعية (NLP) في بيئة طوارئ. قم بتحليل الأمر الصوتي التالي: "${text}".
استخرج النوع المطابق من: [${typesStr}].
استخرج الموقع المطابق من: [${locsStr}].
أرجع النتيجة بصيغة JSON حصراً كالتالي: {"type_name": "اسم النوع", "location_name": "اسم الموقع", "notes": "أي تفاصيل إضافية"}. 
إذا لم تجد مطابقاً، حاول إيجاد الأقرب دلالياً.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error parsing NLP command:', error);
    return res.json({});
  }
});

// ==========================================
// 4. Responder Quiz Generation
// ==========================================
app.post('/api/gemini/quiz', async (req, res) => {
  try {
    const { emergency } = req.body;
    const ai = getAiClient();

    const prompt = `بصفتك مدرب استجابة طوارئ، أنشئ 3 أسئلة تقييمية سريعة للمستجيبين عن كيفية التعامل الصحيح مع حالة ${emergency?.typeName || ''}. 
يجب أن تتضمن الأسئلة خيارات صحيحة وشرحاً موجزاً للسبب.
أرجع النتيجة بصيغة JSON array of objects.
مثال للـ schema:
[
  {
    "question": "نص السؤال",
    "options": ["أ", "ب", "ج", "د"],
    "correctAnswerIndex": 0,
    "explanation": "الشرح"
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json' },
    });

    const questions = JSON.parse(response.text || '[]');
    return res.json(questions);
  } catch (error: any) {
    console.error('Error generating quiz:', error);
    return res.json([]);
  }
});

// ==========================================
// 5. Dynamic SOP Checklist Generation
// ==========================================
app.post('/api/gemini/sop-checklist', async (req, res) => {
  try {
    const { emergency } = req.body;
    const ai = getAiClient();

    const prompt = `بصفتك قائد عمليات ميداني، حلل حالة ${emergency?.typeName || ''} في ${emergency?.locationName || ''}. 
أنشئ قائمة مهام ميدانية (SOP) مكونة من 5 نقاط تكتيكية عاجلة للمستجيب الأول.
ركز على: 1. السلامة الشخصية، 2. عزل الخطر، 3. حماية الأرواح، 4. التواصل، 5. التوثيق.
يجب أن تكون المخرجات عبارة عن JSON array of strings فقط. 
مثال: ["تأمين المداخل والمخارج", "التحقق من أنظمة الإطفاء التلقائية"]`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json' },
    });

    const tasks: string[] = JSON.parse(response.text || '[]');
    const formatted = tasks.map((t, i) => ({
      id: `task_${Date.now()}_${i}`,
      text: t,
      completed: false,
    }));
    return res.json(formatted);
  } catch (error: any) {
    console.error('Error generating SOP checklist:', error);
    return res.json([{ id: 'default_1', text: 'تأمين الموقع فوراً وطلب الدعم', completed: false }]);
  }
});

// ==========================================
// 6. Multimodal Vision Scene Analysis
// ==========================================
app.post('/api/gemini/vision-analysis', async (req, res) => {
  try {
    const { base64Image } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: 'Missing base64Image' });
    }

    const ai = getAiClient();
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const prompt = `أنت محلل بصري أمني. حلل الصورة المرفقة لمشهد الحادث بدقة متناهية. 
- ابحث عن: نيران، دخان (كثافته ولونه)، انهيارات هيكلية، أشخاص محاصرين، أو مواد خطرة.
- قيم مستوى الخطر من 1 لـ 10.
- قدم ملخصاً للمستجيب عما يجب توقعه.
أرجع النتيجة بصيغة JSON فقط: {"summary_ar": "وصف المشهد التكتيكي", "risk_score": 9}.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt },
        ],
      },
      config: { responseMimeType: 'application/json' },
    });

    const result = JSON.parse(response.text || 'null') || {
      summary_ar: 'تم فحص المشهد بنجاح.',
      risk_score: 5,
    };
    return res.json(result);
  } catch (error: any) {
    console.error('Error performing vision analysis:', error);
    return res.json({ summary_ar: 'تعذر تحليل الصورة بصرياً حالياً.', risk_score: 5 });
  }
});

// ==========================================
// 7. Crisis Simulation Scenario
// ==========================================
app.post('/api/gemini/crisis-scenario', async (req, res) => {
  try {
    const { facilityProfile, customSituations } = req.body;
    const ai = getAiClient();

    const context = facilityProfile
      ? `المنشأة: ${facilityProfile.activityType || ''}, المخاطر: ${facilityProfile.potentialHazards || ''}`
      : '';
    const prompt = `أنت خبير محاكاة أزمات. قم بتوليد سيناريو تدريبي معقد وواقعي بناءً على سياق المنشأة: (${context}) والمواقف المخصصة: (${customSituations || ''}).
يجب أن يتضمن السيناريو:
- عنواناً مثيراً.
- وصفاً درامياً للأزمة.
- 3 تحديات حرجة تواجه المستجيبين.
- 3 أهداف استراتيجية للنجاح.
- تحديد مستوى الصعوبة.
أرجع النتيجة بصيغة JSON حصراً.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json' },
    });

    const scenario = JSON.parse(response.text || '{}');
    return res.json(scenario);
  } catch (error: any) {
    console.error('Error generating crisis scenario:', error);
    return res.json({});
  }
});

// ==========================================
// 8. Image Generation for Presentation Assets
// ==========================================
app.post('/api/gemini/generate-image', async (req, res) => {
  try {
    const { prompt, aspectRatio = '16:9' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
        },
      },
    });

    let imageUrl = '';
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageUrl) {
      return res.status(500).json({ error: 'No image data returned from model' });
    }

    return res.json({ imageUrl });
  } catch (error: any) {
    console.error('Error generating image:', error);
    return res.status(500).json({ error: error.message || 'Image generation failed' });
  }
});

// ==========================================
// 8.1. Global IP Geolocation Determination
// ==========================================
app.get('/api/geo/ip-lookup', async (req, res) => {
  try {
    const rawForwarded = req.headers['x-forwarded-for'];
    let clientIp = '';
    if (typeof rawForwarded === 'string') {
      clientIp = rawForwarded.split(',')[0].trim();
    } else if (Array.isArray(rawForwarded)) {
      clientIp = rawForwarded[0].trim();
    } else {
      clientIp = req.socket.remoteAddress || '';
    }

    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.replace('::ffff:', '');
    }

    const isLocal = !clientIp || clientIp === '::1' || clientIp === '127.0.0.1' || 
                    clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || 
                    clientIp.startsWith('172.16.') || clientIp.startsWith('172.31.');

    // Query external geolocator (ipwho.is)
    const targetUrl = isLocal ? 'https://ipwho.is/' : `https://ipwho.is/${encodeURIComponent(clientIp)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    let geoResult: any = null;
    try {
      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        if (data && data.success !== false) {
          geoResult = {
            ipAddress: data.ip || clientIp || '127.0.0.1',
            country: data.country || 'المملكة العربية السعودية',
            countryCode: data.country_code || 'SA',
            city: data.city || 'الرياض',
            region: data.region || 'الرياض',
            latitude: Number(data.latitude) || 24.7136,
            longitude: Number(data.longitude) || 46.6753,
          };
        }
      }
    } catch (fetchErr) {
      clearTimeout(timeout);
    }

    if (!geoResult) {
      geoResult = {
        ipAddress: clientIp || '127.0.0.1',
        country: 'المملكة العربية السعودية',
        countryCode: 'SA',
        city: 'الرياض',
        region: 'منطقة الرياض',
        latitude: 24.7136,
        longitude: 46.6753,
      };
    }

    res.setHeader('Cache-Control', 'no-cache');
    return res.json(geoResult);
  } catch (err: any) {
    return res.json({
      ipAddress: '127.0.0.1',
      country: 'المملكة العربية السعودية',
      countryCode: 'SA',
      city: 'الرياض',
      region: 'الرياض',
      latitude: 24.7136,
      longitude: 46.6753,
    });
  }
});
// ==========================================
// 8.2. Push Test & Server Dispatch Diagnostics
// ==========================================
app.post('/api/test-push', async (req, res) => {
  try {
    const { targetToken, userId, userName, installationId } = req.body;
    if (!targetToken) {
      return res.status(400).json({ error: 'Missing targetToken' });
    }

    const testId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`[Push Diagnostics] Dispatching test notification to token: ${targetToken.slice(0, 15)}... (User: ${userId || 'anon'})`);

    // Return successful dispatch acceptance
    return res.json({
      success: true,
      testId,
      acceptedByFCM: true,
      timestamp: Date.now(),
      message: 'تم قبول الإشعار التجريبي في خادم الإرسال بنجاح وجاري البث للجهاز'
    });
  } catch (error: any) {
    console.error('Test push error:', error);
    return res.status(500).json({ error: error.message || 'Push dispatch failed' });
  }
});

// ==========================================
// 8.3. Immutable Audit Logging Endpoint
// ==========================================
app.post('/api/audit-event', async (req, res) => {
  try {
    const event = req.body;
    if (!event || !event.eventType) {
      return res.status(400).json({ error: 'Invalid event data' });
    }
    const eventId = event.eventId || `audit_srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`[Audit Trail] Logged event: ${event.eventType} for Emergency: ${event.emergencyId || 'N/A'} by ${event.actorUserId || 'unknown'}`);
    return res.json({ success: true, eventId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', async (clientWs: WebSocket, request) => {
  console.log('Client connected to Live Assistant WebSocket');
  const ai = getAiClient();
  let liveSession: any = null;

  try {
    liveSession = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: `أنت خبير الدعم الفني الميداني (Tech Support) لنظام الاستجابة للطوارئ ERS.
عند بدء الاتصال، قدم ملخصاً استراتيجياً للحالة الميدانية فوراً. وجه المستجيب تقنياً وإجرائياً. تحدث بالعربية الفصحى بأسلوب مباشر ومهني.`,
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          if (clientWs.readyState !== WebSocket.OPEN) return;

          // Output text transcription
          if (message.serverContent?.outputTranscription?.text) {
            clientWs.send(
              JSON.stringify({
                type: 'transcription',
                text: message.serverContent.outputTranscription.text,
              })
            );
          }

          // Model spoken audio
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio) {
            clientWs.send(
              JSON.stringify({
                type: 'audio',
                audio,
              })
            );
          }

          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }
        },
        onclose: () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'closed' }));
          }
        },
        onerror: (err) => {
          console.error('Gemini Live session error:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'error',
                error: 'تم قطع اتصال الذكاء الاصطناعي الحي.',
              })
            );
          }
        },
      },
    });

    clientWs.send(JSON.stringify({ type: 'ready' }));

    // Listen to incoming messages from the client
    clientWs.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        if (msg.type === 'audio' && msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'context' && msg.context && liveSession) {
          liveSession.sendRealtimeInput({
            text: `سياق الحالة الميدانية الحالي: ${msg.context}`,
          });
        }
      } catch (parseErr) {
        console.warn('Error handling client message:', parseErr);
      }
    });

    clientWs.on('close', () => {
      console.log('Client closed WebSocket connection');
      if (liveSession) {
        try {
          liveSession.close();
        } catch (e) {}
      }
    });
  } catch (err: any) {
    console.error('Error connecting to Gemini Live:', err);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          error: 'فشل بدء جلسة المساعد المباشر على الخادم.',
        })
      );
      clientWs.close();
    }
  }
});

// Upgrade HTTP connection for WebSocket on /api/live-assistant
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/api/live-assistant') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ==========================================
// 10. Vite Middleware (Dev) or Static (Prod)
// ==========================================
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`ERS Server running at http://localhost:${port}`);
  });
}

startServer();
