// src/components/modals/ExportModal.tsx
import React, { useState } from 'react';
import { X, FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { Project, Client } from '../../types/project';
import { formatTime, formatSoftwareName } from '../../features/time-tracking';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { invoke } from '@tauri-apps/api';
import appIcon from '../../appIcon';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  client?: Client;
}

type ExportFormat = 'pdf' | 'csv' | 'json' | 'markdown';
type PdfTheme = 'dark' | 'light';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, project, client }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [pdfTheme, setPdfTheme] = useState<PdfTheme>('dark');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportedFilename, setExportedFilename] = useState<string>('');
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState(false);

  if (!isOpen) return null;

  const getCurrencySymbol = (currency?: string) => {
    const symbols: Record<string, string> = {
      'USD': '$',
      'RUB': 'RUB ',
      'EUR': 'EUR '
    };
    return symbols[currency || 'USD'] || currency || '$';
  };

  const exportPDF = async () => {
    const entries = project.timeEntries?.filter(e => !e.isActive && e.durationMinutes > 0) || [];
    const currencySymbol = getCurrencySymbol(project.currency);

    // Load logo as base64 Data URL to avoid canvas CORS restrictions in Tauri webview
    let logoDataUrl: string | null = null;
    try {
      const res = await fetch(appIcon);
      const blob = await res.blob();
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      // Logo unavailable — continue without it
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // ---- Palette ----
    const isDark = pdfTheme === 'dark';
    type RGB = [number, number, number];
    const palette: Record<string, RGB> = {
      pageBg:    isDark ? [24, 24, 27]    : [255, 255, 255],
      cardBg:    isDark ? [39, 39, 42]    : [243, 244, 246],
      rowAlt:    isDark ? [32, 32, 35]    : [249, 250, 251],
      textMain:  isDark ? [255, 255, 255] : [17, 24, 39],
      textMuted: isDark ? [161, 161, 170] : [107, 114, 128],
      border:    isDark ? [63, 63, 70]    : [209, 213, 219],
      accent:    isDark ? [139, 92, 246]  : [109, 40, 217],
      tableText: isDark ? [212, 212, 216] : [55, 65, 81],
      dateHdrBg: isDark ? [35, 30, 50]   : [237, 233, 254],
    };
    const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
    const ink  = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

    // ---- Multi-page background: subscribe before any autoTable call ----
    (doc.internal as any).events.subscribe('addPage', () => {
      fill(palette.pageBg);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      if (isDark) {
        fill(palette.accent);
        doc.rect(0, 0, pageWidth, 3, 'F');
      }
    });

    // ---- Page 1 background ----
    fill(palette.pageBg);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Header accent bar
    fill(palette.accent);
    doc.rect(0, 0, pageWidth, 8, 'F');

    // Project name (main title)
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    ink(palette.textMain);
    doc.text(project.name, 14, 22);

    // Subtitle
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    ink(palette.textMuted);
    doc.text('Project Report', 14, 30);

    // nullSpace branding in top right with "Generated in:" prefix
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    ink(palette.textMuted);
    const generatedInText = 'Generated in: ';
    const generatedInWidth = doc.getTextWidth(generatedInText);

    doc.setFont('helvetica', 'bold');
    ink(palette.textMain);
    const brandText = 'nullSpace';
    const brandTextWidth = doc.getTextWidth(brandText);

    const totalWidth = generatedInWidth + brandTextWidth;
    const startX = pageWidth - totalWidth - 14;

    doc.setFont('helvetica', 'normal');
    ink(palette.textMuted);
    doc.text(generatedInText, startX, 22);

    doc.setFont('helvetica', 'bold');
    ink(palette.textMain);
    const brandTextX = startX + generatedInWidth;
    doc.text(brandText, brandTextX, 22);

    // Logo after nullSpace text
    const textHeight = 10;
    const logoSize = 4;
    const logoX = brandTextX + brandTextWidth + 1;
    const logoY = 24.3 - (logoSize / 2) - (textHeight * 0.35);
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoSize, logoSize);
    }

    // ---- Summary Cards ----
    let yPos = 40;
    doc.setFontSize(14);
    ink(palette.textMain);
    doc.text('Summary', 14, yPos);

    yPos += 8;
    const cardWidth = (pageWidth - 28 - 8) / 3;
    const cardHeight = 24;

    // Time Card
    fill(palette.cardBg);
    doc.roundedRect(14, yPos, cardWidth, cardHeight, 2, 2, 'F');
    fill(palette.accent);
    doc.rect(14, yPos, cardWidth, 3, 'F');

    doc.setFontSize(9);
    ink(palette.textMuted);
    doc.text('Total Time', 18, yPos + 10);
    doc.setFontSize(14);
    ink(palette.textMain);
    doc.text(formatTime(project.totalMinutesSpent || 0), 18, yPos + 18);

    // Cost Card
    if (project.cost) {
      fill(palette.cardBg);
      doc.roundedRect(14 + cardWidth + 4, yPos, cardWidth, cardHeight, 2, 2, 'F');
      doc.setFillColor(34, 197, 94);
      doc.rect(14 + cardWidth + 4, yPos, cardWidth, 3, 'F');

      doc.setFontSize(9);
      ink(palette.textMuted);
      doc.text('Total Cost', 18 + cardWidth + 4, yPos + 10);
      doc.setFontSize(14);
      ink(palette.textMain);
      doc.text(`${currencySymbol}${Math.round(project.cost)}`, 18 + cardWidth + 4, yPos + 18);
    }

    // Rate Card
    if (project.hourlyRate) {
      fill(palette.cardBg);
      doc.roundedRect(14 + (cardWidth + 4) * 2, yPos, cardWidth, cardHeight, 2, 2, 'F');
      doc.setFillColor(251, 191, 36);
      doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth, 3, 'F');

      doc.setFontSize(9);
      ink(palette.textMuted);
      doc.text('Hourly Rate', 18 + (cardWidth + 4) * 2, yPos + 10);
      doc.setFontSize(14);
      ink(palette.textMain);
      doc.text(`${currencySymbol}${Math.round(project.hourlyRate)}/h`, 18 + (cardWidth + 4) * 2, yPos + 18);
    }

    // Always advance past cards (fixes yPos bug when bySoftware is empty)
    yPos += cardHeight + 12;

    // ---- Software Breakdown ----
    const bySoftware = new Map<string, number>();
    entries.forEach(e => {
      const name = formatSoftwareName(e.software);
      bySoftware.set(name, (bySoftware.get(name) || 0) + e.durationMinutes);
    });

    if (bySoftware.size > 0) {
      doc.setFontSize(14);
      ink(palette.textMain);
      doc.text('Software Breakdown', 14, yPos);

      yPos += 4;
      const softwareData = Array.from(bySoftware.entries()).map(([software, minutes]) => [
        software,
        formatTime(minutes),
        `${((minutes / (project.totalMinutesSpent || 1)) * 100).toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Software', 'Time', 'Percentage']],
        body: softwareData,
        theme: 'plain',
        headStyles: {
          fillColor: palette.accent,
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: 'bold',
          cellPadding: 4
        },
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: palette.border,
          lineWidth: 0.5,
          textColor: palette.tableText,
          fillColor: palette.cardBg
        },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 40, halign: 'right' },
          2: { cellWidth: 30, halign: 'right' }
        },
        margin: { left: 14, right: 14 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // ---- Detailed Time Entries ----
    doc.setFontSize(14);
    ink(palette.textMain);
    doc.text('Detailed Time Entries', 14, yPos);

    yPos += 4;

    // Auto-detect empty columns
    const hasNotes  = entries.some(e => e.notes && e.notes.trim() !== '' && e.notes !== '-');
    const hasManual = entries.some(e => e.isManual);

    const headers = ['Software', 'Duration', 'Shot'];
    if (hasManual) headers.push('Type');
    if (hasNotes)  headers.push('Notes');

    // Group entries by date
    const sorted = [...entries].sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    const byDate = new Map<string, typeof sorted>();
    for (const e of sorted) {
      const d = new Date(e.startTime);
      const key = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(e);
    }

    const body: any[] = [];
    for (const [dateStr, dayEntries] of byDate) {
      const dayTotal = dayEntries.reduce((s, e) => s + e.durationMinutes, 0);

      // Date group header row — spans all columns
      body.push([{
        content: `${dateStr}   ·   ${formatTime(dayTotal)}`,
        colSpan: headers.length,
        styles: {
          fontStyle: 'bold',
          fontSize: 8.5,
          textColor: palette.accent,
          fillColor: palette.dateHdrBg,
          cellPadding: { top: 4, bottom: 4, left: 8, right: 8 },
        },
      }]);

      for (const e of dayEntries) {
        const shotLabel = (() => {
          if (!e.shotId) return '-';
          const num = project.shots?.find(s => s.id === e.shotId)?.number;
          return num != null ? `Shot ${num}` : '-';
        })();

        const row: any[] = [
          formatSoftwareName(e.software),
          formatTime(e.durationMinutes),
          shotLabel,
        ];
        if (hasManual) row.push(e.isManual ? 'Manual' : 'Auto');
        if (hasNotes)  row.push(e.notes || '-');
        body.push(row);
      }
    }

    autoTable(doc, {
      startY: yPos,
      head: [headers],
      body,
      theme: 'plain',
      headStyles: {
        fillColor: palette.accent,
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        cellPadding: 3
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: palette.tableText,
        fillColor: palette.cardBg,
        lineColor: palette.border,
        lineWidth: 0.5
      },
      alternateRowStyles: {
        fillColor: palette.rowAlt,
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 22, halign: 'right' },
        2: { cellWidth: 28 },
      },
      margin: { left: 14, right: 14 }
    });

    // ---- Footer ----
    yPos = (doc as any).lastAutoTable.finalY + 16;
    fill(palette.cardBg);
    doc.roundedRect(14, yPos, pageWidth - 28, client ? 18 : 12, 2, 2, 'F');

    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    ink(palette.textMuted);
    doc.text(`Generated: ${new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`, 18, yPos);

    if (client) {
      yPos += 5;
      doc.text(`Client: ${client.name}`, 18, yPos);
    }

    // Save PDF to project folder
    const pdfBytes = doc.output('arraybuffer');
    const uint8Array = new Uint8Array(pdfBytes);

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
    const filename = `${project.name}_report_${dateStr}.pdf`;

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
    const entries = project.timeEntries?.filter(e => !e.isActive && e.durationMinutes > 0) || [];
    const currencySymbol = getCurrencySymbol(project.currency);

    let csv = `Project Report: ${project.name}\n`;
    csv += `Generated: ${new Date().toLocaleDateString()}\n`;
    if (client) {
      csv += `Client: ${client.name}\n`;
    }
    csv += '\n';

    csv += 'Date,Software,Duration (hours),Shot,Type,Notes\n';

    entries
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
    csv += `Hourly Rate,${currencySymbol}${Math.round(project.hourlyRate || 0)}\n`;
    csv += `Total Cost,${currencySymbol}${Math.round(project.cost || 0)}\n`;

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
    const filename = `${project.name}_report_${dateStr}.csv`;
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
    const entries = project.timeEntries?.filter(e => !e.isActive && e.durationMinutes > 0) || [];

    const report = {
      project: {
        name: project.name,
        id: project.id,
        client: client?.name
      },
      generated: new Date().toISOString(),
      summary: {
        totalHours: (project.totalMinutesSpent || 0) / 60,
        hourlyRate: Math.round(project.hourlyRate || 0),
        totalCost: Math.round(project.cost || 0),
        currency: project.currency || 'USD'
      },
      entries: entries
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

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
    const filename = `${project.name}_report_${dateStr}.json`;
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
    const entries = project.timeEntries?.filter(e => !e.isActive && e.durationMinutes > 0) || [];
    const currencySymbol = getCurrencySymbol(project.currency);

    let md = `# Project Report: ${project.name}\n\n`;
    md += `**Generated:** ${new Date().toLocaleDateString()}\n`;
    if (client) {
      md += `**Client:** ${client.name}\n`;
    }
    md += '\n';

    md += '## Summary\n\n';
    md += `- **Total Time:** ${formatTime(project.totalMinutesSpent || 0)}\n`;
    md += `- **Currency:** ${project.currency || 'USD'}\n`;
    if (project.hourlyRate) {
      md += `- **Hourly Rate:** ${currencySymbol}${Math.round(project.hourlyRate)}/h\n`;
    }
    if (project.cost) {
      md += `- **Total Cost:** ${currencySymbol}${Math.round(project.cost)}\n`;
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

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
    const filename = `${project.name}_report_${dateStr}.md`;
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

      [filename] = await Promise.all([exportPromise, minDelay]);

      console.log(`Report exported successfully: ${filename}`);

      setExportedFilename(filename);
      setExportSuccess(true);

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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div className="bg-card-bg rounded-card border border-border-secondary w-full max-w-2xl shadow-2xl animate-modal" data-modal-window>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-secondary">
          <div>
            <h2 className="text-xl font-semibold text-white">Export Time Report</h2>
            <p className="text-sm text-text-muted mt-1">{project.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center hover:bg-hover-bg rounded-badge transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-text-muted mb-4">Select export format:</p>

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
                      ? 'border-accent shadow-lg shadow-accent/20'
                      : 'border-border-secondary bg-card-bg hover:border-border-hover hover:bg-hover-bg'
                    }
                  `}
                  style={isSelected ? {
                    backgroundColor: 'rgba(139, 92, 246, 0.08)'
                  } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-6 h-6 ${format.color} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm mb-1">
                        {format.title}
                      </div>
                      <div className="text-xs text-text-muted">
                        {format.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* PDF theme toggle */}
          {selectedFormat === 'pdf' && (
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs text-text-muted">PDF theme:</span>
              {(['dark', 'light'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setPdfTheme(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    pdfTheme === t
                      ? 'bg-accent text-white'
                      : 'bg-hover-bg text-text-muted hover:text-white'
                  }`}
                >
                  {t === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-border-secondary">
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
              className="px-4 py-2 rounded-button bg-sidebar-bg hover:bg-hover-bg border border-border-primary text-white transition-colors"
              disabled={isExporting}
            >
              {exportSuccess ? 'Close' : 'Cancel'}
            </button>
            {!exportSuccess ? (
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-6 py-2 rounded-button bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-medium transition-colors flex items-center gap-2"
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
                className="px-6 py-2 rounded-button bg-accent hover:bg-accent-hover text-white font-medium transition-colors flex items-center gap-2"
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
