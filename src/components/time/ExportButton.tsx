// src/components/time/ExportButton.tsx
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Project, Client } from '../../types/project';
import { ExportModal } from './ExportModal';

interface ExportButtonProps {
  project: Project;
  client?: Client;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ project, client }) => {
  const [showModal, setShowModal] = useState(false);

  const hasEntries = (project.timeEntries?.filter(e => !e.isActive) || []).length > 0;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={!hasEntries}
        className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed rounded-lg flex items-center gap-2 transition-colors font-medium text-white"
      >
        <Download className="w-4 h-4" />
        Export Time Report
      </button>

      <ExportModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        project={project}
        client={client}
      />
    </>
  );
};
