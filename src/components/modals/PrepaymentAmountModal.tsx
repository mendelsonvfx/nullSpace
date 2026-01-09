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
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-sm w-full shadow-2xl animate-modal"
        onClick={(e) => e.stopPropagation()}
        data-modal-window
      >
        <h3 className="text-lg font-semibold mb-1">Set Prepayment Amount</h3>
        <p className="text-zinc-400 text-sm mb-4">
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
            className={`w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 pr-12 transition-colors ${
              exceedsCost
                ? 'border-2 border-yellow-500 focus:ring-yellow-500'
                : 'border border-zinc-700 focus:ring-accent focus:border-transparent'
            }`}
            autoFocus
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
            {currencySymbol}
          </span>
        </div>

        {/* Helper text */}
        <p className={`text-xs mb-3 ${exceedsCost ? 'text-yellow-400' : 'text-zinc-400'}`}>
          {exceedsCost
            ? <>Exceeds project cost (<span className="font-semibold">{projectCost?.toLocaleString()} {currencySymbol}</span>)</>
            : projectCost
              ? <>Project cost: <span className="font-semibold text-zinc-300">{projectCost.toLocaleString()} {currencySymbol}</span></>
              : 'Enter the prepayment amount received'
          }
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm animate-button"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg transition-colors font-medium text-sm animate-button"
          >
            Set Prepaid
          </button>
        </div>
      </div>
    </div>
  );
}
