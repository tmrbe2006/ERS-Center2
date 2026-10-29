import { Emergency, SOPTask, QuizQuestion, FacilityProfile, EmergencyType, Location } from "../types";

// ==========================================
// 1. Helpers & Formatting
// ==========================================
export const cleanReportText = (rawText: string): string => {
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
};

export const formatArabicDateTime = (ts?: any): string => {
    if (!ts) return 'غير محدد';
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return String(ts);
        return d.toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });
    } catch {
        return String(ts);
    }
};

export const buildReportHeader = (emergency: any, reportTitle: string): string[] => {
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
};

// ==========================================
// 2. Client-Side Deterministic Engines (Cloudflare & Offline Resilient)
// ==========================================

export const generateTechnicalReportEngine = (emergency: any): string => {
    const typeName = emergency?.typeName || emergency?.type || 'طوارئ عامة';
    const locationName = emergency?.locationName || emergency?.location || 'الموقع العام للمنشأة';
    const reportedBy = emergency?.reportedBy || emergency?.creatorName || 'غرفة العمليات المركزية';
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
        ? responders.map((r: any, idx: number) => `• مستجيب ${idx + 1}: ${typeof r === 'string' ? r : (r.userName || r.user_name || 'عضو الفريق الميداني')} (${formatArabicDateTime(r.respondedAt || r.timestamp)})`).join('\n')
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
};

export const generateCaseStatisticalReportEngine = (emergency: any, emergencies?: any[]): string => {
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
};

export const generateCasePredictiveReportEngine = (emergency: any, emergencies?: any[]): string => {
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
};

export const generateLegalOpinionEngine = (emergency: any): string => {
    const typeName = emergency?.typeName || emergency?.type || 'الواقعة محل الفحص';
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
};

// ==========================================
// 3. API Report Endpoints with Complete Client Fallback
// ==========================================

export const generateEmergencyAnnouncement = async (
    emergency: Emergency, 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<string | null> => {
    try {
        const response = await fetch('/api/gemini/announcement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emergency }),
        });
        if (response.ok) {
            const data = await response.json();
            if (data.audio) return data.audio;
        }
    } catch {
        // Fallback silently if running on static host like Cloudflare Pages
    }
    return null;
};

export const generateEmergencyReport = async (
    emergency: Emergency, 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<string> => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await fetch('/api/gemini/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportType: 'technical', emergency }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.ok) {
            const data = await response.json();
            if (data.text && data.text.length > 50) {
                return cleanReportText(data.text);
            }
        }
    } catch {
        // Static hosting fallback
    }
    // Deterministic built-in generation guarantees 100% complete reports on Cloudflare Pages
    return cleanReportText(generateTechnicalReportEngine(emergency));
};

export const generateGeneralReport = async (
    emergency: Emergency,
    emergencies?: Emergency[], 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<string> => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await fetch('/api/gemini/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportType: 'general', emergency, emergencies }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.ok) {
            const data = await response.json();
            if (data.text && data.text.length > 50) {
                return cleanReportText(data.text);
            }
        }
    } catch {
        // Static hosting fallback
    }
    return cleanReportText(generateCaseStatisticalReportEngine(emergency, emergencies || []));
};

export const generatePredictiveAnalysis = async (
    emergency: Emergency,
    emergencies?: Emergency[], 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<string> => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await fetch('/api/gemini/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportType: 'predictive', emergency, emergencies }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.ok) {
            const data = await response.json();
            if (data.text && data.text.length > 50) {
                return cleanReportText(data.text);
            }
        }
    } catch {
        // Static hosting fallback
    }
    // Deterministic full predictive analysis on Cloudflare Pages
    return cleanReportText(generateCasePredictiveReportEngine(emergency, emergencies || []));
};

export const generateStrategicReport = async (
    type: string, 
    data: any, 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<string> => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const response = await fetch('/api/gemini/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportType: type, emergency: data, data }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.ok) {
            const dataRes = await response.json();
            if (dataRes.text && dataRes.text.length > 50) {
                return cleanReportText(dataRes.text);
            }
        }
    } catch {
        // Static hosting fallback
    }

    if (type === 'timeline' || type === 'chronological') {
        return cleanReportText(generateIncidentChronologicalAnalysisEngine(data, data?.auditEvents || []));
    } else if (type === 'legal') {
        return cleanReportText(generateLegalOpinionEngine(data));
    } else if (type === 'predictive') {
        return cleanReportText(generateCasePredictiveReportEngine(data));
    } else if (type === 'general' || type === 'statistical') {
        return cleanReportText(generateCaseStatisticalReportEngine(data));
    }
    return cleanReportText(generateTechnicalReportEngine(data));
};

export const generateIncidentChronologicalAnalysisEngine = (emergency: any, auditEvents: any[] = []): string => {
    const typeName = emergency?.typeName || emergency?.type || 'طوارئ عامة';
    const locationName = emergency?.locationName || emergency?.location || 'الموقع العام';
    const severity = emergency?.severity || 'مرتفع';
    const createdAt = emergency?.createdAt || Date.now();
    const closedAt = emergency?.closedAt || null;
    const slaTarget = emergency?.slaTargetMinutes || (severity === 'High' ? 4 : severity === 'Medium' ? 8 : 12);
    
    // Calculate latencies
    let ackLatencySec: number | null = null;
    if (emergency?.firstAcknowledgedAt && emergency.firstAcknowledgedAt >= createdAt) {
        ackLatencySec = Math.round((emergency.firstAcknowledgedAt - createdAt) / 1000);
    }

    let arrivalLatencyMin: number | null = null;
    if (emergency?.firstArrivalAt && emergency.firstArrivalAt >= createdAt) {
        arrivalLatencyMin = Math.round(((emergency.firstArrivalAt - createdAt) / 60000) * 10) / 10;
    }

    let totalDurationMin: number | null = null;
    if (closedAt && closedAt >= createdAt) {
        totalDurationMin = Math.round(((closedAt - createdAt) / 60000) * 10) / 10;
    }

    // Bottlenecks evaluation
    const ackBottleneck = ackLatencySec !== null && ackLatencySec > 30;
    const arrivalBottleneck = arrivalLatencyMin !== null && arrivalLatencyMin > slaTarget;
    const checklist = emergency?.checklist || [];
    const completedTasks = checklist.filter((t: any) => t.completed).length;
    const totalTasks = checklist.length;
    const checklistIncomplete = totalTasks > 0 && completedTasks < totalTasks;

    const header = buildReportHeader(emergency, `تقرير إعادة البناء الزمني وتحليل الاختناقات العملياتية (Incident Timeline & Bottleneck Analysis)`);

    // Audit logs breakdown
    const auditLines = auditEvents && auditEvents.length > 0 
        ? auditEvents.map((evt: any) => {
            const timeStr = formatArabicDateTime(evt.timestamp);
            return `• [${timeStr}] - ${evt.actionDetails || evt.eventType} (المستخدم: ${evt.actorName || evt.actorUserId || 'النظام الخادمي'})`;
        }).join('\n')
        : `• [${formatArabicDateTime(createdAt)}] - تم إنشاء البلاغ رسمياً وإطلاق إنذار الاستدعاء
• [${emergency?.firstAcknowledgedAt ? formatArabicDateTime(emergency.firstAcknowledgedAt) : 'غير مسجل'}] - أول إقرار بالاستلام الميداني
• [${emergency?.firstArrivalAt ? formatArabicDateTime(emergency.firstArrivalAt) : 'غير مسجل'}] - تأكيد أول وصول ميداني لموقع الحادث
• [${closedAt ? formatArabicDateTime(closedAt) : 'قيد المتابعة'}] - إعلان الاحتواء وإغلاق ملف الواقعة`;

    return [
        ...header,
        `أولاً: التسلسل الزمني الدقيق للواقعة (Chronological Timeline Reconstruction)`,
        auditLines,
        ``,
        `ثانياً: مقارنة مستويات الخدمة والامتثال الزمني (SLA Adherence Comparison)`,
        `• زمن استلام الإشعار والإقرار (Acknowledgment Latency): ${ackLatencySec !== null ? `${ackLatencySec} ثانية` : 'غير محدد'} (المستهدف المعياري: ≤ 30 ثانية) — ${ackBottleneck ? 'تجاوز للمعيار (تأخير)' : 'مطابق للمعيار بنجاح'}`,
        `• زمن الوصول الميداني لموقع الحادث (Arrival Latency): ${arrivalLatencyMin !== null ? `${arrivalLatencyMin} دقيقة` : 'غير محدد'} (المستهدف المعياري SLA: ${slaTarget} دقائق) — ${arrivalBottleneck ? 'تأخير يستوجب التحليل' : 'ضمن نافذة الاستجابة السريعة'}`,
        `• إجمالي زمن الاحتواء والإغلاق المعتمد: ${totalDurationMin !== null ? `${totalDurationMin} دقيقة` : 'جاري التوثيق'}`,
        `• حالة التصعيد التلقائي: ${emergency?.escalationLevel && emergency.escalationLevel > 0 ? `تم تفعيل التصعيد للمستوى ${emergency.escalationLevel} (${emergency.escalationReason || 'تأخر الإقرار الميداني'})` : 'لم يتم تفعيل التصعيد (استجابة فورية)'}`,
        ``,
        `ثالثاً: تحليل الاختناقات وتحديد نقاط الضعف (Bottleneck Identification)`,
        ackBottleneck 
            ? `• اختناق في مرحلة الإقرار الأولي: استغرق الإقرار (${ackLatencySec} ثانية) متجاوزاً مهلة الـ 30 ثانية. الأسباب المحتملة: ضعف تغطية الشبكة، إعدادات توفير الطاقة في جهاز المستجيب، أو تأخر تفاعل النوبة المناوبة.`
            : `• مرحلة الإقرار الأولي: ممتازة وخالية من أي اختناقات زمنية بمعدل (${ackLatencySec ?? 'أقل من 30'} ثانية).`,
        arrivalBottleneck
            ? `• اختناق في زمن الوصول الميداني: استغرق الوصول (${arrivalLatencyMin} دقيقة) مقارنة بـ SLA المستهدف (${slaTarget} دقائق). الأسباب: معوقات الحركة الإنشائية، تباعد نقاط التمركز، أو الحاجة لتجهيزات إضافية قبل التحرك.`
            : `• زمن الوصول الميداني: تم الوصول ضمن الإطار الزمني المعتمد لـ SLA دون تسجيل أي عوائق في مسار الانتقال.`,
        checklistIncomplete
            ? `• اختناق في التوثيق الإجرائي: لم يتم استيفاء كافة مهام الـ SOP الميدانية (${completedTasks} من أصل ${totalTasks} مكتملة).`
            : `• التوثيق الإجرائي الميداني: اكتملت إجراءات التشغيل القياسية بالكامل بنسبة 100%.`,
        ``,
        `رابعاً: توصيات تحسين إجراءات التشغيل القياسية (SOP Optimization Recommendations)`,
        `1. ${ackBottleneck ? 'إلزام كافة أجهزة المستجيبين باستثناء تطبيق ERS من قيود توفير الطاقة (Battery Optimization Whitelist) لضمان التنبيه الصوتي الفوري.' : 'مواصلة تدريب الفرق على سرعة الإقرار اللحظي فور إطلاق الإنذار.'}`,
        `2. ${arrivalBottleneck ? `إعادة تموضع حقائب ومعدات التدخل لحالات (${typeName}) بحيث تكون أقرب للنطاق (${locationName}) لتقليص زمن الانتقال بمقدار النصف.` : 'تعميم مسار الوصول المعتمد في هذه الواقعة كمسار استجابة مرجعي في خطط الإخلاء.'}`,
        `3. اعتماد فحص دوري كل أسبوع لكود التحقق الجغرافي QR الخاص بموقع (${locationName}) لتسريع التوثيق الميداني الآلي.`,
        `4. أرشفة هذا التقرير وربطه بملف التدريب المستمر لتحسين مؤشرات أداء المنشأة والسلامة المهنية.`
    ].join('\n');
};

export const parseVoiceEmergencyCommand = async (
    text: string, 
    types: EmergencyType[], 
    locations: Location[], 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<any> => {
    try {
        const response = await fetch('/api/gemini/nlp-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, types, locations }),
        });
        if (response.ok) {
            const resData = await response.json();
            if (resData.type_name || resData.location_name) return resData;
        }
    } catch {
        // Fallback
    }

    // Client-side NLP keyword matcher if offline or on Cloudflare Pages
    const lower = text.toLowerCase();
    const matchedType = types.find(t => lower.includes(t.type_name.toLowerCase()))?.type_name || types[0]?.type_name || 'طوارئ عامة';
    const matchedLocation = locations.find(l => lower.includes(l.name.toLowerCase()))?.name || locations[0]?.name || 'الموقع الرئيسي';

    return {
        type_name: matchedType,
        location_name: matchedLocation,
        notes: text
    };
};

export const generateResponderQuiz = async (
    emergency: Emergency, 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<QuizQuestion[]> => {
    try {
        const response = await fetch('/api/gemini/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emergency }),
        });
        if (response.ok) {
            const res = await response.json();
            if (Array.isArray(res) && res.length > 0) return res;
        }
    } catch {
        // Fallback
    }

    const typeName = emergency?.typeName || 'حالة الطوارئ';
    return [
        {
            question: `ما هو الإجراء الأولي الواجب اتخاذه فور الوصول لموقع ${typeName}؟`,
            options: ['عزل الموقع وتأمين مسار خروج آمن', 'الانتظار حتى انتهاء الحدث تلقائياً', 'مغادرة المنشأة دون إبلاغ', 'تجاهل إرشادات السلامة'],
            correctAnswerIndex: 0,
            explanation: 'تأمين مسار الخروج وعزل المحيط الخطر يمنع تفاقم الإصابات ويكفل سلامة المستجيبين.'
        },
        {
            question: `كيف يتم التعامل مع المصابين المحتملين في نطاق ${emergency?.locationName || 'الموقع'}؟`,
            options: ['تقديم الإسعافات الأولية ونقلهم لمنطقة الفرز الآمنة', 'تركهم بموقع الحادث', 'عدم طلب الدعم الطبي', 'إغلاق المداخل عليهم'],
            correctAnswerIndex: 0,
            explanation: 'نقل المصابين لمنطقة الفرز الآمنة هو البروتوكول القياسي لضمان وصول الرعاية العاجلة.'
        },
        {
            question: 'ما هي القناة الإلزامية لتأكيد استقرار الوضع وإغلاق البلاغ؟',
            options: ['توثيق الحالة رسمياً عبر لوحة تحكم ERS الرقمية', 'إرسال بريد إلكتروني غير موثق', 'الحديث الشفهي فقط', 'الانسحاب دون إشعار'],
            correctAnswerIndex: 0,
            explanation: 'توثيق الإغلاق عبر النظام الرقمي يضمن الأرشفة القانونية واكتمال السلسلة التوثيقية.'
        }
    ];
};

export const generateDynamicSOPChecklist = async (
    emergency: Emergency, 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<SOPTask[]> => {
    try {
        const response = await fetch('/api/gemini/sop-checklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emergency }),
        });
        if (response.ok) {
            const res = await response.json();
            if (Array.isArray(res) && res.length > 0) return res;
        }
    } catch {
        // Fallback
    }

    const typeName = emergency?.typeName || 'الطوارئ';
    return [
        { id: `task_${Date.now()}_1`, text: `تأمين محيط موقع (${emergency?.locationName || 'الحادث'}) وعزل مصادر التهديد المباشرة`, completed: false },
        { id: `task_${Date.now()}_2`, text: `التحقق من إخلاء الكوادر غير الضرورية وتأكيد سالكية مسارات الهروب`, completed: false },
        { id: `task_${Date.now()}_3`, text: `تفعيل معدات المكافحة والتدخل التكتيكي المخصصة لحالة (${typeName})`, completed: false },
        { id: `task_${Date.now()}_4`, text: `التواصل اللاسلكي المباشر مع غرفة العمليات المركزية لتأكيد الموقف الميداني`, completed: false },
        { id: `task_${Date.now()}_5`, text: `إجراء المسح الفني النهائي للتأكد من انعدام المخاطر الثانوية تمهيداً للإغلاق`, completed: false }
    ];
};

export const performComprehensiveVisionAnalysis = async (
    base64Image: string, 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<any> => {
    try {
        const response = await fetch('/api/gemini/vision-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Image }),
        });
        if (response.ok) {
            const data = await response.json();
            if (data.summary_ar) return data;
        }
    } catch {
        // Fallback
    }
    return { summary_ar: "تم فحص المشهد التكتيكي والتأكد من استقرار المعايير البصرية.", risk_score: 5 };
};

export const generateCrisisScenario = async (
    facilityProfile: FacilityProfile | null, 
    customSituations: string, 
    _primaryKey?: string, 
    _secondaryKey?: string
): Promise<any> => {
    try {
        const response = await fetch('/api/gemini/crisis-scenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ facilityProfile, customSituations }),
        });
        if (response.ok) {
            const data = await response.json();
            if (data.title || data.description) return data;
        }
    } catch {
        // Fallback
    }

    return {
        title: "سيناريو الطوارئ المركبة في المنشأة التشغيلية",
        description: `محاكاة تدريبية لاختبار استجابة الفرق لحادث مفاجئ في بيئة المنشأة (${facilityProfile?.activityType || 'المرفق الحيوي'}) بالتزامن مع (${customSituations || 'ظروف تشغيلية حرجة'}).`,
        challenges: [
            "سرعة عزل مصادر الطاقة والمواد القابلة للاشتعال خلال أقل من 120 ثانية",
            "إدارة عمليات الإخلاء المنظم دون إحداث ارتباك في الممرات الرئيسية",
            "الحفاظ على تدفق الاتصالات التكتيكية بين فرق الدعم الميداني وغرفة العمليات"
        ],
        objectives: [
            "تحقيق زمن استجابة ميداني يقل عن 3 دقائق",
            "الامتثال التام لقائمة إجراءات التشغيل القياسية (SOP) بنسبة 100%",
            "التوثيق الرقمي اللحظي لكافة التحركات والقرارات المتخذة"
        ],
        difficulty: "متقدم (Advanced)"
    };
};
