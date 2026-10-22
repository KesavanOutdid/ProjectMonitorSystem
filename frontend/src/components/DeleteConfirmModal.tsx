'use client';

import React from 'react';
import { Trash2, AlertTriangle, X, ShieldAlert, ArrowRight, RefreshCw } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  itemName: string;
  itemType: 'Task' | 'Project' | 'Request' | 'Team' | 'Item';
  isPermanent?: boolean;
  cascadeWarning?: string;
  isLoading?: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  itemType,
  isPermanent = false,
  cascadeWarning,
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Stripe */}
        <div className={`h-1.5 w-full ${isPermanent ? 'bg-rose-600' : 'bg-amber-500'}`} />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                isPermanent 
                  ? 'bg-rose-100 text-rose-600 ring-4 ring-rose-50' 
                  : 'bg-amber-100 text-amber-700 ring-4 ring-amber-50'
              }`}>
                {isPermanent ? <ShieldAlert className="w-6 h-6" /> : <Trash2 className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm {isPermanent ? 'permanent deletion' : 'moving to Recycle Bin'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Item Preview Card */}
          <div className="my-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Selected {itemType}
            </span>
            <p className="text-sm font-semibold text-slate-800 line-clamp-2 mt-0.5">
              {itemName}
            </p>
          </div>

          {/* Retention & Cascade Information Box */}
          {!isPermanent ? (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex gap-3 text-xs text-blue-900 leading-relaxed mb-4">
              <span className="text-base shrink-0">♻️</span>
              <div>
                <strong className="font-semibold block text-blue-950 mb-0.5">
                  30-Day Recovery Guarantee
                </strong>
                This {itemType.toLowerCase()} will be moved to the <strong>Recycle Bin</strong> and can be restored at any time for the next <strong>30 days</strong>. After 30 days, it will be automatically purged.
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex gap-3 text-xs text-rose-900 leading-relaxed mb-4">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <strong className="font-semibold block text-rose-950 mb-0.5">
                  Irreversible Action
                </strong>
                This action is permanent and cannot be undone. All database records, attachments, and activity history will be deleted.
              </div>
            </div>
          )}

          {cascadeWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2 text-xs text-amber-900 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{cascadeWarning}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={async () => {
                await onConfirm();
              }}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 ${
                isPermanent
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
              }`}
            >
              {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {isPermanent ? 'Delete Permanently' : 'Move to Recycle Bin'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
