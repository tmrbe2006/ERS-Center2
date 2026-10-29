
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FacilityProfile as ProfileType, UserRole } from '../../types';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, Save, CheckCircle, Info, ShieldAlert, Factory, Zap, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const FacilityProfile = () => {
    const { user } = useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<ProfileType>({
        activityType: '',
        potentialHazards: '',
        criticalAssets: '',
        safetyStandards: '',
        siteDescription: '',
        updatedAt: Date.now()
    });

    const hasAccess = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;

    useEffect(() => {
        if (!hasAccess) {
            navigate('/admin');
            return;
        }
        const fetchProfile = async () => {
            const pDoc = await getDoc(doc(db, 'system', 'facility_profile'));
            if (pDoc.exists()) setProfile(pDoc.data() as ProfileType);
            setLoading(false);
        };
        fetchProfile();
    }, [user, navigate, hasAccess]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'system', 'facility_profile'), {
                ...profile,
                updatedAt: Date.now()
            });
            alert("Facility Context Updated Successfully!");
        } catch (e) {
            alert("Save Failed");
        }
        setSaving(false);
    };

    if (!hasAccess) return null;
    if (loading) return <div className="p-10 text-center font-black">{t('loading')}</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            <div className="flex items-center justify-between border-b pb-6 dark:border-gray-700">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/20 p-4 rounded-3xl text-primary"><Building2 size={32}/></div>
                    <div>
                        <h1 className="text-3xl font-black dark:text-white uppercase tracking-tighter">{t('company_context')}</h1>
                        <p className="text-gray-500 font-bold text-sm italic">{t('facility_context_ai')}</p>
                    </div>
                </div>
                <Button variant="outline" onClick={() => navigate('/admin')}><ArrowLeft size={16} className="mr-2 rtl:rotate-180" /> {t('back')}</Button>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-[2rem] border-2 border-blue-100 dark:border-blue-800 flex items-start gap-4">
                <Info className="text-primary shrink-0" size={32} />
                <div className="space-y-2">
                    <p className="text-sm text-blue-900 dark:text-blue-200 font-black">AI Context Injection</p>
                    <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed font-bold">
                        This information feeds the ERS Intelligent Engine to provide specialized response protocols.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField 
                    icon={<Factory className="text-orange-500" />} 
                    label={t('facility_activity')} 
                    placeholder="e.g. Hospital, Chemical Plant..." 
                    value={profile.activityType} 
                    onChange={(v: string) => setProfile({...profile, activityType: v})} 
                />
                <InputField 
                    icon={<ShieldAlert className="text-red-500" />} 
                    label={t('potential_hazards')} 
                    placeholder="e.g. Flamable gas, Radiation..." 
                    value={profile.potentialHazards} 
                    onChange={(v: string) => setProfile({...profile, potentialHazards: v})} 
                />
                <InputField 
                    icon={<Zap className="text-yellow-500" />} 
                    label={t('critical_assets')} 
                    placeholder="e.g. Server Room, Lab..." 
                    value={profile.criticalAssets} 
                    onChange={(v: string) => setProfile({...profile, criticalAssets: v})} 
                />
                <InputField 
                    icon={<CheckCircle className="text-green-500" />} 
                    label={t('safety_standards_followed')} 
                    placeholder="e.g. ISO 45001, NFPA..." 
                    value={profile.safetyStandards} 
                    onChange={(v: string) => setProfile({...profile, safetyStandards: v})} 
                />
            </div>

            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2.5rem] shadow-xl border border-gray-100 dark:border-gray-700">
                <label className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest mb-4"><Users size={16}/> {t('site_description')}</label>
                <textarea 
                    value={profile.siteDescription}
                    onChange={e => setProfile({...profile, siteDescription: e.target.value})}
                    className="w-full p-6 rounded-3xl bg-gray-50 dark:bg-gray-900 border-none outline-none focus:ring-2 focus:ring-primary min-h-[150px] font-bold text-sm dark:text-white"
                    placeholder="..."
                />
            </div>

            <Button 
                onClick={handleSave} 
                disabled={saving} 
                fullWidth 
                className="py-5 text-xl font-black rounded-3xl shadow-2xl shadow-primary/30"
            >
                {saving ? t('loading') : <><Save className="mr-2"/> {t('save_facility_profile')}</>}
            </Button>
        </div>
    );
};

const InputField = ({ icon, label, placeholder, value, onChange }: any) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-[2rem] shadow-md border border-gray-100 dark:border-gray-700 space-y-3">
        <label className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">{icon} {label}</label>
        <input 
            type="text" 
            value={value} 
            onChange={e => onChange(e.target.value)}
            className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-none outline-none focus:ring-2 focus:ring-primary font-bold text-sm dark:text-white text-right rtl:text-right ltr:text-left"
            placeholder={placeholder}
        />
    </div>
);

export default FacilityProfile;
