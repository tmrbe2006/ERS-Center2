
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { JobTitle } from '../../types';
import { Button } from '../../components/Button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Plus, AlertCircle, Trash2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AdminTable, Column } from '../../components/AdminTable';
import { Modal, ConfirmModal } from '../../components/Modal';
import { useApp } from '../../context/AppContext';

const JobTitlesManagement = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isOfflineMode, logAdminAction } = useApp();
  const [jobs, setJobs] = useState<JobTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentJob, setCurrentJob] = useState<JobTitle | null>(null);
  const [formData, setFormData] = useState({ job_name: '', description: '' });

  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Load Data
  useEffect(() => {
    setLoading(true);
    const localData = localStorage.getItem('esr_job_titles');
    if (localData) {
        setJobs(JSON.parse(localData));
        setLoading(false);
    }

    if (isOfflineMode) {
        setLoading(false);
        return;
    }

    const unsubscribe = onSnapshot(collection(db, 'job_titles'), (snapshot) => {
      try {
        const loadedJobs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as JobTitle[];
        
        setJobs(loadedJobs);
        localStorage.setItem('esr_job_titles', JSON.stringify(loadedJobs));
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Failed to parse data from server.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [isOfflineMode]);

  // Filter Logic using useMemo
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => 
        job.job_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [jobs, searchQuery]);

  const openModal = (job?: JobTitle) => {
    setModalError(null);
    if (job) {
      setCurrentJob(job);
      setFormData({ job_name: job.job_name, description: job.description });
    } else {
      setCurrentJob(null);
      setFormData({ job_name: '', description: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentJob(null);
    setModalError(null);
  };

  const updateLocalData = (newJobs: JobTitle[]) => {
      setJobs(newJobs);
      localStorage.setItem('esr_job_titles', JSON.stringify(newJobs));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    
    const nameToSave = formData.job_name.trim();

    if (!nameToSave) {
        setModalError("Job name is required");
        return;
    }

    // DUPLICATE VALIDATION
    const isDuplicate = jobs.some(j => 
      j.job_name.trim().toLowerCase() === nameToSave.toLowerCase() && 
      j.id !== currentJob?.id
    );

    if (isDuplicate) {
      setModalError(t('duplicate_error') || "This job title already exists.");
      return;
    }

    try {
      if (isOfflineMode) {
          const newItem: JobTitle = {
              id: currentJob ? currentJob.id : `local_${Date.now()}`,
              job_name: nameToSave,
              description: formData.description
          };
          updateLocalData(currentJob ? jobs.map(j => j.id === currentJob.id ? newItem : j) : [...jobs, newItem]);
          closeModal();
          return;
      }

      if (currentJob) {
        await updateDoc(doc(db, 'job_titles', currentJob.id), { ...formData, job_name: nameToSave });
        await logAdminAction('UPDATE', `Updated Job Title: ${nameToSave}`);
      } else {
        await addDoc(collection(db, 'job_titles'), { ...formData, job_name: nameToSave });
        await logAdminAction('CREATE', `Created Job Title: ${nameToSave}`);
      }
      closeModal();
    } catch (err) {
      console.error(err);
      setModalError("Save failed.");
    }
  };

  const promptDelete = (item: JobTitle) => {
    setError(null);
    setDeleteId(item.id);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      setIsDeleting(true);
      const jobToDelete = jobs.find(j => j.id === deleteId);
      try {
        if (isOfflineMode) {
             updateLocalData(jobs.filter(j => j.id !== deleteId));
        } else {
            await deleteDoc(doc(db, 'job_titles', deleteId));
            await logAdminAction('DELETE', `Deleted Job Title: ${jobToDelete?.job_name}`);
        }
        setDeleteId(null);
        setSelectedIds(prev => prev.filter(id => id !== deleteId)); // Clear selection if deleted single
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
              updateLocalData(jobs.filter(j => !selectedIds.includes(j.id)));
          } else {
              const batch = writeBatch(db);
              selectedIds.forEach(id => {
                  batch.delete(doc(db, 'job_titles', id));
              });
              await batch.commit();
              await logAdminAction('BULK_DELETE', `Bulk deleted ${selectedIds.length} Job Titles`);
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

  const columns: Column<JobTitle>[] = [
    {
      header: t('job_name'),
      accessor: (job) => (
        <span className="font-medium text-gray-900 dark:text-white">{job.job_name}</span>
      )
    },
    {
      header: t('description'),
      accessor: (job) => (
        <span className="text-gray-500 dark:text-gray-400 block max-w-xs truncate">{job.description}</span>
      ),
      className: "hidden sm:table-cell" // Hide description on very small screens if needed
    }
  ];

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-4 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Briefcase size={24} className="text-primary" /> {t('job_titles')}
        </h2>
        
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
                    placeholder="Search titles..."
                    className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
            </div>

            <div className="flex gap-2 w-full md:w-auto">
                {selectedIds.length > 0 && (
                    <Button variant="danger" onClick={() => setIsBulkDeleteModalOpen(true)} className="flex items-center gap-2 justify-center animate-in fade-in flex-1 md:flex-none">
                        <Trash2 size={18} /> ({selectedIds.length})
                    </Button>
                )}
                <Button onClick={() => openModal()} className="flex items-center gap-2 justify-center flex-1 md:flex-none">
                    <Plus size={18} /> {t('add_new')}
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
        data={filteredJobs}
        isLoading={loading}
        onEdit={openModal}
        onDelete={promptDelete}
        enableSelection={true}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={currentJob ? t('edit') : t('add_new')}
      >
         <form onSubmit={handleSave} className="space-y-5">
            {modalError && (
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded text-sm text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-center">
                    <AlertCircle size={16} className="mr-2" />
                    {modalError}
                </div>
            )}
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('job_name')}</label>
                <input 
                    type="text" 
                    required
                    value={formData.job_name}
                    onChange={(e) => setFormData({...formData, job_name: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder={t('job_name')}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('description')}</label>
                <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    rows={3}
                    placeholder={t('description')}
                />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                <Button type="button" variant="outline" onClick={closeModal}>{t('cancel')}</Button>
                <Button type="submit">{currentJob ? t('update') : t('save')}</Button>
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

export default JobTitlesManagement;
