
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Location } from '../../types';
import { Button } from '../../components/Button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Map, Plus, MapPin, AlertCircle, Trash2, Search, QrCode, Printer, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AdminTable, Column } from '../../components/AdminTable';
import { Modal, ConfirmModal } from '../../components/Modal';

const LocationsManagement = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedLocationForQr, setSelectedLocationForQr] = useState<Location | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    floor_number: '',
    lat: '',
    lng: '',
    verificationCode: ''
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'locations'), (snapshot) => {
      const loadedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[];
      setLocations(loadedLocations);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredLocations = useMemo(() => {
    return locations.filter(loc => 
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      loc.floor_number.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [locations, searchQuery]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const locationData = {
        name: formData.name.trim(),
        floor_number: formData.floor_number.trim(),
        coords: { lat: parseFloat(formData.lat) || 0, lng: parseFloat(formData.lng) || 0 },
        verificationCode: formData.verificationCode.trim() || Math.random().toString(36).substring(2, 8).toUpperCase()
    };
    try {
      if (currentLocation) {
        await updateDoc(doc(db, 'locations', currentLocation.id), locationData);
      } else {
        await addDoc(collection(db, 'locations'), locationData);
      }
      setIsModalOpen(false);
    } catch (err) { setModalError("فشل الحفظ."); }
  };

  const handlePrintQr = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && selectedLocationForQr) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${selectedLocationForQr.verificationCode}`;
        printWindow.document.write(`
            <html lang="ar" dir="rtl">
                <head>
                    <title>Print QR Code - ${selectedLocationForQr.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700&display=swap');
                        body { font-family: 'Cairo', sans-serif; text-align: center; padding: 50px; }
                        .container { border: 5px solid #000; padding: 40px; display: inline-block; border-radius: 20px; }
                        img { width: 300px; height: 300px; }
                        h1 { margin-bottom: 10px; font-size: 24px; }
                        p { font-size: 18px; color: #666; margin: 5px 0; }
                        .footer { margin-top: 20px; font-size: 12px; font-weight: bold; border-top: 1px solid #eee; padding-top: 10px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>${selectedLocationForQr.name}</h1>
                        <p>الطابق: ${selectedLocationForQr.floor_number}</p>
                        <img src="${qrUrl}" />
                        <p style="font-family: monospace; font-weight: bold; margin-top: 10px;">CODE: ${selectedLocationForQr.verificationCode}</p>
                        <div class="footer">نظام ERS - تأكيد الوصول للموقع</div>
                    </div>
                    <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }
  };

  const columns: Column<Location>[] = [
    {
      header: t('location_name'),
      accessor: (loc) => (
         <div className="flex items-center gap-2">
            <MapPin size={18} className="text-red-500 shrink-0" />
            <span className="font-black text-gray-900 dark:text-white text-sm">{loc.name}</span>
         </div>
      )
    },
    {
      header: t('floor_number'),
      accessor: (loc) => <span className="font-bold text-gray-500">{loc.floor_number}</span>
    },
    {
      header: "رمز QR",
      accessor: (loc) => (
        <button 
          onClick={() => { setSelectedLocationForQr(loc); setIsQrModalOpen(true); }}
          className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all"
          title="عرض وطباعة رمز QR"
        >
          <QrCode size={18} />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6 max-w-full pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 dark:border-gray-700">
        <h2 className="text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2"><Map size={28} /> {t('locations_management')}</h2>
        <div className="flex gap-2">
          <Button onClick={() => { setCurrentLocation(null); setFormData({name:'', floor_number:'', lat:'', lng:'', verificationCode:Math.random().toString(36).substring(2,8).toUpperCase()}); setIsModalOpen(true); }}><Plus size={18} /> {t('add_new')}</Button>
          <Button variant="outline" onClick={() => navigate('/admin')}><ArrowLeft size={16} className="mr-2 rtl:rotate-180" /> {t('back')}</Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('search_placeholder')}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border-none rounded-2xl dark:text-white outline-none focus:ring-2 focus:ring-primary text-sm font-bold shadow-inner"
              />
          </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <AdminTable 
            columns={columns} 
            data={filteredLocations} 
            isLoading={loading} 
            onEdit={(loc) => { 
                setCurrentLocation(loc); 
                setFormData({
                    name: loc.name, 
                    floor_number: loc.floor_number, 
                    lat: loc.coords.lat.toString(), 
                    lng: loc.coords.lng.toString(), 
                    verificationCode: loc.verificationCode || ''
                }); 
                setIsModalOpen(true); 
            }} 
            onDelete={(loc) => setDeleteId(loc.id)} 
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={currentLocation ? t('edit') : t('add_new')}>
        <form onSubmit={handleSave} className="space-y-4">
            {modalError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} /> {modalError}
                </div>
            )}
            
            <div className="flex items-center gap-4">
                <label className="w-1/3 text-xs font-black text-gray-400 uppercase tracking-widest">{t('location_name')}</label>
                <input 
                    type="text" 
                    required 
                    value={formData.name} 
                    onChange={(e) => setFormData({...formData, name: e.target.value})} 
                    className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-transparent focus:border-primary outline-none dark:text-white text-sm font-bold shadow-inner" 
                />
            </div>

            <div className="flex items-center gap-4">
                <label className="w-1/3 text-xs font-black text-gray-400 uppercase tracking-widest">{t('floor_number')}</label>
                <input 
                    type="text" 
                    required 
                    value={formData.floor_number} 
                    onChange={(e) => setFormData({...formData, floor_number: e.target.value})} 
                    className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-transparent focus:border-primary outline-none dark:text-white text-sm font-bold shadow-inner" 
                />
            </div>

            <div className="flex items-center gap-4">
                <label className="w-1/3 text-xs font-black text-gray-400 uppercase tracking-widest">كود التحقق</label>
                <input 
                    type="text" 
                    value={formData.verificationCode} 
                    onChange={(e) => setFormData({...formData, verificationCode: e.target.value})} 
                    className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-transparent focus:border-primary outline-none dark:text-white text-sm font-bold shadow-inner uppercase font-mono" 
                    placeholder="سيتم توليده تلقائياً"
                />
            </div>

            <div className="flex items-center gap-4">
                <label className="w-1/3 text-xs font-black text-gray-400 uppercase tracking-widest">{t('latitude')}</label>
                <input 
                    type="number" 
                    step="any" 
                    value={formData.lat} 
                    onChange={(e) => setFormData({...formData, lat: e.target.value})} 
                    className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-transparent focus:border-primary outline-none dark:text-white text-sm font-bold shadow-inner" 
                />
            </div>

            <div className="flex items-center gap-4">
                <label className="w-1/3 text-xs font-black text-gray-400 uppercase tracking-widest">{t('longitude')}</label>
                <input 
                    type="number" 
                    step="any" 
                    value={formData.lng} 
                    onChange={(e) => setFormData({...formData, lng: e.target.value})} 
                    className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-transparent focus:border-primary outline-none dark:text-white text-sm font-bold shadow-inner" 
                />
            </div>

            <div className="pt-4">
                <Button fullWidth type="submit" className="py-3 font-black text-sm">{t('save')}</Button>
            </div>
        </form>
      </Modal>

      {/* نافذة عرض الـ QR */}
      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="رمز الاستجابة السريعة (QR)">
        {selectedLocationForQr && (
            <div className="flex flex-col items-center gap-6 py-4">
                <div className="bg-white p-4 rounded-2xl shadow-inner border-2 border-gray-100">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${selectedLocationForQr.verificationCode}`} 
                      alt="Location QR" 
                      className="w-48 h-48"
                    />
                </div>
                <div className="text-center">
                    <h4 className="font-black text-lg text-gray-800 dark:text-white">{selectedLocationForQr.name}</h4>
                    <p className="text-sm font-bold text-gray-500">كود التحقق: <span className="font-mono text-primary">{selectedLocationForQr.verificationCode}</span></p>
                </div>
                <Button onClick={handlePrintQr} className="w-full py-4 flex items-center justify-center gap-2 rounded-2xl shadow-lg">
                    <Printer size={20} /> طباعة الرمز للموقع
                </Button>
            </div>
        )}
      </Modal>

      <ConfirmModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { if (deleteId) await deleteDoc(doc(db, 'locations', deleteId)); setDeleteId(null); }} />
    </div>
  );
};

export default LocationsManagement;
