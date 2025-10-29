// src/components/finance/ManualTransactionModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { X, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Project } from '../../types/project';
import { useModalBlur } from '../../hooks/useModalBlur';

interface ManualTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  otherProjectTransactions: any[];
  onAddTransaction: (
    projectId: string,
    amount: number,
    date: string,
    currency: string,
    notes?: string
  ) => void;
  onRemoveTransaction: (projectId: string, transactionId: string) => void;
}

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
  isOpen,
  onClose,
  projects,
  otherProjectTransactions,
  onAddTransaction,
  onRemoveTransaction
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('USD');
  const [notes, setNotes] = useState<string>('');
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedProjectId('');
      setSelectedDate(new Date().toISOString().split('T')[0]);
      setAmount(0);
      setCurrency('USD');
      setNotes('');

      console.log('[ManualTransactionModal] Modal opened');
    } else {
      console.log('[ManualTransactionModal] Modal closed');
    }
  }, [isOpen]);

  // Animation effect
  useEffect(() => {
    if (isOpen) {
      // Small delay to trigger animation
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (!selectedProjectId) {
      alert('Please select a project');
      return;
    }

    if (amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    onAddTransaction(
      selectedProjectId,
      amount,
      selectedDate,
      currency,
      notes || undefined
    );

    // Reset form without closing modal
    setAmount(0);
    setNotes('');
    // Keep selectedProjectId and date for convenience
  };

  const handleCancel = () => {
    onClose();
  };

  // Prevent clicks inside modal from closing it
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Handle backdrop mouse down
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setMouseDownOnBackdrop(true);
    }
  };

  // Handle backdrop mouse up - only close if mousedown was also on backdrop
  const handleBackdropMouseUp = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownOnBackdrop) {
      onClose();
    }
    setMouseDownOnBackdrop(false);
  };

  // Reset mousedown state when clicking inside modal
  const handleModalMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMouseDownOnBackdrop(false);
  };

  // Get manual transactions from all active projects + Other Project
  const manualTransactions = useMemo(() => {
    const allTransactions: Array<{ transaction: any; project: Project | { id: string; name: string } }> = [];

    // Add transactions from active projects
    projects
      .filter(p => p.status === 'active' && p.transactions && p.transactions.length > 0)
      .forEach(project => {
        project.transactions!.forEach(transaction => {
          allTransactions.push({ transaction, project });
        });
      });

    // Add "Other Project" transactions
    otherProjectTransactions.forEach(transaction => {
      allTransactions.push({
        transaction,
        project: { id: 'other', name: 'Other Project' }
      });
    });

    // Sort by creation date (newest first)
    return allTransactions.sort((a, b) =>
      new Date(b.transaction.createdAt).getTime() - new Date(a.transaction.createdAt).getTime()
    );
  }, [projects, otherProjectTransactions]);

  const blurClass = useModalBlur();

  if (!isOpen) return null;

  const currencySymbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    RUB: '₽'
  };

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity duration-200 rounded-lg ${blurClass} ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      }`}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        className={`bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden flex flex-col transition-all duration-200 ${
          isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onMouseDown={handleModalMouseDown}
        onClick={handleModalClick}
      >
        {/* Two columns */}
        <div className="grid grid-cols-2 divide-x divide-zinc-800 h-full">
          {/* Left: Add Transaction Form with Header and Footer */}
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white">Add Transaction Manually</h2>
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* Form Body */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
              {/* Project Selection */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  Project *
                </label>
                <select
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  <option value="" disabled hidden>Select a Project</option>
                  {projects
                    .filter(project => project.status === 'active')
                    .map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  <option value="other">— Other Project —</option>
                </select>
              </div>

              {/* Date Picker */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  Date *
                </label>
                <input
                  type="date"
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors [color-scheme:dark]"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]} // Can't add future transactions
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  Amount *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  />
                  <select
                    className="w-24 bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="RUB">RUB</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                  Notes (optional)
                </label>
                <textarea
                  className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors resize-none"
                  rows={3}
                  placeholder="Add any additional details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 p-4 border-t border-zinc-800">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedProjectId || amount <= 0}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors font-medium shadow-sm"
              >
                Add Transaction
              </button>
            </div>
          </div>

          {/* Right: History Journal */}
          <div className="p-4 flex flex-col">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Recent Transactions</h3>
            {manualTransactions.length === 0 ? (
              <p className="text-zinc-600 text-xs text-center py-6">No manual transactions yet</p>
            ) : (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                {manualTransactions.map(({ transaction, project }) => {
                  const transactionDate = new Date(transaction.date).toLocaleDateString();
                  const symbol = currencySymbols[transaction.currency || 'USD'] || '$';

                  const isExpanded = expandedTransactionId === transaction.id;
                  const hasNotes = transaction.notes && transaction.notes.trim() !== '';

                  return (
                    <div
                      key={transaction.id}
                      className="bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 p-2.5 group">
                        {/* Expand button (only if has notes) */}
                        {hasNotes && (
                          <button
                            onClick={() => setExpandedTransactionId(isExpanded ? null : transaction.id)}
                            className="p-0.5 hover:bg-zinc-700 rounded transition-colors flex-shrink-0"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-zinc-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-zinc-400" />
                            )}
                          </button>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-200 truncate">
                            {project.name}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {transactionDate}
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="text-sm font-bold text-green-400 whitespace-nowrap flex-shrink-0">
                          {symbol}{transaction.amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                        </div>

                        {/* Delete Button */}
                        <button
                          onClick={() => onRemoveTransaction(project.id, transaction.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-600/20 rounded-lg transition-all flex-shrink-0"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>

                      {/* Expanded notes */}
                      {isExpanded && hasNotes && (
                        <div className="px-2.5 pb-2.5 pt-0">
                          <div className="bg-zinc-900/50 rounded px-3 py-2 border border-zinc-700/50">
                            <p className="text-xs text-zinc-400 leading-relaxed">
                              {transaction.notes}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
