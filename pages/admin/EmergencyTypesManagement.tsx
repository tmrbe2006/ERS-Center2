
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { EmergencyType } from '../../types';
import { Button } from '../../components/Button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Siren, Plus, AlertCircle, Trash2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AdminTable, Column } from '../../components/AdminTable';
import { Modal, ConfirmModal } from '../../components/Modal';
import { useApp } from '../../context/AppContext';

const EmergencyTypesManagement = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isOfflineMode, logAdminAction } = useApp();
  const [types, setTypes] = useState<EmergencyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentType, setCurrentType] = useState<EmergencyType | null>(null);
  const [formData, setFormData] = useState<Omit<EmergencyType, 'id'>>({
    type_name: '',
    description: '',
    severity_level: 'High',
    alert_color: '#ff0000',
    default_procedures: ''
  });

  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Load Data
  useEffect(() => {
    setLoading(true);
    const localData = localStorage.getItem('esr_emergency_types');
    if (localData) {
        setTypes(JSON.parse(localData));
        setLoading(false);
    }

    if (isOfflineMode) {
        setLoading(false);
        return;
    }

    const unsubscribe = onSnapshot(collection(db, 'emergency_types'), (snapshot) => {
      try {
        const loadedTypes = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as EmergencyType[];
        
        setTypes(loadedTypes);
        localStorage.setItem('esr_emergency_types', JSON.stringify(loadedTypes));
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Failed to parse emergency types.");
      }
    });
    return () => unsubscribe();
  }, [isOfflineMode]);

  // Filter and Sort Data
  const filteredTypes = useMemo(() => {
    let data = types.filter(t => 
      t.type_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortConfig) {
      data.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof EmergencyType] || '';
        const bValue = b[sortConfig.key as keyof EmergencyType] || '';

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return data;
  }, [types, searchQuery, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const openModal = (type?: EmergencyType) => {
    setModalError(null);
    if (type) {
      setCurrentType(type);
      setFormData({
        type_name: type.type_name,
        description: type.description,
        severity_level: type.severity_level,
        alert_color: type.alert_color,
        default_procedures: type.default_procedures
      });
    } else {
      setCurrentType(null);
      setFormData({
        type_name: '',
        description: '',
        severity_level: 'High',
        alert_color: '#ff0000',
        default_procedures: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentType(null);
    setModalError(null);
  };

  const updateLocalData = (newTypes: EmergencyType[]) => {
      setTypes(newTypes);
      localStorage.setItem('esr_emergency_types', JSON.stringify(newTypes));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    
    const nameToSave = formData.type_name.trim();

    if (!nameToSave) {
        setModalError("Type name is required");
        return;
    }

    const isDuplicate = types.some(t => {
       if (currentType && t.id === currentType.id) {
           return false;
       }
       return t.type_name.trim().toLowerCase() === nameToSave.toLowerCase();
    });

    if (isDuplicate) {
      setModalError(t('duplicate_error'));
      return; 
    }

    const typeData = {
        ...formData,
        type_name: nameToSave
    };

    try {
      const newId = currentType ? currentType.id : (isOfflineMode ? `local_${Date.now()}` : '');
      const newItem: EmergencyType = { id: newId, ...typeData };

      if(isOfflineMode) {
          if (currentType) {
              updateLocalData(types.map(t => t.id === currentType.id ? newItem : t));
          } else {
              updateLocalData([...types, newItem]);
          }
          closeModal();
          return;
      }

      if (currentType) {
        await updateDoc(doc(db, 'emergency_types', currentType.id), typeData);
        await logAdminAction('UPDATE_TYPE', `Updated Emergency Type: ${nameToSave}`);
      } else {
        await addDoc(collection(db, 'emergency_types'), typeData);
        await logAdminAction('CREATE_TYPE', `Created Emergency Type: ${nameToSave}`);
      }
      
      closeModal();
    } catch (err: any) {
      console.error(err);
      setModalError("Save failed.");
    }
  };

  const promptDelete = (item: EmergencyType) => {
    setError(null);
    setDeleteId(item.id);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      setIsDeleting(true);
      const typeToDelete = types.find(t => t.id === deleteId);
      try {
        if (!isOfflineMode) {
            await deleteDoc(doc(db, 'emergency_types', deleteId));
            await logAdminAction('DELETE_TYPE', `Deleted Emergency Type: ${typeToDelete?.type_name}`);
        } else {
            updateLocalData(types.filter(t => t.id !== deleteId));
        }
        setDeleteId(null);
        setSelectedIds(prev => prev.filter(id => id !== deleteId));
      } catch (err) {
        console.error(err);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const confirmBulkDelete = async () => {
    setIsDeleting(true);
    try {
        if (isOfflineMode) {
            updateLocalData(types.filter(t => !selectedIds.includes(t.id)));
        } else {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                batch.delete(doc(db, 'emergency_types', id));
            });
            await batch.commit();
            await logAdminAction('BULK_DELETE_TYPES', `Bulk deleted ${selectedIds.length} Emergency Types`);
        }
        setSelectedIds([]);
        setIsBulkDeleteModalOpen(false);
    } catch (e) {
        console.error("Bulk delete failed", e);
        setError("Bulk delete failed");
    } finally {
        setIsDeleting(false);
    }
  };

  // UI Fix: Hide description and default_procedures on small screens to prevent overflow
  const columns: Column<EmergencyType>[] = [
    {
      header: t('type_name'),
      accessor: (type) => (
        <div>
           <div className="text-sm font-medium text-gray-900 dark:text-white">{type.type_name}</div>
           <div className="text-xs text-gray-500 dark:text-gray-400 md:hidden truncate max-w-[120px]">{type.description}</div>
        </div>
      ),
      sortKey: 'type_name'
    },
    {
        header: t('severity_level'),
        accessor: (type) => (
            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
              ${type.severity_level === 'High' ? 'bg-red-100 text-red-800' : 
                type.severity_level === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 
                'bg-green-100 text-green-800'}`}>
              {t(type.severity_level.toLowerCase())}
            </span>
        ),
        sortKey: 'severity_level'
    },
    {
        header: t('alert_color'),
        accessor: (type) => (
            <div className="w-6 h-6 rounded-full mx-auto border border-gray-200 dark:border-gray-600 shadow-sm" style={{ backgroundColor: type.alert_color }}></div>
        ),
        className: "text-center hidden sm:table-cell" // Hide on very small screens
    },
    {
        header: t('default_procedures'),
        accessor: (type) => <span className="text-gray-500 dark:text-gray-400 max-w-xs truncate block">{type.default_procedures}</span>,
        className: "hidden md:table-cell" // Hide on mobile
    }
  ];

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Siren size={24} className="text-primary" /> {t('emergency_types_management')}
        </h2>
        
        {/* Actions Bar - Responsive Fix */}
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
             {/* Search Bar */}
             <div className="relative flex-1 md:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-gray-400" />
                </div>
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search types..."
                    className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
             </div>

            <div className="flex gap-2 w-full md:w-auto">
                {selectedIds.length > 0 && (
                    <Button variant="danger" onClick={() => setIsBulkDeleteModalOpen(true)} className="flex items-center gap-2 justify-center animate-in fade-in flex-1 md:flex-none">
                        <Trash2 size={18} /> ({selectedIds.length})
                    </Button>
                )}
                <Button onClick={() => openModal()} className="flex items-center gap-2 justify-center whitespace-nowrap flex-1 md:flex-none">
                    <Plus size={18} /> <span className="hidden sm:inline">{t('add_new')}</span>
                </Button>
                <Button variant="outline" onClick={() => navigate('/admin')} className="flex items-center gap-2 justify-center flex-1 md:flex-none">
                    <ArrowLeft size={16} className="rtl:rotate-180" /> {t('back')}
                </Button>
            </div>
        </div>
      </div>

      {isOfflineMode && (
         <div className="bg-yellow-50 text-yellow-800 p-3 rounded mb-4 text-sm border border-yellow-200">
           ⚠️ Offline Mode: Changes are saved locally.
         </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-4 rounded flex items-center">
            <AlertCircle className="text-red-500 mr-2" />
            <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <AdminTable 
        columns={columns}
        data={filteredTypes}
        isLoading={loading}
        onEdit={openModal}
        onDelete={promptDelete}
        enableSelection={true}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        sortConfig={sortConfig}
        onSort={handleSort}
      />

      {/* Modals remain the same */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={currentType ? t('edit') : t('add_new')}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-5">
            {modalError && (
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded text-sm text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-center animate-pulse">
                    <AlertCircle size={16} className="mr-2" />
                    {modalError}
                </div>
            )}
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('type_name')}</label>
                <input 
                    type="text" 
                    required
                    value={formData.type_name}
                    onChange={(e) => {
                        setFormData({...formData, type_name: e.target.value});
                        if(modalError) setModalError(null); 
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${modalError ? 'border-red-500 ring-1 ring-red-500' : 'dark:border-gray-600'}`}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('description')}</label>
                <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    rows={2}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('severity_level')}</label>
                    <select 
                        value={formData.severity_level}
                        onChange={(e) => setFormData({...formData, severity_level: e.target.value as any})}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="High">{t('high')}</option>
                        <option value="Medium">{t('medium')}</option>
                        <option value="Low">{t('low')}</option>
                    </select>
                </div>
                    <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('alert_color')}</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="color" 
                            value={formData.alert_color}
                            onChange={(e) => setFormData({...formData, alert_color: e.target.value})}
                            className="h-10 w-full p-1 border rounded cursor-pointer dark:bg-gray-700 dark:border-gray-600"
                        />
                    </div>
                </div>
            </div>
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('default_procedures')}</label>
                <textarea 
                    value={formData.default_procedures}
                    onChange={(e) => setFormData({...formData, default_procedures: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    rows={4}
                />
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                <Button type="button" variant="outline" onClick={closeModal}>{t('cancel')}</Button>
                <Button type="submit">{currentType ? t('update') : t('save')}</Button>
            </div>
        </form>
      </Modal>

      <ConfirmModal 
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
      />
      
      <ConfirmModal 
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={confirmBulkDelete}
        isDeleting={isDeleting}
        title={`Delete ${selectedIds.length} items?`}
        message="Are you sure you want to delete the selected items? This cannot be undone."
      />
    </div>
  );
};

export default EmergencyTypesManagement;
