import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';

export function DevPerfPanel() {
  const projects = useProjectStore(s => s.projects);
  const selectProject = useProjectStore(s => s.selectProject);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const runStressTest = () => {
    if (projects.length < 2 || running) return;
    setRunning(true);
    setLog([]);
    const subset = projects.slice(0, Math.min(5, projects.length));
    let i = 0;
    intervalRef.current = setInterval(() => {
      const p = subset[i % subset.length];
      selectProject(p);
      setLog(prev => [...prev.slice(-19), `${Math.round(performance.now() % 100000)}ms → ${p.name}`]);
      i++;
      if (i >= 20) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setRunning(false);
      }
    }, 100);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
      background: '#111', border: '1px solid #333', borderRadius: 8,
      padding: '8px 12px', fontSize: 11, color: '#aaa', maxWidth: 260,
      fontFamily: 'monospace', userSelect: 'none',
    }}>
      <div style={{ marginBottom: 6, color: '#fff', fontWeight: 600 }}>
        DEV PERF — {projects.length} projects
      </div>
      <button
        onClick={runStressTest}
        disabled={running || projects.length < 2}
        style={{ padding: '3px 8px', marginBottom: 6, cursor: 'pointer', width: '100%' }}
      >
        {running ? 'Running...' : '▶ Stress (20× switch, 100ms)'}
      </button>
      <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 10, lineHeight: '1.4' }}>
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
