import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface Step {
  target: string; // ID of the element to highlight
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export const GuidedTour: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const tourCompleted = localStorage.getItem('esr_tour_completed');
    if (!tourCompleted) {
      // Delay slightly to allow UI to render
      setTimeout(() => setIsVisible(true), 1500);
    }
  }, []);

  const steps: Step[] = [
    {
      target: 'body',
      title: i18n.language === 'ar' ? 'مرحباً بك في نظام ERS' : 'Welcome to ERS',
      content: i18n.language === 'ar' 
        ? 'نظام الاستجابة للطوارئ الذكي. دعنا نأخذك في جولة سريعة.' 
        : 'Smart Emergency Response System. Let\'s take a quick tour.',
      position: 'center'
    },
    {
      target: '#btn-new-emergency',
      title: i18n.language === 'ar' ? 'الإبلاغ السريع' : 'Quick Report',
      content: i18n.language === 'ar' 
        ? 'اضغط هنا لفتح حالة طوارئ جديدة، يمكنك استخدام الذكاء الاصطناعي لتحليل الصور.' 
        : 'Click here to open a new emergency. You can use AI to analyze incident images.',
      position: 'top'
    },
    {
      target: '#live-map-container',
      title: i18n.language === 'ar' ? 'غرفة العمليات الحية' : 'Live Ops Map',
      content: i18n.language === 'ar' 
        ? 'تتبع المستجيبين والحالات النشطة بشكل لحظي على الخريطة التفاعلية.' 
        : 'Track responders and active cases in real-time on the interactive map.',
      position: 'bottom'
    },
    {
      target: '#critical-insight-panel',
      title: i18n.language === 'ar' ? 'وحدة التحليل الذكي ERS' : 'ERS Intelligence Hub',
      content: i18n.language === 'ar' 
        ? 'يقوم الذكاء الاصطناعي بتحليل الوضع وتقديم رؤى حرجة واستراتيجية هنا.' 
        : 'AI analyzes the situation and provides critical strategic insights here.',
      position: 'bottom'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTour = () => {
    setIsVisible(false);
    localStorage.setItem('esr_tour_completed', 'true');
  };

  const getTargetRect = () => {
    if (!isVisible) return null;
    const targetId = steps[currentStep].target;
    if (targetId === 'body') return null; // Center positioning logic handles this
    
    const element = document.querySelector(targetId);
    if (!element) return null;
    return element.getBoundingClientRect();
  };

  const targetRect = getTargetRect();

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        {/* Backdrop / Spotlight Effect */}
        <motion.div 
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-500"
           style={
             targetRect 
               ? { 
                   maskImage: `radial-gradient(circle at ${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px, transparent ${Math.max(targetRect.width, targetRect.height) / 1.5}px, black ${Math.max(targetRect.width, targetRect.height)}px)`,
                   WebkitMaskImage: `radial-gradient(circle at ${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px, transparent ${Math.max(targetRect.width, targetRect.height) / 1.5}px, black ${Math.max(targetRect.width, targetRect.height)}px)`
                 } 
               : {}
           }
        />

        {/* Highlight Border (Visual Cue) */}
        {targetRect && (
            <motion.div 
                layoutId="highlight-box"
                className="absolute border-2 border-white rounded-lg shadow-[0_0_20px_rgba(255,255,255,0.5)] pointer-events-none"
                style={{
                    top: targetRect.top - 5,
                    left: targetRect.left - 5,
                    width: targetRect.width + 10,
                    height: targetRect.height + 10,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
        )}

        {/* Tooltip Card */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
             <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full border border-gray-100 dark:border-gray-700 relative`}
                style={
                    targetRect 
                    ? {
                        position: 'absolute',
                        top: steps[currentStep].position === 'bottom' ? targetRect.bottom + 20 : undefined,
                        bottom: steps[currentStep].position === 'top' ? window.innerHeight - targetRect.top + 20 : undefined,
                        left: steps[currentStep].position === 'right' ? targetRect.right + 20 : (targetRect.left + targetRect.width/2 - 192), // Center horizontally relative to target
                        // Simple boundary checks would ideally go here, simplified for this snippet
                    } 
                    : {}
                }
             >
                <button onClick={completeTour} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X size={18} />
                </button>

                <div className="mb-4">
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full dark:bg-blue-900 dark:text-blue-200">
                        {currentStep + 1} / {steps.length}
                    </span>
                </div>

                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{steps[currentStep].title}</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                    {steps[currentStep].content}
                </p>

                <div className="flex justify-between items-center mt-6">
                    {/* Skip Button (Left side) */}
                    <button 
                        onClick={completeTour} 
                        className={`text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-wider transition-colors ${currentStep === steps.length - 1 ? 'invisible' : ''}`}
                    >
                        {t('skip')}
                    </button>

                    {/* Navigation Buttons (Right side) */}
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handlePrev} 
                            disabled={currentStep === 0}
                            className="text-sm font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                        >
                            <ArrowLeft size={16} className={i18n.language === 'ar' ? 'rotate-180' : ''} /> {t('back')}
                        </button>
                        <button 
                            onClick={handleNext}
                            className="bg-primary hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold shadow-lg shadow-blue-500/30 flex items-center gap-2 transform active:scale-95 transition-all"
                        >
                            {currentStep === steps.length - 1 ? (
                                 <> {t('finish')} <Check size={16} /></>
                            ) : (
                                 <> {t('next')} <ArrowRight size={16} className={i18n.language === 'ar' ? 'rotate-180' : ''} /></>
                            )}
                        </button>
                    </div>
                </div>
             </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};