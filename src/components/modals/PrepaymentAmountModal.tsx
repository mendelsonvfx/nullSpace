import { useState, useEffect } from 'react';
import { useModalBlur } from '../../hooks/useModalBlur';
import type { Currency } from '../../types/project';

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  RUB: '₽',
  GBP: '£',
  CNY: '¥',
};

interface PrepaymentAmountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  projectName: string;
  projectCost?: number;
  projectCurrency: Currency;
}

export function PrepaymentAmountModal({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  projectCost,
  projectCurrency
}: PrepaymentAmountModalProps) {
  const [amount, setAmount] = useState('');
  const blurClass = useModalBlur();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amount) || 0;
  const isValid = numericAmount > 0;
  const exceedsCost = projectCost && numericAmount > projectCost;
  const currencySymbol = currencySymbols[projectCurrency] || projectCurrency;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(numericAmount);
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
      onClose();
    }
    delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
  };

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card-bg border border-border-secondary rounded-card p-5 max-w-sm w-full shadow-2xl animate-modal"
        onClick={(e) => e.stopPropagation()}
        data-modal-window
      >
        <h3 className="text-lg font-semibold mb-1">Set Prepayment Amount</h3>
        <p className="text-text-muted text-sm mb-4">
          Enter prepayment amount for "<span className="text-white font-medium">{projectName}</span>"
        </p>

        {/* Amount input */}
        <div className="relative mb-1">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid) handleConfirm();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="0"
            min="0"
            step="any"
            className={`w-full bg-sidebar-bg rounded-button px-3 py-2 text-sm focus:outline-none pr-12 transition-colors ${
              exceedsCost
                ? 'border-2 border-yellow-500 focus:ring-2 focus:ring-yellow-500'
                : 'border border-border-primary focus:border-accent'
            }`}
            autoFocus
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            {currencySymbol}
          </span>
        </div>

        {/* Helper text */}
        <p className={`text-xs mb-3 ${exceedsCost ? 'text-yellow-400' : 'text-text-muted'}`}>
          {exceedsCost
            ? <>Exceeds project cost (<span className="font-semibold">{projectCost?.toLocaleString()} {currencySymbol}</span>)</>
            : projectCost
              ? <>Project cost: <span className="font-semibold text-text-primary">{projectCost.toLocaleString()} {currencySymbol}</span></>
              : 'Enter the prepayment amount received'
          }
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors text-sm animate-button"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-3 py-1.5 bg-gradient-to-br from-accent to-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-button transition-colors font-medium text-sm text-white animate-button"
          >
            Set Prepaid
          </button>
        </div>
      </div>
    </div>
  );
}
