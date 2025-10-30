import { X } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { ExportButton } from '../time';

interface FinanceProjectDetailsProps {
  project: any;
  projects: any[];
  baseCurrency: string;
  convertToBaseCurrency: boolean;
  currencySymbols: Record<string, string>;
  totalRevenue: Record<string, number>;
  convertCurrency: (amount: number, from: string, to: string) => number;
  onClose: () => void;
}

export function FinanceProjectDetails({
  project,
  projects,
  baseCurrency,
  convertToBaseCurrency,
  currencySymbols,
  totalRevenue,
  convertCurrency,
  onClose
}: FinanceProjectDetailsProps) {
  const { clients } = useProjectStore();

  const projectCurrency = project.currency || 'USD';
  const projectRevenue = project.cost || 0;

  // Конвертация если нужно
  const displayRevenue = convertToBaseCurrency && projectCurrency !== baseCurrency
    ? convertCurrency(projectRevenue, projectCurrency, baseCurrency)
    : projectRevenue;

  const displayCurrency = convertToBaseCurrency ? baseCurrency : projectCurrency;

  // Calculate hourly rate
  const completedMinutes = project.totalMinutesSpent || 0;
  const currentProjectMinutes = project.currentProjectTime || 0;
  const totalMinutes = completedMinutes + currentProjectMinutes;
  const totalHours = totalMinutes / 60;

  // Priority: target hourly rate > calculated from cost/time
  // Use displayRevenue (already converted to display currency) instead of project.cost
  const hourlyRate = project.targetHourlyRate ||
    (displayRevenue && totalHours > 0
      ? displayRevenue / totalHours
      : undefined);

  // Используем переданный totalRevenue вместо пересчета
  const totalRevenueInDisplayCurrency = totalRevenue[displayCurrency] || 0;

  // Процент от общего дохода (только если проект оплачен)
  const percentageOfTotal = project.paymentStatus === 'paid' && totalRevenueInDisplayCurrency > 0
    ? (displayRevenue / totalRevenueInDisplayCurrency) * 100
    : 0;

  // Доход от клиента
  let clientRevenue = 0;
  let clientProjectCount = 0;
  if (project.clientId) {
    projects.forEach(p => {
      if (p.clientId === project.clientId && p.paymentStatus === 'paid' && p.cost) {
        const amount = convertToBaseCurrency && p.currency !== baseCurrency
          ? convertCurrency(p.cost, p.currency || 'USD', baseCurrency)
          : p.cost;
        if (!convertToBaseCurrency && p.currency !== projectCurrency) return;
        clientRevenue += amount;
        clientProjectCount++;
      }
    });
  }

  const client = project.clientId ? clients.find(c => c.id === project.clientId) : null;

  const paymentStatusColors = {
    'paid': 'text-green-500',
    'prepaid': 'text-yellow-500',
    'unpaid': 'text-red-500'
  };

  const paymentStatusLabels = {
    'paid': 'Paid',
    'prepaid': 'Prepaid',
    'unpaid': 'Unpaid'
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold">{project.name}</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Вернуться к обзору"
        >
          <X className="w-6 h-6 close-button-red" />
        </button>
      </div>

      {/* Main Revenue Card */}
      <div data-finance-container className={`bg-gradient-to-br ${project.paymentStatus === 'paid' ? 'from-green-900 to-green-800' : 'from-zinc-900 to-zinc-800'} rounded-2xl p-8 mb-6 border border-zinc-700`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-zinc-400 mb-2">Project Revenue</p>
            <p className={`text-6xl font-bold ${project.paymentStatus === 'paid' ? 'text-green-500' : 'text-zinc-400'}`}>
              {displayRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
            </p>
            {convertToBaseCurrency && projectCurrency !== baseCurrency && (
              <p className="text-sm text-zinc-500 mt-2">
                ({projectRevenue.toLocaleString()} {currencySymbols[projectCurrency]})
              </p>
            )}
          </div>
          <div className={`text-right ${paymentStatusColors[project.paymentStatus as keyof typeof paymentStatusColors]}`}>
            <p className="text-xs uppercase tracking-wide mb-1">Status</p>
            <p className="text-xl font-semibold">{paymentStatusLabels[project.paymentStatus as keyof typeof paymentStatusLabels] || 'N/A'}</p>
          </div>
        </div>

        {project.prepaymentAmount && (
          <div className="text-sm text-zinc-400 mt-4 pt-4 border-t border-zinc-400">
            <span className="text-yellow-500">Prepayment:</span> {project.prepaymentAmount.toLocaleString()} {currencySymbols[projectCurrency]}
          </div>
        )}
      </div>

      {/* Infographics Grid */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Percentage of Total Revenue */}
        {project.paymentStatus === 'paid' && percentageOfTotal > 0 && (
          <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Percentage of Total Revenue</p>
            <div className="flex items-end gap-3 mb-4">
              <p className="text-5xl font-bold text-accent">{Math.round(percentageOfTotal)}%</p>
              <p className="text-zinc-500 mb-2">of {totalRevenueInDisplayCurrency.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}</p>
            </div>
            <div className="bg-zinc-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-accent h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(percentageOfTotal, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Client Total Revenue */}
        {client && clientRevenue > 0 && (
          <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Total from Client</p>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: client.color || '#ffffff' }}
              />
              <p className="text-sm text-zinc-400 font-medium">{client.name}</p>
            </div>
            <p className="text-5xl font-bold text-blue-400 mb-2">
              {clientRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
            </p>
            <p className="text-sm text-zinc-500">{clientProjectCount} project{clientProjectCount !== 1 ? 's' : ''}</p>
          </div>
        )}

        {/* Deadline */}
        {project.deadline && (
          <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Deadline</p>
            <p className="text-3xl font-bold text-zinc-300 mb-2">
              {new Date(project.deadline).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
            {(() => {
              const daysRemaining = Math.ceil(
                (new Date(project.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <p className={`text-sm font-medium ${
                  daysRemaining < 0 ? 'text-red-500' :
                  daysRemaining < 7 ? 'text-yellow-500' :
                  'text-green-500'
                }`}>
                  {daysRemaining < 0
                    ? `Overdue by ${Math.abs(daysRemaining)} days`
                    : `${daysRemaining} days left`
                  }
                </p>
              );
            })()}
          </div>
        )}

        {/* Revenue per Day */}
        {project.paymentStatus === 'paid' && project.createdAt && (
          <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Revenue per Day</p>
            {(() => {
              const createdDate = new Date(project.createdAt);
              // Use completedAt (when payment was marked as paid) or current date as fallback
              const completedDate = project.completedAt ? new Date(project.completedAt) : new Date();
              const daysWorked = Math.max(1, Math.ceil(
                (completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
              ));
              const revenuePerDay = displayRevenue / daysWorked;

              return (
                <>
                  <p className="text-5xl font-bold text-purple-400 mb-2">
                    {revenuePerDay.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurrency]}
                  </p>
                  <p className="text-sm text-zinc-500">{daysWorked} days worked</p>
                </>
              );
            })()}
          </div>
        )}

        {/* Hourly Rate */}
        {hourlyRate && totalMinutes > 0 && (
          <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-3">Hourly Rate</p>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-5xl font-bold text-orange-400">
                {hourlyRate.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-2xl text-zinc-400">{currencySymbols[displayCurrency]}/h</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-zinc-500">
                {Math.floor(totalHours)}h {Math.round((totalHours % 1) * 60)}m worked
              </p>
              {project.targetHourlyRate && (
                <span className="text-xs text-accent px-2 py-0.5 bg-accent/10 rounded">
                  target
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Project Details */}
      <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <h3 className="text-lg font-semibold mb-4">Project Details</h3>
        <div className="space-y-3 text-sm">
          {project.description && (
            <div>
              <span className="text-zinc-500">Description:</span>
              <p className="text-zinc-300 mt-1">{project.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {project.createdAt && (
              <div>
                <span className="text-zinc-500">Created:</span>
                <p className="text-zinc-300">{new Date(project.createdAt).toLocaleDateString('en-US')}</p>
              </div>
            )}
            {project.status && (
              <div>
                <span className="text-zinc-500">Status:</span>
                <p className="text-zinc-300 capitalize">{project.status}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      {project.transactions && project.transactions.length > 0 && (
        <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mt-6">
          <h3 className="text-lg font-semibold mb-4">Transaction History</h3>
          <div className="space-y-2">
            {project.transactions
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((transaction: any) => {
                const transactionDate = new Date(transaction.date).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                });
                const symbol = currencySymbols[transaction.currency] || '$';

                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-zinc-400">{transactionDate}</div>
                        {transaction.notes && (
                          <div className="text-xs text-zinc-500 italic truncate max-w-md">
                            "{transaction.notes}"
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-green-400 whitespace-nowrap ml-4">
                      +{symbol}{transaction.amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Total Summary */}
          <div className="mt-4 pt-4 border-t border-zinc-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-500">
                Total ({project.transactions.length} transaction{project.transactions.length !== 1 ? 's' : ''})
              </div>
              <div className="text-2xl font-bold text-green-400">
                {currencySymbols[displayCurrency]}{displayRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Time Report */}
      {project.timeEntries && project.timeEntries.length > 0 && (
        <div className="mt-6">
          <ExportButton
            project={project}
            client={project.clientId ? clients.find(c => c.id === project.clientId) : undefined}
          />
        </div>
      )}
    </div>
  );
}
