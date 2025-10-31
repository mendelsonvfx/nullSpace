import { useState, useEffect } from 'react';
import * as React from 'react';
import { Filter, Plus, ChevronDown, ChevronUp, TrendingUp, Check } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { ProjectBreakdownCard } from './ProjectBreakdownCard';
import { FinanceProjectDetails } from './FinanceProjectDetails';
import { PieChart } from '../shared';
import { getCurrentRates, getManualRates, getRateMode, getCachedRatesSync } from '../../utils/exchangeRates';
import { getThresholdForCurrency } from '../../utils/financeSettings';
import { TimeAnalytics } from '../time';
import { ManualTransactionModal } from '../modals/ManualTransactionModal';
import { Currency } from '../../types/project';
import { getProjectColor, createSoftGradient } from '../../utils/colorUtils';
import { useTimeTrackingFeature } from '../../hooks/useTimeTrackingFeature';
import SimpleBar from 'simplebar-react';

interface FinancePageProps {
  projects: any[];
  selectedProjectId: string | null;
  onClose: () => void;
}

export const FinancePage = React.memo(function FinancePage({ projects, selectedProjectId, onClose }: FinancePageProps) {
  const renderStart = performance.now();
  const renderCountRef = React.useRef(0);
  renderCountRef.current += 1;
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const timelineContainerRef = React.useRef<HTMLDivElement>(null);
  const timelineContextMenuRef = React.useRef<HTMLDivElement>(null);
  const [timelineContainerWidth, setTimelineContainerWidth] = useState(1000);

  console.log('[FinancePage] RENDER START', {
    renderCount: renderCountRef.current,
    projectsCount: projects.length,
    projectsReference: projects,
    selectedProjectId,
    time: renderStart
  });

  const [baseCurrency, setBaseCurrency] = useState(() => {
    const saved = localStorage.getItem('baseCurrency');
    return saved || 'USD';
  });
  const [convertToBaseCurrency, setConvertToBaseCurrency] = useState(() => {
    const saved = localStorage.getItem('convertToBaseCurrency');
    return saved ? JSON.parse(saved) : false;
  });
  const [exchangeRates, setExchangeRates] = useState<Record<string, Record<string, number>>>(() => {
    const rateMode = getRateMode();

    if (rateMode === 'auto') {
      // Пытаемся загрузить из кэша синхронно
      const cachedRates = getCachedRatesSync(baseCurrency);
      if (cachedRates) {
        // Преобразуем в nested структуру
        const nestedRates: Record<string, Record<string, number>> = {};
        const currencies = ['USD', 'RUB', 'EUR'];
        currencies.forEach(from => {
          nestedRates[from] = {};
          currencies.forEach(to => {
            if (from === to) {
              nestedRates[from][to] = 1;
            } else if (from === baseCurrency) {
              nestedRates[from][to] = cachedRates[to] || 1;
            } else if (to === baseCurrency) {
              nestedRates[from][to] = 1 / (cachedRates[from] || 1);
            } else {
              nestedRates[from][to] = (cachedRates[to] || 1) / (cachedRates[from] || 1);
            }
          });
        });
        return nestedRates;
      }
    }

    // Fallback на ручные курсы
    return getManualRates();
  });
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sortBy, setSortBy] = useState<'amount' | 'name' | 'client' | 'date'>('date');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showManualTransactionModal, setShowManualTransactionModal] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; amount: number } | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [otherProjectTransactions, setOtherProjectTransactions] = useState<any[]>(() => {
    const saved = localStorage.getItem('otherProjectTransactions');
    return saved ? JSON.parse(saved) : [];
  });
  const [showScrollGradient, setShowScrollGradient] = useState(true);
  const [showMinMaxTooltips, setShowMinMaxTooltips] = useState(false);
  const [timelineContextMenu, setTimelineContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null;
  const { updateProject } = useProjectStore();
  const { activeMenu, setActiveMenu } = useContextMenuStore();
  const timeTrackingEnabled = useTimeTrackingFeature();

  // Handle adding manual transaction
  const handleAddTransaction = async (
    projectId: string,
    amount: number,
    date: string,
    currency: string,
    notes?: string
  ) => {
    // Create new transaction
    const newTransaction = {
      id: `transaction_${Date.now()}`,
      amount,
      currency: currency as Currency,
      date,
      notes,
      createdAt: new Date().toISOString()
    };

    // Handle "Other Project" separately
    if (projectId === 'other') {
      const updatedTransactions = [...otherProjectTransactions, newTransaction];
      setOtherProjectTransactions(updatedTransactions);
      localStorage.setItem('otherProjectTransactions', JSON.stringify(updatedTransactions));
      return;
    }

    // Handle regular project
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    // Add transaction to project's transactions array
    const updatedProject = {
      ...project,
      transactions: [...(project.transactions || []), newTransaction],
      // Update total cost
      cost: (project.cost || 0) + amount,
      currency: currency as Currency,
      updatedAt: new Date().toISOString()
    };

    await updateProject(updatedProject);
  };

  // Handle removing manual transaction
  const handleRemoveTransaction = async (projectId: string, transactionId: string) => {
    // Handle "Other Project" separately
    if (projectId === 'other') {
      const updatedTransactions = otherProjectTransactions.filter(t => t.id !== transactionId);
      setOtherProjectTransactions(updatedTransactions);
      localStorage.setItem('otherProjectTransactions', JSON.stringify(updatedTransactions));
      return;
    }

    // Handle regular project
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.transactions) return;

    const transaction = project.transactions.find((t: any) => t.id === transactionId);
    if (!transaction) return;

    // Remove transaction from array
    const updatedTransactions = project.transactions.filter((t: any) => t.id !== transactionId);

    // Update project: remove transaction and subtract from total cost
    const updatedProject = {
      ...project,
      transactions: updatedTransactions,
      cost: Math.max(0, (project.cost || 0) - transaction.amount),
      updatedAt: new Date().toISOString()
    };

    await updateProject(updatedProject);
  };

  // Load exchange rates on mount
  useEffect(() => {
    const loadRates = async () => {
      const rateMode = getRateMode();

      if (rateMode === 'auto') {
        const rates = await getCurrentRates(baseCurrency);

        // API возвращает: rates[currency] = сколько валюты за 1 базовую
        // Например, если база RUB: rates.USD = 0.0123 означает 1 RUB = 0.0123 USD
        // Для нашей nested структуры нужно: nestedRates[to][from] = сколько TO за 1 FROM
        // То есть nestedRates.RUB.USD = 1/0.0123 = 81.3 (сколько RUB за 1 USD)

        const nestedRates: Record<string, Record<string, number>> = {};

        const currencies = ['USD', 'RUB', 'EUR'];
        currencies.forEach(to => {
          nestedRates[to] = {};
          currencies.forEach(from => {
            if (from === to) {
              nestedRates[to][from] = 1;
            } else if (from === baseCurrency) {
              // from = база, to = другая валюта
              // rates[to] = сколько to валюты за 1 базовую
              // nestedRates[to][from] = сколько to за 1 from = rates[to]
              nestedRates[to][from] = rates[to] || 1;
            } else if (to === baseCurrency) {
              // to = база, from = другая валюта
              // rates[from] = сколько from валюты за 1 базовую
              // nestedRates[to][from] = сколько базы за 1 from = 1/rates[from]
              nestedRates[to][from] = 1 / (rates[from] || 1);
            } else {
              // Кросс-курс: оба не базовые
              // nestedRates[to][from] = rates[to] / rates[from]
              nestedRates[to][from] = (rates[to] || 1) / (rates[from] || 1);
            }
          });
        });

        setExchangeRates(nestedRates);
      } else {
        setExchangeRates(getManualRates());
      }
    };
    loadRates();
  }, [baseCurrency]);

  // Close filter menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showFilterMenu && !target.closest('.filter-menu-container')) {
        setShowFilterMenu(false);
      }
    };

    if (showFilterMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterMenu]);

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = async () => {
      const savedCurrency = localStorage.getItem('baseCurrency');
      const savedConvert = localStorage.getItem('convertToBaseCurrency');
      if (savedCurrency) setBaseCurrency(savedCurrency);
      if (savedConvert) setConvertToBaseCurrency(JSON.parse(savedConvert));

      // Reload exchange rates
      const rateMode = getRateMode();

      if (rateMode === 'auto') {
        const newBaseCurrency = savedCurrency || baseCurrency;
        const rates = await getCurrentRates(newBaseCurrency);

        // API возвращает: rates[currency] = сколько валюты за 1 базовую
        // Например, если база RUB: rates.USD = 0.0123 означает 1 RUB = 0.0123 USD
        // Для нашей nested структуры нужно: nestedRates[to][from] = сколько TO за 1 FROM
        // То есть nestedRates.RUB.USD = 1/0.0123 = 81.3 (сколько RUB за 1 USD)

        const nestedRates: Record<string, Record<string, number>> = {};

        const currencies = ['USD', 'RUB', 'EUR'];
        currencies.forEach(to => {
          nestedRates[to] = {};
          currencies.forEach(from => {
            if (from === to) {
              nestedRates[to][from] = 1;
            } else if (from === newBaseCurrency) {
              // from = база, to = другая валюта
              // rates[to] = сколько to валюты за 1 базовую
              // nestedRates[to][from] = сколько to за 1 from = rates[to]
              nestedRates[to][from] = rates[to] || 1;
            } else if (to === newBaseCurrency) {
              // to = база, from = другая валюта
              // rates[from] = сколько from валюты за 1 базовую
              // nestedRates[to][from] = сколько базы за 1 from = 1/rates[from]
              nestedRates[to][from] = 1 / (rates[from] || 1);
            } else {
              // Кросс-курс: оба не базовые
              // nestedRates[to][from] = rates[to] / rates[from]
              nestedRates[to][from] = (rates[to] || 1) / (rates[from] || 1);
            }
          });
        });

        setExchangeRates(nestedRates);
      } else {
        setExchangeRates(getManualRates());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [baseCurrency]);

  // Track timeline container width for responsive chart
  useEffect(() => {
    const updateWidth = () => {
      if (timelineContainerRef.current) {
        setTimelineContainerWidth(timelineContainerRef.current.offsetWidth);
      }
    };

    // Initial width
    updateWidth();

    // Update on window resize
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Close timeline context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (timelineContextMenu) {
        setTimelineContextMenu(null);
        setActiveMenu(null);
      }
    };

    if (timelineContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [timelineContextMenu, setActiveMenu]);

  // Close timeline context menu when other menus open
  useEffect(() => {
    if (activeMenu && activeMenu !== 'timeline' && timelineContextMenu) {
      setTimelineContextMenu(null);
    }
  }, [activeMenu, timelineContextMenu]);

  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'RUB': '₽',
    'EUR': '€'
  };

  const convertCurrency = (amount: number, from: string, to: string): number => {
    if (from === to) return amount;

    // Для автоматического режима (API курсы): exchangeRates[to] = курсы из API
    // Для ручного режима: exchangeRates[to][from] = сколько TO валюты за 1 FROM

    // Попробуем найти курс в структуре для целевой валюты
    const toRates = exchangeRates[to];
    if (toRates && typeof toRates[from] === 'number') {
      return amount * toRates[from];
    }

    // Если не нашли, попробуем обратный курс
    const fromRates = exchangeRates[from];
    if (fromRates && typeof fromRates[to] === 'number') {
      return amount / fromRates[to];
    }

    return amount;
  };

  // Подсчет общего дохода (оплаченные проекты)
  const totalRevenue: Record<string, number> = {};
  const paidProjects: any[] = [];

  projects.forEach(project => {
    if (project.paymentStatus === 'paid' && project.cost) {
      const currency = project.currency || 'USD';

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(project.cost, currency, baseCurrency);
        totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        totalRevenue[currency] = (totalRevenue[currency] || 0) + project.cost;
      }

      paidProjects.push(project);
    } else if (project.paymentStatus === 'prepaid' && project.cost && project.prepaymentAmount) {
      // Для prepaid проектов в "Оплачено" показываем только предоплату
      const currency = project.currency || 'USD';

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(project.prepaymentAmount, currency, baseCurrency);
        totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        totalRevenue[currency] = (totalRevenue[currency] || 0) + project.prepaymentAmount;
      }

      // Вместо добавления prepayment как отдельной карточки, добавляем полный проект с флагом
      paidProjects.push({
        ...project,
        displayAmount: project.prepaymentAmount,
        remainingAmount: project.cost - project.prepaymentAmount,
        isPrepaidProject: true
      });
    }
  });

  // Add "Other Project" transactions to total revenue
  otherProjectTransactions.forEach(transaction => {
    const currency = transaction.currency || 'USD';

    if (convertToBaseCurrency) {
      const convertedAmount = convertCurrency(transaction.amount, currency, baseCurrency);
      totalRevenue[baseCurrency] = (totalRevenue[baseCurrency] || 0) + convertedAmount;
    } else {
      totalRevenue[currency] = (totalRevenue[currency] || 0) + transaction.amount;
    }
  });

  // Подсчет ожидающих доходов (неоплаченные проекты)
  const pendingRevenue: Record<string, number> = {};
  const pendingProjects: any[] = [];

  projects.forEach(project => {
    if (project.paymentStatus === 'unpaid' && project.cost) {
      const currency = project.currency || 'USD';

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(project.cost, currency, baseCurrency);
        pendingRevenue[baseCurrency] = (pendingRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        pendingRevenue[currency] = (pendingRevenue[currency] || 0) + project.cost;
      }

      pendingProjects.push(project);
    } else if (project.paymentStatus === 'prepaid' && project.prepaymentAmount && project.cost) {
      // Для prepaid проектов в "Ожидает" показываем остаток
      const currency = project.currency || 'USD';
      const remainingAmount = project.cost - project.prepaymentAmount;

      if (convertToBaseCurrency) {
        const convertedAmount = convertCurrency(remainingAmount, currency, baseCurrency);
        pendingRevenue[baseCurrency] = (pendingRevenue[baseCurrency] || 0) + convertedAmount;
      } else {
        pendingRevenue[currency] = (pendingRevenue[currency] || 0) + remainingAmount;
      }

      // Добавляем в pending с акцентом на remaining
      pendingProjects.push({
        ...project,
        displayAmount: remainingAmount,
        prepaidAmount: project.prepaymentAmount,
        isPrepaidProject: true,
        showRemainingFirst: true
      });
    }
  });

  const formatRevenue = (revenues: Record<string, number>) => {
    return Object.entries(revenues)
      .map(([currency, amount]) => `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[currency]}`)
      .join(' ');
  };

  // Simple calculations without useMemo - computed on every render (as before refactoring)
  const { clients } = useProjectStore();

  // Sorted/filtered projects for full list + Other Project transactions
  const otherProjectItems = otherProjectTransactions.map((transaction: any) => ({
    id: transaction.id,
    name: 'Other Project',
    cost: transaction.amount,
    displayAmount: transaction.amount,
    currency: transaction.currency || 'USD',
    paymentStatus: 'paid',
    client: '',
    isOtherProject: true,
    date: transaction.date,
    completedAt: transaction.date
  }));

  // Для "All" объединяем, но убираем дубликаты prepaid проектов
  let filtered: any[] = [];
  if (filterStatus === 'paid') {
    filtered = [...paidProjects, ...otherProjectItems];
  } else if (filterStatus === 'unpaid') {
    // Убираем дубликаты в pending тоже
    const seenIds = new Set();
    filtered = pendingProjects.filter(item => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
  } else {
    // "All" - объединяем все, но prepaid проекты показываем только один раз
    const seenIds = new Set();
    const allItems = [...paidProjects, ...pendingProjects, ...otherProjectItems];
    filtered = allItems.filter(item => {
      if (item.isPrepaidProject) {
        if (seenIds.has(item.id)) {
          return false; // Уже добавили этот prepaid проект
        }
        seenIds.add(item.id);
      }
      return true;
    });
  }
  const sortedFilteredProjects = [...filtered].sort((a, b) => {
    if (sortBy === 'amount') {
      return ((b.displayAmount || b.cost) || 0) - ((a.displayAmount || a.cost) || 0);
    } else if (sortBy === 'date') {
      const dateA = new Date(a.completedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.completedAt || b.createdAt || 0).getTime();
      return dateB - dateA; // Newest first
    } else if (sortBy === 'client') {
      return (a.client || '').localeCompare(b.client || '');
    } else {
      return a.name.localeCompare(b.name);
    }
  });

  // Statistics
  const totalPaid = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);
  const displayCurrency = convertToBaseCurrency ? baseCurrency : (paidProjects[0]?.currency || 'USD');
  const avgValue = paidProjects.length > 0 ? totalPaid / paidProjects.length : 0;
  let totalDaysWorked = 0;
  paidProjects.forEach((project: any) => {
    if (project.createdAt && !project.isPrepaidPart) {
      const createdDate = new Date(project.createdAt);
      const completedDate = new Date();
      const daysWorked = Math.max(1, Math.ceil(
        (completedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
      ));
      totalDaysWorked += daysWorked;
    }
  });
  const dailyRate = totalDaysWorked > 0 ? totalPaid / totalDaysWorked : 0;
  const statistics = { totalPaid, displayCurrency, avgValue, dailyRate };

  // Timeline data - use completedAt (when payment was marked as "paid"), fallback to createdAt for old projects
  const projectsWithDates = [
    ...paidProjects
      .filter((p: any) => p.completedAt || p.createdAt)  // Use completedAt or fallback to createdAt
      .map((project: any) => {
        const originalCurrency = project.currency || 'USD';
        const originalAmount = project.displayAmount || project.cost || 0;
        const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
          ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
          : originalAmount;
        return {
          date: new Date(project.completedAt || project.createdAt),  // Use completedAt, fallback to createdAt
          amount: displayAmount,
          name: project.name
        };
      }),
    // Add "Other Project" transactions
    ...otherProjectTransactions.map((transaction: any) => {
      const originalCurrency = transaction.currency || 'USD';
      const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
        ? convertCurrency(transaction.amount, originalCurrency, baseCurrency)
        : transaction.amount;
      return {
        date: new Date(transaction.date),
        amount: displayAmount,
        name: 'Other Project'
      };
    })
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let timelineData = null;
  if (projectsWithDates.length > 0) {
    // Group projects by date (same day) and sum their amounts
    const groupedByDate = projectsWithDates.reduce((acc, item) => {
      const dateKey = item.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      if (!acc[dateKey]) {
        acc[dateKey] = { date: dateKey, amount: 0 };
      }
      acc[dateKey].amount += item.amount;
      return acc;
    }, {} as Record<string, { date: string; amount: number }>);

    // Convert to array and calculate cumulative revenue
    let cumulativeRevenue = 0;
    const cumulativeData = Object.values(groupedByDate).map((item) => {
      cumulativeRevenue += item.amount;
      return {
        date: item.date,
        revenue: cumulativeRevenue
      };
    });
    const maxRevenue = cumulativeData[cumulativeData.length - 1].revenue;
    const chartHeight = 300;
    const pointRadius = 3;
    const padding = pointRadius + 2;

    // Calculate optimal spacing based on container width
    // Min spacing: 50px (for readability), Max spacing: 120px (to prevent over-stretching)
    const availableWidth = timelineContainerWidth - 2 * padding;
    const optimalSpacing = Math.min(Math.max(availableWidth / Math.max(cumulativeData.length - 1, 1), 50), 120);
    const chartWidth = Math.max(cumulativeData.length * optimalSpacing, availableWidth);
    const points = cumulativeData.map((item, index) => {
      const x = padding + (index / Math.max(cumulativeData.length - 1, 1)) * (chartWidth - 2 * padding);
      const y = padding + (chartHeight - 2 * padding) - (item.revenue / maxRevenue) * (chartHeight - 2 * padding - 40);
      return { x, y, amount: item.revenue };
    });
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    timelineData = { cumulativeData, points, pathD, chartWidth, chartHeight, pointRadius, padding };
  }

  // Top 3 projects
  const totalRevenueCombined = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);
  const top3Projects = paidProjects
    .sort((a: any, b: any) => {
      const amountA = convertToBaseCurrency && a.currency !== baseCurrency
        ? convertCurrency(((a.displayAmount || a.cost) || 0), a.currency || 'USD', baseCurrency)
        : ((a.displayAmount || a.cost) || 0);
      const amountB = convertToBaseCurrency && b.currency !== baseCurrency
        ? convertCurrency(((b.displayAmount || b.cost) || 0), b.currency || 'USD', baseCurrency)
        : ((b.displayAmount || b.cost) || 0);
      return amountB - amountA;
    })
    .slice(0, 3)
    .map((project: any) => {
      const originalCurrency = project.currency || 'USD';
      const originalAmount = project.displayAmount || project.cost || 0;
      const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
        ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
        : originalAmount;
      const displayCurr = convertToBaseCurrency ? baseCurrency : originalCurrency;
      const percentage = totalRevenueCombined > 0 ? (displayAmount / totalRevenueCombined) * 100 : 0;
      return { project, displayAmount, displayCurr, percentage };
    });

  // Pie chart data for projects
  const projectsPieChartData = paidProjects.map((project: any) => {
    const originalCurrency = project.currency || 'USD';
    const originalAmount = project.displayAmount || project.cost || 0;
    const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
      ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
      : originalAmount;

    return {
      name: project.name,
      value: displayAmount,
      color: getProjectColor(project) // Use saved project color
    };
  }).filter(item => item.value > 0);

  // Top 3 clients
  const revenueByClient: Record<string, { amount: number; projectCount: number; client: any }> = {};
  paidProjects.forEach((project: any) => {
    if (project.clientId) {
      const client = clients.find(c => c.id === project.clientId);
      if (!client) return;
      const originalCurrency = project.currency || 'USD';
      const originalAmount = project.displayAmount || project.cost || 0;
      const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
        ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
        : originalAmount;
      if (!revenueByClient[project.clientId]) {
        revenueByClient[project.clientId] = { amount: 0, projectCount: 0, client };
      }
      revenueByClient[project.clientId].amount += displayAmount;
      revenueByClient[project.clientId].projectCount++;
    }
  });
  const top3Clients = Object.entries(revenueByClient)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 3)
    .map(([clientId, data]) => {
      const percentage = totalRevenueCombined > 0 ? (data.amount / totalRevenueCombined) * 100 : 0;
      return { clientId, data, percentage };
    });

  // Pie chart data for clients
  const revenueByClientForPie: Record<string, { amount: number; client: any }> = {};
  paidProjects.forEach((project: any) => {
    if (project.clientId) {
      const client = clients.find(c => c.id === project.clientId);
      if (!client) return;
      const originalCurrency = project.currency || 'USD';
      const originalAmount = project.displayAmount || project.cost || 0;
      const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
        ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
        : originalAmount;
      if (!revenueByClientForPie[project.clientId]) {
        revenueByClientForPie[project.clientId] = { amount: 0, client };
      }
      revenueByClientForPie[project.clientId].amount += displayAmount;
    }
  });
  const clientsPieChartData = Object.values(revenueByClientForPie).map(data => ({
    name: data.client.name,
    value: data.amount,
    color: data.client.color || '#ffffff'
  })).filter(item => item.value > 0);

  const renderEnd = performance.now();
  console.log('[FinancePage] RENDER END', { duration: (renderEnd - renderStart).toFixed(2) + 'ms' });

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden animate-fade-in">
      <SimpleBar
        scrollableNodeProps={{ ref: scrollContainerRef }}
        className="flex-1 custom-page-scrollbar"
        autoHide={false}
      >
        <div className="px-8 pb-8 pt-6">
          {selectedProject ? (
            /* Project Financial Details */
            <FinanceProjectDetails
            project={selectedProject}
            projects={projects}
            baseCurrency={baseCurrency}
            convertToBaseCurrency={convertToBaseCurrency}
            currencySymbols={currencySymbols}
            totalRevenue={totalRevenue}
            convertCurrency={convertCurrency}
              onClose={onClose}
            />
          ) : (
            /* General Finance Overview */
            <div className="w-full">
            {/* Total Revenue and Pending */}
            <div className="grid grid-cols-2 gap-8 mb-12">
              {/* Total Revenue */}
              <div>
                <h2 className="text-2xl font-medium text-zinc-400 mb-4">Total Revenue</h2>
                <div className="text-6xl font-bold text-green-500 mb-6">
                  {Object.keys(totalRevenue).length > 0 ? formatRevenue(totalRevenue) : '0'}
                </div>

                {paidProjects.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-zinc-500 mb-3">Project Breakdown:</h3>
                    {paidProjects.slice(0, 3).map((project: any) => {
                      const originalCurrency = project.currency || 'USD';
                      const originalAmount = project.displayAmount || project.cost;

                      const displayText = convertToBaseCurrency
                        ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                        : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`;

                      return (
                        <ProjectBreakdownCard
                          key={project.id}
                          project={{ ...project, displayText }}
                          textColorClass="text-green-400"
                          gradientColor="green"
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pending */}
              <div>
                <h2 className="text-2xl font-medium text-zinc-400 mb-4">Pending</h2>
                <div className="text-6xl font-bold text-zinc-600 mb-6">
                  {Object.keys(pendingRevenue).length > 0 ? formatRevenue(pendingRevenue) : '0'}
                </div>

                {pendingProjects.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-zinc-500 mb-3">Project Breakdown:</h3>
                    {pendingProjects.slice(0, 3).map((project: any) => {
                      const originalCurrency = project.currency || 'USD';
                      const originalAmount = project.displayAmount || project.cost;

                      const displayText = convertToBaseCurrency
                        ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                        : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`;

                      return (
                        <ProjectBreakdownCard
                          key={project.id}
                          project={{ ...project, displayText }}
                          textColorClass="text-zinc-400"
                          gradientColor="gray"
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Full Project List Button */}
            <div className="mt-8 mb-8 relative">
              <div className="relative">
                <button
                  onClick={() => setShowAllProjects(!showAllProjects)}
                  className={`w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 font-medium cursor-pointer relative z-20 flex items-center justify-center gap-2 transition-colors ${
                    showAllProjects ? 'rounded-t-lg' : 'rounded-lg'
                  }`}
                  style={{
                    transition: showAllProjects ? 'background-color 150ms' : 'background-color 150ms, border-radius 150ms 250ms'
                  }}
                >
                  <span>Statement</span>
                  {showAllProjects ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </button>
              </div>

              {/* Dropdown menu */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  showAllProjects ? 'max-h-[2000px]' : 'max-h-0'
                }`}
              >
                <div className="bg-zinc-900 rounded-b-lg p-6">
                  {/* Фильтры */}
                  <div className="flex flex-wrap gap-3 mb-6 pb-4 border-b border-zinc-800">
                    <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
                      <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-3 py-1 rounded text-sm transition-colors font-medium ${
                          filterStatus === 'all'
                            ? 'bg-zinc-700 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilterStatus('paid')}
                        className={`px-3 py-1 rounded text-sm transition-colors font-medium ${
                          filterStatus === 'paid'
                            ? 'bg-zinc-700 text-green-400'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Paid
                      </button>
                      <button
                        onClick={() => setFilterStatus('unpaid')}
                        className={`px-3 py-1 rounded text-sm transition-colors font-medium ${
                          filterStatus === 'unpaid'
                            ? 'bg-zinc-700 text-yellow-400'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Pending
                      </button>
                    </div>

                    <div className="flex gap-2 ml-auto relative filter-menu-container">
                      <button
                        onClick={() => setShowManualTransactionModal(true)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors group flex items-center gap-2"
                        title="Add manual transaction"
                      >
                        <Plus className="w-4 h-4 text-white" />
                        <span className="text-sm text-zinc-400 group-hover:text-zinc-200 font-medium">Add Payment</span>
                      </button>
                      <button
                        onClick={() => setShowFilterMenu(!showFilterMenu)}
                        className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-all flex items-center gap-2 font-medium"
                      >
                        <Filter className="w-4 h-4" />
                        <span>Sort by: {sortBy === 'amount' ? 'Cost' : sortBy === 'name' ? 'Name' : sortBy === 'client' ? 'Client' : 'Date'}</span>
                      </button>

                      {showFilterMenu && (
                        <div className="absolute top-full mt-2 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-0 z-50 w-[120px] animate-modal">
                          <button
                            onClick={() => {
                              setSortBy('amount');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm transition-colors rounded-t-lg ${
                              sortBy === 'amount' ? 'bg-accent text-white' : 'text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            Cost
                          </button>
                          <button
                            onClick={() => {
                              setSortBy('name');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                              sortBy === 'name' ? 'bg-accent text-white' : 'text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            Name
                          </button>
                          <button
                            onClick={() => {
                              setSortBy('client');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                              sortBy === 'client' ? 'bg-accent text-white' : 'text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            Client
                          </button>
                          <button
                            onClick={() => {
                              setSortBy('date');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm transition-colors rounded-b-lg ${
                              sortBy === 'date' ? 'bg-accent text-white' : 'text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            Date
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Список всех проектов */}
                  <div className="relative">
                    <SimpleBar
                      scrollableNodeProps={{
                        onScroll: (e) => {
                          const target = e.currentTarget;
                          const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 10;
                          setShowScrollGradient(!isAtBottom);
                        }
                      }}
                      className="custom-scrollbar-fixed"
                      style={{ maxHeight: '384px' }}
                      autoHide={false}
                    >
                      <div className="space-y-1.5 pr-2">
                    {sortedFilteredProjects.map((project: any) => {
                        const originalCurrency = project.currency || 'USD';
                        const originalAmount = project.displayAmount || project.cost;
                        const showConversion = convertToBaseCurrency && originalCurrency !== baseCurrency;
                        const isPaid = project.paymentStatus === 'paid' || project.isPrepaidProject;
                        const projectDate = project.completedAt || project.createdAt || project.date;
                        const formattedDate = projectDate ? new Date(projectDate).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        }) : null;

                        return (
                          <div
                            key={`${project.id}-${project.isPrepaidProject ? 'prepaid' : 'full'}`}
                            className={`group flex justify-between items-center py-2 px-4 rounded-lg transition-all cursor-pointer border ${
                              isPaid
                                ? 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600 hover:shadow-lg'
                                : 'bg-zinc-800/30 border-zinc-700/30 hover:bg-zinc-800/50 hover:border-zinc-700/50'
                            }`}
                          >
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="flex items-center gap-2">
                                <div className={`font-medium truncate transition-colors ${
                                  isPaid
                                    ? 'text-zinc-200 group-hover:text-white'
                                    : 'text-zinc-400 group-hover:text-zinc-300'
                                }`}>
                                  {project.name}
                                </div>
                                {!project.isOtherProject && (
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                    project.status === 'active'
                                      ? 'bg-green-500'
                                      : project.status === 'paused'
                                      ? 'bg-yellow-500'
                                      : project.status === 'completed'
                                      ? 'bg-blue-500'
                                      : 'bg-zinc-500'
                                  }`} />
                                )}
                              </div>
                              {formattedDate && (
                                <div className="text-xs text-zinc-500 mt-0.5">{formattedDate}</div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {project.isPrepaidProject ? (
                                project.showRemainingFirst ? (
                                  // В pending показываем remaining первым
                                  <>
                                    <div className="font-bold text-base text-zinc-500 group-hover:text-zinc-400 transition-colors">
                                      <span className="text-xs text-yellow-500 mr-1.5">Remaining:</span>
                                      {convertToBaseCurrency
                                        ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                                        : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`
                                      }
                                    </div>
                                    <div className="text-sm text-zinc-500 mt-0.5">
                                      <span className="text-xs mr-1.5">Prepayment:</span>
                                      {convertToBaseCurrency
                                        ? `${convertCurrency(project.prepaidAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                                        : `${project.prepaidAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`
                                      }
                                    </div>
                                  </>
                                ) : (
                                  // В paid показываем prepayment первым
                                  <>
                                    <div className="font-bold text-base text-green-400 group-hover:text-green-300 transition-colors">
                                      <span className="text-xs text-yellow-500 mr-1.5">Prepayment:</span>
                                      {convertToBaseCurrency
                                        ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                                        : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`
                                      }
                                    </div>
                                    <div className="text-sm text-zinc-500 mt-0.5">
                                      <span className="text-xs mr-1.5">Remaining:</span>
                                      {convertToBaseCurrency
                                        ? `${convertCurrency(project.remainingAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                                        : `${project.remainingAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`
                                      }
                                    </div>
                                  </>
                                )
                              ) : (
                                <>
                                  <div className={`font-bold text-base transition-colors ${
                                    isPaid
                                      ? 'text-green-400 group-hover:text-green-300'
                                      : 'text-zinc-500 group-hover:text-zinc-400'
                                  }`}>
                                    {!isPaid && (
                                      <span className="text-xs text-zinc-500 mr-1.5">Remaining:</span>
                                    )}
                                    {convertToBaseCurrency
                                      ? `${convertCurrency(originalAmount, originalCurrency, baseCurrency).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currencySymbols[baseCurrency]}`
                                      : `${originalAmount?.toLocaleString()} ${currencySymbols[originalCurrency]}`
                                    }
                                  </div>
                                  {showConversion && (
                                    <div className="text-xs text-zinc-500 mt-0.5">
                                      ({originalAmount?.toLocaleString()} {currencySymbols[originalCurrency]})
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                    })}
                      </div>
                    </SimpleBar>
                    {/* Fade gradient at bottom */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none transition-opacity duration-300 ${
                        showScrollGradient ? 'opacity-100' : 'opacity-0'
                      }`}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="mb-12">
          <h2 className="text-2xl font-medium text-zinc-400 mb-6">Statistics</h2>
          <div className="grid grid-cols-3 gap-6">
            {/* Total Projects */}
            <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <p className="text-sm text-zinc-500 mb-2">Total Projects</p>
              <p className="text-5xl font-bold text-blue-400 mb-2">{projects.length}</p>
              <div className="flex gap-2 text-xs text-zinc-500">
                <span className="text-green-500">{paidProjects.length} paid</span>
                <span>•</span>
                <span className="text-yellow-500">{pendingProjects.length} pending</span>
              </div>
            </div>

            {/* Average Project Value */}
            {paidProjects.length > 0 && (
              <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <p className="text-sm text-zinc-500 mb-2">Average Project Value</p>
                <p className="text-5xl font-bold text-purple-400">
                  {statistics.avgValue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} <span className="text-purple-400">{currencySymbols[statistics.displayCurrency]}</span>
                </p>
              </div>
            )}

            {/* Revenue per Day */}
            <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <p className="text-sm text-zinc-500 mb-2">Revenue per Day</p>
              <p className="text-5xl font-bold text-accent">
                {statistics.dailyRate.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} <span className="text-accent">{currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Finance Analytics */}
        {paidProjects.length > 0 && timelineData && (
          <>
            <h2 className="text-2xl font-medium text-zinc-400 mb-6">Finance Analytics</h2>

            {/* Revenue Timeline Chart */}
            <div className="mb-6">
              <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <h3 className="text-lg font-semibold mb-4 text-zinc-200">Revenue Timeline</h3>
              <div
                ref={timelineContainerRef}
                className="w-full relative"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveMenu('timeline');
                  setTimelineContextMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                {/* Min/Max value tooltips */}
                {showMinMaxTooltips && (() => {
                  const minPoint = timelineData.points.reduce((min, p) => p.amount < min.amount ? p : min);
                  const maxPoint = timelineData.points.reduce((max, p) => p.amount > max.amount ? p : max);
                  return (
                    <>
                      {/* Min value - top left */}
                      <div
                        className="absolute top-0 left-0 text-red-400 text-xs font-medium pointer-events-none"
                      >
                        Min: {minPoint.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                      </div>
                      {/* Max value - top right */}
                      <div
                        className="absolute top-0 right-0 text-green-400 text-xs font-medium pointer-events-none"
                      >
                        Max: {maxPoint.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                      </div>
                    </>
                  );
                })()}
                {/* Hover tooltip */}
                {hoveredPoint && (
                  <div
                    className="absolute bg-zinc-800 text-white px-3 py-2 rounded-lg text-sm border border-zinc-700 pointer-events-none z-10"
                    style={{
                      left: `${((hoveredPoint.x - timelineData.padding) / (timelineData.chartWidth - 2 * timelineData.padding)) * 100}%`,
                      top: `${((hoveredPoint.y - timelineData.padding) / (timelineData.chartHeight - 2 * timelineData.padding)) * 100 - 10}%`,
                      transform: 'translate(-50%, -100%)'
                    }}
                  >
                    {hoveredPoint.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                  </div>
                )}
                <svg viewBox={`0 0 ${timelineData.chartWidth} ${timelineData.chartHeight}`} className="w-full h-64" preserveAspectRatio="none" style={{ overflow: 'visible' }}>

                  {/* Vertical lines from each point to bottom */}
                  {timelineData.points.map((p, i) => (
                    <line
                      key={`vertical-${i}`}
                      x1={p.x}
                      y1={p.y}
                      x2={p.x}
                      y2={timelineData.chartHeight}
                      stroke="#3f3f46"
                      strokeWidth="0.5"
                      strokeDasharray="2.5,4"
                      opacity="0.6"
                    />
                  ))}

                  {/* Area under the line */}
                  <path
                    d={`${timelineData.pathD} L ${timelineData.points[timelineData.points.length - 1].x} ${timelineData.chartHeight} L 0 ${timelineData.chartHeight} Z`}
                    fill="url(#blueGradient)"
                    opacity="0.2"
                  />

                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Line */}
                  <path
                    d={timelineData.pathD}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="0.8"
                    strokeLinejoin="round"
                  />

                  {/* Points */}
                  {timelineData.points.map((p, i) => {
                    const isHovered = hoveredPointIndex === i;
                    const scale = isHovered ? 1.5 : 1;
                    return (
                      <g
                        key={i}
                        style={{
                          filter: isHovered ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8)) drop-shadow(0 0 16px rgba(59, 130, 246, 0.5))' : 'none',
                          transition: 'filter 0.2s ease'
                        }}
                      >
                        <ellipse
                          cx={p.x}
                          cy={p.y}
                          rx={timelineData.pointRadius * 0.85 * scale}
                          ry={timelineData.pointRadius * scale}
                          fill="#18181b"
                          stroke="#3b82f6"
                          strokeWidth="1"
                          style={{ transition: 'all 0.2s ease' }}
                        />
                        <ellipse
                          cx={p.x}
                          cy={p.y}
                          rx={(timelineData.pointRadius / 2) * 0.85 * scale}
                          ry={(timelineData.pointRadius / 2) * scale}
                          fill="#3b82f6"
                          style={{ transition: 'all 0.2s ease' }}
                        />
                        {/* Invisible larger circle for better hover area */}
                        <ellipse
                          cx={p.x}
                          cy={p.y}
                          rx={(timelineData.pointRadius * 2) * 0.85}
                          ry={timelineData.pointRadius * 2}
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => {
                            setHoveredPoint(p);
                            setHoveredPointIndex(i);
                          }}
                          onMouseLeave={() => {
                            setHoveredPoint(null);
                            setHoveredPointIndex(null);
                          }}
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Date labels */}
                <div className="flex justify-between mt-4 text-xs text-zinc-500">
                  {timelineData.cumulativeData.map((item, i) => {
                    const dateObj = new Date(item.date);
                    const formattedDate = dateObj.toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit'
                    });
                    return (
                      <span key={i} style={{ marginLeft: i === 0 ? '0' : 'auto' }}>{formattedDate}</span>
                    );
                  })}
                </div>
              </div>
              </div>
            </div>

            {/* Timeline Context Menu */}
            {timelineContextMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setTimelineContextMenu(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTimelineContextMenu(null);
                  }}
                />
                <div
                  ref={timelineContextMenuRef}
                  className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px] animate-context-menu"
                  style={{
                    top: (() => {
                      const menuHeight = timelineContextMenuRef.current?.offsetHeight || 100;
                      const windowHeight = window.innerHeight;
                      const wouldOverflow = timelineContextMenu.y + menuHeight > windowHeight;
                      return wouldOverflow ? windowHeight - menuHeight - 10 : timelineContextMenu.y;
                    })(),
                    left: (() => {
                      const menuWidth = timelineContextMenuRef.current?.offsetWidth || 180;
                      const windowWidth = window.innerWidth;
                      const wouldOverflow = timelineContextMenu.x + menuWidth > windowWidth;
                      return wouldOverflow ? windowWidth - menuWidth - 10 : timelineContextMenu.x;
                    })()
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setShowMinMaxTooltips(!showMinMaxTooltips);
                      setTimelineContextMenu(null);
                      setActiveMenu(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      <span>Show Min/Max Values</span>
                    </div>
                    {showMinMaxTooltips && (
                      <Check className="w-3.5 h-3.5 text-zinc-200 flex-shrink-0" />
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Monthly Revenue Breakdown - Last 12 months */}
            {paidProjects.length > 0 && (
              <div className="mb-6">
                <div data-finance-container className="bg-zinc-900 rounded-xl p-8 border border-zinc-800">
                  <h3 className="text-lg font-semibold mb-4 text-zinc-200">Monthly Revenue Breakdown</h3>
              {(() => {
                // Get last 12 months
                const now = new Date();
                const months = [];
                for (let i = 11; i >= 0; i--) {
                  const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                  months.push({
                    date,
                    name: date.toLocaleDateString('en-US', { month: 'short' }),
                    year: date.getFullYear(),
                    monthIndex: date.getMonth()
                  });
                }

                // Calculate revenue for each month
                const monthlyRevenue = months.map(month => {
                  const projectsInMonth = paidProjects.filter((p: any) => {
                    const dateToUse = p.completedAt || p.createdAt;
                    if (!dateToUse) return false;
                    const completedDate = new Date(dateToUse);
                    return completedDate.getFullYear() === month.year &&
                           completedDate.getMonth() === month.monthIndex;
                  });

                  const revenue = projectsInMonth.reduce((sum: number, p: any) => {
                    const originalCurrency = p.currency || 'USD';
                    const originalAmount = p.displayAmount || p.cost || 0;
                    const displayAmount = convertToBaseCurrency && originalCurrency !== baseCurrency
                      ? convertCurrency(originalAmount, originalCurrency, baseCurrency)
                      : originalAmount;
                    return sum + displayAmount;
                  }, 0);

                  return { ...month, revenue, projectCount: projectsInMonth.length };
                });

                // Threshold normalization like Weekly Timeline
                const actualMaxRevenue = Math.max(...monthlyRevenue.map(m => m.revenue), 0);
                const threshold = getThresholdForCurrency(convertToBaseCurrency ? baseCurrency : 'USD');
                const maxRevenue = Math.max(actualMaxRevenue, threshold);

                const totalYearRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
                const avgMonthlyRevenue = totalYearRevenue / 12;

                return (
                  <>
                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-zinc-800">
                      <div className="text-center">
                        <div className="text-xs text-zinc-500 mb-1">Total (12mo)</div>
                        <div className="text-xl font-bold text-blue-400">
                          {totalYearRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-zinc-500 mb-1">Average/Month</div>
                        <div className="text-xl font-bold text-purple-400">
                          {avgMonthlyRevenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-zinc-500 mb-1">Best Month</div>
                        <div className="text-xl font-bold text-green-400">
                          {Math.max(...monthlyRevenue.map(m => m.revenue)).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                        </div>
                      </div>
                    </div>

                    {/* Bar chart */}
                    <div className="flex items-end justify-between gap-3">
                      {monthlyRevenue.map((month, index) => {
                        const heightPercent = maxRevenue > 0 ? (month.revenue / maxRevenue) * 100 : 0;
                        const isCurrentMonth = month.year === now.getFullYear() && month.monthIndex === now.getMonth();
                        const isHovered = hoveredMonthIndex === index;
                        const isFaded = hoveredMonthIndex !== null && !isHovered;

                        return (
                          <div
                            key={index}
                            className="flex flex-col items-center gap-3 group"
                            style={{ flex: '1 1 0' }}
                            onMouseEnter={() => {
                              // Only trigger hover effect if this bar has revenue > 0
                              if (month.revenue > 0) {
                                setHoveredMonthIndex(index);
                              }
                            }}
                            onMouseLeave={() => setHoveredMonthIndex(null)}
                          >
                            {/* Bar */}
                            <div className="relative flex items-end justify-center" style={{ height: '240px', width: '100%' }}>
                              {/* Background bar (подложка) */}
                              <div
                                className="absolute bottom-0 w-8 h-full rounded-t-lg bg-zinc-800 opacity-20"
                              />

                              {/* Bar element */}
                              <div
                                className={`w-8 rounded-t-lg transition-all duration-300 relative z-10 ${
                                  month.revenue === 0
                                    ? 'bg-zinc-800'
                                    : isCurrentMonth
                                      ? 'bg-gradient-to-t from-purple-600 via-purple-500 to-purple-400'
                                      : 'bg-gradient-to-t from-zinc-700 via-zinc-600 to-zinc-500'
                                }`}
                                style={{
                                  height: month.revenue === 0 ? '3px' : `${heightPercent}%`,
                                  minHeight: month.revenue > 0 ? '8px' : '3px',
                                  boxShadow: isCurrentMonth
                                    ? (isHovered ? '0 0 30px rgba(168, 85, 247, 0.7)' : '0 0 20px rgba(168, 85, 247, 0.5)')
                                    : (isHovered ? '0 0 20px rgba(113, 113, 122, 0.5)' : '0 0 0 rgba(0, 0, 0, 0)'),
                                  transition: 'all 0.3s ease',
                                  opacity: isFaded ? 0.3 : 1
                                }}
                              >
                                {/* Glow effect */}
                                {month.revenue > 0 && (
                                  <div className={`absolute inset-0 rounded-t-lg ${
                                    isCurrentMonth ? 'bg-purple-400' : 'bg-zinc-400'
                                  } opacity-0 group-hover:opacity-20 transition-opacity`} />
                                )}

                                {/* Tooltip with project count on hover */}
                                {month.revenue > 0 && month.projectCount > 0 && (
                                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                    <div className="bg-zinc-800 text-white px-3 py-2 rounded-lg shadow-xl border border-zinc-700 whitespace-nowrap">
                                      <div className="text-xs text-zinc-400">
                                        {month.projectCount} project{month.projectCount !== 1 ? 's' : ''}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Month label + Revenue */}
                            <div className="text-center h-10 flex flex-col items-center justify-start select-none relative">
                              <div className={`text-sm font-medium transition-colors ${
                                isCurrentMonth ? 'text-purple-400' : 'text-zinc-400'
                              } group-hover:text-white`}>
                                {month.name}
                              </div>
                              {month.year !== now.getFullYear() ? (
                                <div className="text-[10px] text-zinc-600">'{String(month.year).slice(-2)}</div>
                              ) : (
                                <div className="text-[10px] text-transparent">'{String(month.year).slice(-2)}</div>
                              )}
                              {/* Revenue value - absolute positioned to not affect layout */}
                              {month.revenue > 0 && (
                                <div className={`absolute top-full -mt-1 text-xs font-medium whitespace-nowrap ${
                                  isCurrentMonth ? 'text-purple-300' : 'text-zinc-500'
                                }`}>
                                  {month.revenue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
                </div>
              </div>
            )}

        {/* Top 3 Projects by Revenue */}
        {paidProjects.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-[1fr,300px] gap-6 items-start">
              <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                <h3 className="text-lg font-semibold mb-4 text-zinc-200">Top 3 Projects by Revenue</h3>
                <div className="space-y-4">
                  {top3Projects.map(({ project, displayAmount, displayCurr, percentage }) => {
                    const projectColor = getProjectColor(project);
                    return (
                      <div key={project.id} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-300 truncate flex-1 mr-4">{project.name}</span>
                          <span className="text-green-400 font-medium">
                            {displayAmount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[displayCurr]}
                          </span>
                        </div>
                        <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                              background: createSoftGradient(projectColor)
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-end px-3">
                            <span className="text-xs font-medium text-white" style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.6)' }}>
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

              {/* Pie Chart */}
              <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 flex items-center justify-center h-full">
                {projectsPieChartData.length > 0 ? (
                  <PieChart data={projectsPieChartData} title="All&#10;Projects" id="projects" />
                ) : (
                  <div className="text-zinc-500">No data</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Top 3 Clients by Revenue */}
        {paidProjects.length > 0 && (
          <div>
            <div className="grid grid-cols-[1fr,300px] gap-6 items-start">
              <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 min-h-[280px]">
                <h3 className="text-lg font-semibold mb-4 text-zinc-200">Top 3 Clients by Revenue</h3>
                <div className="space-y-4">
                  {top3Clients.map(({ clientId, data, percentage }) => {
                    const clientColor = data.client.color || '#8b5cf6'; // fallback to purple
                    return (
                      <div key={clientId} className="space-y-2">
                        <div className="flex justify-between text-sm items-center">
                          <div className="flex items-center gap-2 truncate flex-1 mr-4">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: clientColor }}
                            />
                            <span className="text-zinc-300 truncate">{data.client.name}</span>
                            <span className="text-zinc-500">({data.projectCount} project{data.projectCount !== 1 ? 's' : ''})</span>
                          </div>
                          <span className="text-purple-400 font-medium">
                            {data.amount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {currencySymbols[convertToBaseCurrency ? baseCurrency : 'USD']}
                          </span>
                        </div>
                        <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                              background: createSoftGradient(clientColor)
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-end px-3">
                            <span className="text-xs font-medium text-white" style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.6)' }}>
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Placeholders for missing clients */}
                  {Array.from({ length: Math.max(0, 3 - top3Clients.length) }).map((_, index) => (
                    <div key={`placeholder-${index}`} className="space-y-2">
                      <div className="flex justify-between text-sm items-center opacity-30">
                        <div className="flex items-center gap-2 truncate flex-1 mr-4">
                          <div className="w-3 h-3 rounded-full flex-shrink-0 bg-zinc-700" />
                          <span className="text-zinc-600">—</span>
                        </div>
                      </div>
                      <div className="relative h-8 bg-zinc-800/50 rounded-lg" />
                    </div>
                  ))}
              </div>
            </div>

              {/* Pie Chart */}
              <div data-finance-container className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 flex items-center justify-center h-full">
                {clientsPieChartData.length > 0 ? (
                  <PieChart data={clientsPieChartData} title="All&#10;Clients" id="clients" />
                ) : (
                  <div className="text-zinc-500">No data</div>
                )}
              </div>
            </div>
          </div>
        )}
          </>
        )}

          {/* Time Analytics Section */}
          {!selectedProject && timeTrackingEnabled && (
            <TimeAnalytics
              projects={projects}
              baseCurrency={baseCurrency}
              convertCurrency={convertCurrency}
            />
          )}
            </div>
          )}
        </div>
      </SimpleBar>

      {/* Manual Transaction Modal */}
      <ManualTransactionModal
        isOpen={showManualTransactionModal}
        onClose={() => setShowManualTransactionModal(false)}
        projects={projects}
        otherProjectTransactions={otherProjectTransactions}
        onAddTransaction={handleAddTransaction}
        onRemoveTransaction={handleRemoveTransaction}
      />
    </div>
  );
});
