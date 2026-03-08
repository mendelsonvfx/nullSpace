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
      'RUB': 'RUB ',
      'EUR': 'EUR '
    };
    return symbols[currency || 'USD'] || currency || '$';
  };

  const exportPDF = async () => {
    const entries = project.timeEntries?.filter(e => !e.isActive && e.durationMinutes > 0) || [];
    const currencySymbol = getCurrencySymbol(project.currency);

    // Load logo image
    const logoImg = new Image();
    logoImg.src = appIcon;
    await new Promise((resolve) => {
      logoImg.onload = resolve;
    });

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const primaryColor = [139, 92, 246]; // Purple accent
    const darkBg = [24, 24, 27]; // zinc-900
    const cardBg = [39, 39, 42]; // zinc-800
    const lightText = [161, 161, 170]; // zinc-400
    const whiteText = [255, 255, 255]; // white

    // Dark background for entire page
    doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Header with accent bar
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, pageWidth, 8, 'F');

    // Project name (main title)
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
    doc.text(project.name, 14, 22);

    // Subtitle
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    doc.text('Project Report', 14, 30);

    // nullSpace branding in top right with "Generated in:" prefix
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    const generatedInText = 'Generated in: ';
    const generatedInWidth = doc.getTextWidth(generatedInText);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
    const brandText = 'nullSpace';
    const brandTextWidth = doc.getTextWidth(brandText);

    const totalWidth = generatedInWidth + brandTextWidth;
    const startX = pageWidth - totalWidth - 14;

    // Draw "Generated in: " text
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    doc.text(generatedInText, startX, 22);

    // Draw nullSpace text
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
    const brandTextX = startX + generatedInWidth;
    doc.text(brandText, brandTextX, 22);

    // Add logo after nullSpace text (slightly bigger than text height)
    const textHeight = 10; // Font size 10
    const logoSize = 4; 
    const logoX = brandTextX + brandTextWidth + 1; // 1mm gap after text
    const logoY = 24.3 - (logoSize / 2) - (textHeight * 0.35); // Vertically centered with text
    doc.addImage(logoImg, 'PNG', logoX, logoY, logoSize, logoSize);

    // Summary Cards
    let yPos = 40;
    doc.setFontSize(14);
    doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
    doc.text('Summary', 14, yPos);

    yPos += 8;
    const cardWidth = (pageWidth - 28 - 8) / 3;
    const cardHeight = 24;

    // Time Card
    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(14, yPos, cardWidth, cardHeight, 2, 2, 'F');
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(14, yPos, cardWidth, 3, 'F');

    doc.setFontSize(9);
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    doc.text('Total Time', 18, yPos + 10);
    doc.setFontSize(14);
    doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
    doc.text(formatTime(project.totalMinutesSpent || 0), 18, yPos + 18);

    // Cost Card
    if (project.cost) {
      doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
      doc.roundedRect(14 + cardWidth + 4, yPos, cardWidth, cardHeight, 2, 2, 'F');
      doc.setFillColor(34, 197, 94);
      doc.rect(14 + cardWidth + 4, yPos, cardWidth, 3, 'F');

      doc.setFontSize(9);
      doc.setTextColor(lightText[0], lightText[1], lightText[2]);
      doc.text('Total Cost', 18 + cardWidth + 4, yPos + 10);
      doc.setFontSize(14);
      doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
      doc.text(`${currencySymbol}${Math.round(project.cost)}`, 18 + cardWidth + 4, yPos + 18);
    }

    // Rate Card
    if (project.hourlyRate) {
      doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
      doc.roundedRect(14 + (cardWidth + 4) * 2, yPos, cardWidth, cardHeight, 2, 2, 'F');
      doc.setFillColor(251, 191, 36);
      doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth, 3, 'F');

      doc.setFontSize(9);
      doc.setTextColor(lightText[0], lightText[1], lightText[2]);
      doc.text('Hourly Rate', 18 + (cardWidth + 4) * 2, yPos + 10);
      doc.setFontSize(14);
      doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
      doc.text(`${currencySymbol}${Math.round(project.hourlyRate)}/h`, 18 + (cardWidth + 4) * 2, yPos + 18);
    }

    // Software Breakdown
    const bySoftware = new Map<string, number>();
    entries.forEach(e => {
      const name = formatSoftwareName(e.software);
      bySoftware.set(name, (bySoftware.get(name) || 0) + e.durationMinutes);
    });

    if (bySoftware.size > 0) {
      yPos += 36;
      doc.setFontSize(14);
      doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
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
          fillColor: [primaryColor[0], primaryColor[1], primaryColor[2]],
          textColor: 255,
          fontSize: 10,
          fontStyle: 'bold',
          cellPadding: 4
        },
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: [63, 63, 70],
          lineWidth: 0.5,
          textColor: [212, 212, 216],
          fillColor: [cardBg[0], cardBg[1], cardBg[2]]
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

    // Time Entries Table
    doc.setFontSize(14);
    doc.setTextColor(whiteText[0], whiteText[1], whiteText[2]);
    doc.text('Detailed Time Entries', 14, yPos);

    yPos += 4;
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
      theme: 'striped',
      headStyles: {
        fillColor: [primaryColor[0], primaryColor[1], primaryColor[2]],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
        cellPadding: 3
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: [212, 212, 216],
        fillColor: [cardBg[0], cardBg[1], cardBg[2]],
        lineColor: [63, 63, 70],
        lineWidth: 0.5
      },
      alternateRowStyles: {
        fillColor: [32, 32, 35]
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 28 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 22 },
        4: { cellWidth: 18 },
        5: { cellWidth: 'auto' }
      },
      margin: { left: 14, right: 14 }
    });

    // Footer with metadata
    yPos = (doc as any).lastAutoTable.finalY + 16;
    doc.setFillColor(cardBg[0], cardBg[1], cardBg[2]);
    doc.roundedRect(14, yPos, pageWidth - 28, client ? 18 : 12, 2, 2, 'F');

    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
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

    // Format date as DDMMYY
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

    // Format date as DDMMYY
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

    // Format date as DDMMYY
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

    // Format date as DDMMYY
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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-2xl shadow-2xl animate-modal" data-modal-window>
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
                      ? 'border-accent shadow-lg shadow-accent/20'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800'
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
