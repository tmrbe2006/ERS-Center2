
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Edit2, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  className?: string;
  sortKey?: keyof T | string; // Enable sorting if this key is provided
}

interface AdminTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  // Selection Props
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  enableSelection?: boolean;
  // Sorting Props
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
  onSort?: (key: string) => void;
  showActions?: boolean;
}

export const AdminTable = <T extends { id: string }>({ 
  columns, 
  data, 
  isLoading, 
  onEdit, 
  onDelete,
  selectedIds = [],
  onSelectionChange,
  enableSelection = false,
  sortConfig,
  onSort,
  showActions = true
}: AdminTableProps<T>) => {
  const { t } = useTranslation();

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return;
    if (e.target.checked) {
      onSelectionChange(data.map(item => item.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id));
    }
  };

  const isAllSelected = data.length > 0 && selectedIds.length === data.length;

  // تحديد ما إذا كان يجب إظهار عمود الإجراءات
  const shouldShowActions = showActions && (onEdit || onDelete);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
      <div className="overflow-x-auto scrollbar-hide">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
          <thead className="bg-gray-50/50 dark:bg-gray-900/50">
            <tr>
              {enableSelection && (
                <th className="px-4 py-4 text-right w-10">
                   <input 
                      type="checkbox" 
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                      disabled={isLoading || data.length === 0}
                   />
                </th>
              )}
              {columns.map((col, idx) => (
                <th 
                  key={idx} 
                  className={`px-4 sm:px-6 py-4 text-right text-[10px] sm:text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ${col.className || ''} ${col.sortKey && onSort ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800' : ''}`}
                  onClick={() => col.sortKey && onSort && onSort(col.sortKey as string)}
                >
                  <div className="flex items-center justify-start gap-1">
                    {col.header}
                    {sortConfig && sortConfig.key === col.sortKey && (
                      <span className="text-primary">
                        {sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {shouldShowActions && (
                <th className="px-4 sm:px-6 py-4 text-center text-[10px] sm:text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                  {t('actions')}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-50 dark:divide-gray-700">
            {isLoading ? (
              <tr><td colSpan={columns.length + (enableSelection ? 1 : 0) + (shouldShowActions ? 1 : 0)} className="px-6 py-12 text-center text-gray-400 animate-pulse font-bold">{t('loading')}</td></tr>
            ) : data.length === 0 ? (
               <tr><td colSpan={columns.length + (enableSelection ? 1 : 0) + (shouldShowActions ? 1 : 0)} className="px-6 py-12 text-center text-gray-400 italic font-bold">{t('no_data')}</td></tr>
            ) : (
              data.map((item) => (
                <tr key={item.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors duration-150 ${selectedIds.includes(item.id) ? 'bg-primary/5 dark:bg-primary/10' : ''}`}>
                  {enableSelection && (
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <input 
                            type="checkbox" 
                            checked={selectedIds.includes(item.id)}
                            onChange={(e) => handleSelectRow(item.id, e.target.checked)}
                            className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                        />
                    </td>
                  )}
                  {columns.map((col, idx) => (
                    <td key={idx} className={`px-4 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-700 dark:text-gray-200 ${col.className || ''}`}>
                      {col.accessor(item)}
                    </td>
                  ))}
                  {shouldShowActions && (
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex justify-center space-x-2 rtl:space-x-reverse">
                        {onEdit && (
                          <button 
                              onClick={() => onEdit(item)}
                              className="p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-xl dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
                              title={t('edit')}
                          >
                              <Edit2 size={16} />
                          </button>
                        )}
                        {onDelete && (
                          <button 
                              onClick={() => onDelete(item)}
                              className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-xl dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                              title={t('delete')}
                          >
                              <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
