'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { 
  FolderPlus, 
  ChevronDown, 
  ChevronRight, 
  Edit3, 
  Trash2, 
  X, 
  Check,
  Folder,
  FolderOpen,
  Plus,
  Minus
} from 'lucide-react';
import { CarSale } from '@/app/types';
import { motion, AnimatePresence } from 'framer-motion';

interface GroupManagerProps {
  sales: CarSale[];
  selectedIds: Set<string>;
  groups: string[];
  expandedGroups: string[];
  onCreateGroup: (name: string, saleIds: string[]) => Promise<void>;
  onRenameGroup: (oldName: string, newName: string) => Promise<void>;
  onDeleteGroup: (name: string) => Promise<void>;
  onRemoveFromGroup: (saleId: string) => Promise<void>;
  onToggleGroup: (name: string) => void;
  onAddToGroup: (groupName: string, saleIds: string[]) => Promise<void>;
}

const GroupManager = memo(function GroupManager({
  sales,
  selectedIds,
  groups,
  expandedGroups,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onRemoveFromGroup,
  onToggleGroup,
  onAddToGroup
}: GroupManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddToMenu, setShowAddToMenu] = useState(false);

  // Group sales by their group property
  const groupedSales = useMemo(() => {
    const grouped: Record<string, CarSale[]> = {};
    groups.forEach(g => { grouped[g] = []; });
    
    sales.forEach(sale => {
      if (sale.group && groups.includes(sale.group)) {
        grouped[sale.group].push(sale);
      }
    });
    
    return grouped;
  }, [sales, groups]);

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim() || selectedIds.size === 0) return;
    
    setIsLoading(true);
    try {
      await onCreateGroup(newGroupName.trim(), Array.from(selectedIds));
      setNewGroupName('');
      setIsCreating(false);
    } catch (e) {
      console.error('Failed to create group:', e);
    } finally {
      setIsLoading(false);
    }
  }, [newGroupName, selectedIds, onCreateGroup]);

  const handleRename = useCallback(async (oldName: string) => {
    if (!editName.trim() || editName === oldName) {
      setEditingGroup(null);
      return;
    }
    
    setIsLoading(true);
    try {
      await onRenameGroup(oldName, editName.trim());
      setEditingGroup(null);
    } catch (e) {
      console.error('Failed to rename group:', e);
    } finally {
      setIsLoading(false);
    }
  }, [editName, onRenameGroup]);

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`Delete group "${name}"? Cars will not be deleted.`)) return;
    
    setIsLoading(true);
    try {
      await onDeleteGroup(name);
    } catch (e) {
      console.error('Failed to delete group:', e);
    } finally {
      setIsLoading(false);
    }
  }, [onDeleteGroup]);

  const handleAddToExisting = useCallback(async (groupName: string) => {
    if (selectedIds.size === 0) return;
    
    setIsLoading(true);
    try {
      await onAddToGroup(groupName, Array.from(selectedIds));
      setShowAddToMenu(false);
    } catch (e) {
      console.error('Failed to add to group:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedIds, onAddToGroup]);

  return (
    <div className="group-manager">
      {/* Action Bar - Shows when items are selected */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-blue-700 font-medium">
                {selectedIds.size} items selected
              </span>
              <div className="flex gap-2">
                {/* Create New Group */}
                {isCreating ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="Group name..."
                      className="px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateGroup();
                        if (e.key === 'Escape') setIsCreating(false);
                      }}
                    />
                    <button
                      onClick={handleCreateGroup}
                      disabled={!newGroupName.trim() || isLoading}
                      className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsCreating(false)}
                      className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors font-medium"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Create Group
                  </button>
                )}

                {/* Add to Existing Group */}
                {groups.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowAddToMenu(!showAddToMenu)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-500 transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Group
                    </button>
                    {showAddToMenu && (
                      <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 min-w-[150px]">
                        {groups.map(g => (
                          <button
                            key={g}
                            onClick={() => handleAddToExisting(g)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Groups List */}
      {groups.length > 0 && (
        <div className="space-y-1 mb-3">
          {groups.map(groupName => {
            const isExpanded = expandedGroups.includes(groupName);
            const groupSales = groupedSales[groupName] || [];
            const isEditing = editingGroup === groupName;

            return (
              <div key={groupName} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                {/* Group Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <button
                    onClick={() => onToggleGroup(groupName)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    {isExpanded ? (
                      <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleRename(groupName);
                          if (e.key === 'Escape') setEditingGroup(null);
                        }}
                        autoFocus
                        className="px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                    ) : (
                      <span className="font-medium text-sm text-slate-700 truncate">
                        {groupName}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      ({groupSales.length})
                    </span>
                  </button>

                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleRename(groupName)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingGroup(null)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingGroup(groupName);
                            setEditName(groupName);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(groupName);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Group Contents */}
                <AnimatePresence>
                  {isExpanded && groupSales.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="border-t border-slate-100"
                    >
                      {groupSales.map(sale => (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between px-3 py-1.5 pl-10 hover:bg-slate-50 text-sm"
                        >
                          <span className="truncate text-slate-600">
                            {sale.brand} {sale.model} - {sale.plateNumber || sale.vin?.slice(-6)}
                          </span>
                          <button
                            onClick={() => onRemoveFromGroup(sale.id)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove from group"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default GroupManager;
