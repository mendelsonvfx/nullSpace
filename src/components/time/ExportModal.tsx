// src/components/time/ExportModal.tsx
import React, { useState } from 'react';
import { X, FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { Project, Client } from '../../types/project';
import { formatTime, formatSoftwareName } from '../../features/time-tracking';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { invoke } from '@tauri-apps/api';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  client?: Client;
}

type ExportFormat = 'pdf' | 'csv' | 'json' | 'markdown';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, project, client }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportedFilename, setExportedFilename] = useState<string>('');
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState(false);

  if (!isOpen) return null;

  const getCurrencySymbol = (currency?: string) => {
    const symbols: Record<string, string> = {
      'USD': '$',
      'RUB': '₽',
      'EUR': '€',
      'GBP': '£'
    };
    return symbols[currency || 'USD'] || currency || '$';
  };

  const exportPDF = async () => {
    const entries = project.timeEntries?.filter(e => !e.isActive) || [];
    const currencySymbol = getCurrencySymbol(project.currency);

    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.text(`Time Report: ${project.name}`, 14, 22);

    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
    if (client) {
      doc.text(`Client: ${client.name}`, 14, 36);
    }

    // Summary section
    let yPos = client ? 46 : 40;
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Summary', 14, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.text(`Total Time: ${formatTime(project.totalMinutesSpent || 0)}`, 14, yPos);

    if (project.hourlyRate) {
      yPos += 6;
      doc.text(`Hourly Rate (Actual): ${currencySymbol}${project.hourlyRate.toFixed(2)}/h`, 14, yPos);
    }

    if (project.targetHourlyRate) {
      yPos += 6;
      doc.text(`Hourly Rate (Target): ${currencySymbol}${project.targetHourlyRate.toFixed(2)}/h`, 14, yPos);
    }

    if (project.cost) {
      yPos += 6;
      doc.text(`Total Cost: ${currencySymbol}${project.cost.toFixed(2)}`, 14, yPos);
    }

    // Software Breakdown
    const bySoftware = new Map<string, number>();
    entries.forEach(e => {
      const name = formatSoftwareName(e.software);
      bySoftware.set(name, (bySoftware.get(name) || 0) + e.durationMinutes);
    });

    if (bySoftware.size > 0) {
      yPos += 12;
      doc.setFontSize(14);
      doc.text('Software Breakdown', 14, yPos);

      yPos += 6;
      doc.setFontSize(10);
      bySoftware.forEach((minutes, software) => {
        yPos += 6;
        doc.text(`${software}: ${formatTime(minutes)}`, 20, yPos);
      });
    }

    // Time Entries Table
    yPos += 12;
    const tableData = entries
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .map(entry => {
        const date = new Date(entry.startTime).toLocaleDateString();
        const software = formatSoftwareName(entry.software);
        const duration = formatTime(entry.durationMinutes);
        const shot = entry.shotId
          ? `Shot ${project.shots?.find(s => s.id === entry.shotId)?.number || ''}`
          : '-';
        const type = entry.isManual ? 'Manual' : 'Auto';
        const notes = entry.notes || '-';

        return [date, software, duration, shot, type, notes];
      });

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Software', 'Duration', 'Shot', 'Type', 'Notes']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 30 },
        2: { cellWidth: 20 },
        3: { cellWidth: 25 },
        4: { cellWidth: 20 },
        5: { cellWidth: 'auto' }
      }
    });

    // Save PDF to project folder
    const pdfBytes = doc.output('arraybuffer');
    const uint8Array = new Uint8Array(pdfBytes);
    const filename = `${project.name}_time_report_${Date.now()}.pdf`;

    try {
      await invoke('save_project_file', {
        projectPath: project.path,
        filename,
        contents: Array.from(uint8Array)
      });

      return filename;
    } catch (error) {
      console.error('Failed to save PDF:', error);
      throw error;
    }
  };

  const exportCSV = async () => {
    const entries = project.timeEntries || [];
    const currencySymbol = getCurrencySymbol(project.currency);

    let csv = `Time Report: ${project.name}\n`;
    csv += `Generated: ${new Date().toLocaleDateString()}\n`;
    if (client) {
      csv += `Client: ${client.name}\n`;
    }
    csv += '\n';

    csv += 'Date,Software,Duration (hours),Shot,Type,Notes\n';

    entries
      .filter(e => !e.isActive)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .forEach(entry => {
        const date = new Date(entry.startTime).toLocaleDateString();
        const hours = (entry.durationMinutes / 60).toFixed(2);
        const shot = entry.shotId
          ? `Shot ${project.shots?.find(s => s.id === entry.shotId)?.number || ''}`
          : '';
        const type = entry.isManual ? 'Manual' : 'Auto';
        const notes = (entry.notes || '').replace(/"/g, '""');

        csv += `${date},${formatSoftwareName(entry.software)},${hours},"${shot}",${type},"${notes}"\n`;
      });

    csv += '\n';
    csv += 'SUMMARY\n';
    csv += `Total Hours,${((project.totalMinutesSpent || 0) / 60).toFixed(2)}\n`;
    csv += `Currency,${project.currency || 'USD'}\n`;
    csv += `Hourly Rate (Actual),${currencySymbol}${project.hourlyRate?.toFixed(2) || 'N/A'}\n`;
    csv += `Hourly Rate (Target),${currencySymbol}${project.targetHourlyRate?.toFixed(2) || 'N/A'}\n`;
    csv += `Total Cost,${currencySymbol}${project.cost || 0}\n`;

    const filename = `${project.name}_time_report_${Date.now()}.csv`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(csv);

    try {
      await invoke('save_project_file', {
        projectPath: project.path,
        filename,
        contents: Array.from(bytes)
      });

      return filename;
    } catch (error) {
      console.error('Failed to save CSV:', error);
      throw error;
    }
  };

  const exportJSON = async () => {
    const entries = project.timeEntries || [];

    const report = {
      project: {
        name: project.name,
        id: project.id,
        client: client?.name
      },
      generated: new Date().toISOString(),
      summary: {
        totalHours: (project.totalMinutesSpent || 0) / 60,
        hourlyRateActual: project.hourlyRate || null,
        hourlyRateTarget: project.targetHourlyRate || null,
        totalCost: project.cost || 0
      },
      entries: entries
        .filter(e => !e.isActive)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .map(entry => ({
          date: new Date(entry.startTime).toISOString(),
          software: entry.software,
          durationMinutes: entry.durationMinutes,
          durationHours: entry.durationMinutes / 60,
          shot: entry.shotId
            ? project.shots?.find(s => s.id === entry.shotId)?.name
            : null,
          type: entry.isManual ? 'manual' : 'auto',
          notes: entry.notes || null
        }))
    };

    const filename = `${project.name}_time_report_${Date.now()}.json`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(JSON.stringify(report, null, 2));

    try {
      await invoke('save_project_file', {
        projectPath: project.path,
        filename,
        contents: Array.from(bytes)
      });

      return filename;
    } catch (error) {
      console.error('Failed to save JSON:', error);
      throw error;
    }
  };

  const exportMarkdown = async () => {
    const entries = project.timeEntries || [];
    const currencySymbol = getCurrencySymbol(project.currency);

    let md = `# Time Report: ${project.name}\n\n`;
    md += `**Generated:** ${new Date().toLocaleDateString()}\n`;
    if (client) {
      md += `**Client:** ${client.name}\n`;
    }
    md += '\n';

    md += '## Summary\n\n';
    md += `- **Total Time:** ${formatTime(project.totalMinutesSpent || 0)}\n`;
    md += `- **Currency:** ${project.currency || 'USD'}\n`;
    if (project.hourlyRate) {
      md += `- **Hourly Rate (Actual):** ${currencySymbol}${project.hourlyRate.toFixed(2)}/h\n`;
    }
    if (project.targetHourlyRate) {
      md += `- **Hourly Rate (Target):** ${currencySymbol}${project.targetHourlyRate.toFixed(2)}/h\n`;
    }
    if (project.cost) {
      md += `- **Total Cost:** ${currencySymbol}${project.cost.toFixed(2)}\n`;
    }
    md += '\n';

    const bySoftware = new Map<string, number>();
    entries.forEach(e => {
      const name = formatSoftwareName(e.software);
      bySoftware.set(name, (bySoftware.get(name) || 0) + e.durationMinutes);
    });

    if (bySoftware.size > 0) {
      md += '## Software Breakdown\n\n';
      bySoftware.forEach((minutes, software) => {
        md += `- **${software}:** ${formatTime(minutes)}\n`;
      });
      md += '\n';
    }

    md += '## Time Entries\n\n';
    md += '| Date | Software | Duration | Shot | Type | Notes |\n';
    md += '|------|----------|----------|------|------|-------|\n';

    entries
      .filter(e => !e.isActive)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .forEach(entry => {
        const date = new Date(entry.startTime).toLocaleDateString();
        const software = formatSoftwareName(entry.software);
        const duration = formatTime(entry.durationMinutes);
        const shot = entry.shotId
          ? `Shot ${project.shots?.find(s => s.id === entry.shotId)?.number || ''}`
          : '-';
        const type = entry.isManual ? 'Manual' : 'Auto';
        const notes = (entry.notes || '-').replace(/\|/g, '\\|');

        md += `| ${date} | ${software} | ${duration} | ${shot} | ${type} | ${notes} |\n`;
      });

    const filename = `${project.name}_time_report_${Date.now()}.md`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(md);

    try {
      await invoke('save_project_file', {
        projectPath: project.path,
        filename,
        contents: Array.from(bytes)
      });

      return filename;
    } catch (error) {
      console.error('Failed to save Markdown:', error);
      throw error;
    }
  };

  const handleExport = async () => {
    setIsExporting(true);

    // Add minimum delay to show "Exporting..." state (prevents flicker)
    const minDelay = new Promise(resolve => setTimeout(resolve, 500));

    try {
      let filename: string;

      const exportPromise = (async () => {
        switch (selectedFormat) {
          case 'pdf':
            return await exportPDF();
          case 'csv':
            return await exportCSV();
          case 'json':
            return await exportJSON();
          case 'markdown':
            return await exportMarkdown();
        }
      })();

      // Wait for both export and minimum delay
      [filename] = await Promise.all([exportPromise, minDelay]);

      console.log(`Report exported successfully: ${filename}`);

      // Show success state
      setExportedFilename(filename);
      setExportSuccess(true);

      // Hide spinner after 1 second, button stays as "Open Report Folder"
      setTimeout(() => {
        setIsExporting(false);
      }, 1000);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export report. Please try again.');
      setIsExporting(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await invoke('open_in_explorer', { path: project.path });
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  const formats = [
    {
      type: 'pdf' as ExportFormat,
      icon: FileDown,
      color: 'text-red-400',
      title: 'PDF Document',
      description: 'Professional formatted report'
    },
    {
      type: 'csv' as ExportFormat,
      icon: FileSpreadsheet,
      color: 'text-green-400',
      title: 'CSV Spreadsheet',
      description: 'Excel compatible format'
    },
    {
      type: 'json' as ExportFormat,
      icon: FileText,
      color: 'text-blue-400',
      title: 'JSON Data',
      description: 'Machine readable format'
    },
    {
      type: 'markdown' as ExportFormat,
      icon: FileText,
      color: 'text-purple-400',
      title: 'Markdown',
      description: 'Human readable format'
    }
  ];

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setMouseDownOnBackdrop(true);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownOnBackdrop) {
      onClose();
    }
    setMouseDownOnBackdrop(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-semibold text-white">Export Time Report</h2>
            <p className="text-sm text-zinc-500 mt-1">{project.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-zinc-400 mb-4">Select export format:</p>

          <div className="grid grid-cols-2 gap-3">
            {formats.map((format) => {
              const Icon = format.icon;
              const isSelected = selectedFormat === format.type;

              return (
                <button
                  key={format.type}
                  onClick={() => setSelectedFormat(format.type)}
                  className={`
                    p-4 rounded-xl border-2 transition-all text-left
                    ${isSelected
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800'
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 ${format.color} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm mb-1">
                        {format.title}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {format.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-zinc-800">
          {exportSuccess && exportedFilename && (
            <div className="text-sm text-green-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
              </svg>
              <span>{exportedFilename}</span>
            </div>
          )}
          <div className={`flex items-center gap-3 ${!exportSuccess ? 'ml-auto' : ''}`}>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              disabled={isExporting}
            >
              {exportSuccess ? 'Close' : 'Cancel'}
            </button>
            {!exportSuccess ? (
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-6 py-2 rounded-lg bg-accent hover:bg-accent/90 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium transition-colors flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    Export Report
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleOpenFolder}
                className="px-6 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Open Report Folder
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
