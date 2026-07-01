import { memo, useState, useEffect } from 'react';
import { Settings, Plus } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { getSoftwareMeta } from '../../utils/softwareMeta';
import { getCustomItems, getSoftwareEnabled } from '../../utils/launcherUtils';
import type { CustomLauncherItem } from '../../types/launcher';
import type { SettingsTab } from '../modals/SettingsPanel';

// ---- Unified tile data ----

interface TileData {
  id: string;
  name: string;
  path: string;
  abbr: string;
  gradient: string;
  shadow: string;
  brandColor: string;
  textColor?: string;
  logoPath?: string;
  iconBase64?: string;
}

function buildTiles(): TileData[] {
  let rawPaths: Record<string, string> = {};
  let enabled: Record<string, boolean> = {};
  let custom: CustomLauncherItem[] = [];

  try { rawPaths = JSON.parse(localStorage.getItem('softwarePaths') ?? '{}'); } catch { /* */ }
  enabled = getSoftwareEnabled();
  custom = getCustomItems();

  const swTiles: TileData[] = Object.entries(rawPaths)
    .filter(([key, p]) => p && p.trim() && p !== 'undefined' && p !== 'null' && enabled[key] !== false)
    .map(([key, path]) => {
      const m = getSoftwareMeta(key);
      return {
        id: key,
        name: m.display,
        path,
        abbr: m.abbr,
        gradient: m.gradient,
        shadow: m.shadow,
        brandColor: m.brandColor,
        textColor: m.textColor,
        logoPath: m.logoPath,
      };
    });

  const cusTiles: TileData[] = custom
    .filter(i => i.enabled !== false && i.path)
    .map(i => ({
      id: i.id,
      name: i.name ?? 'App',
      path: i.path,
      abbr: (i.name ?? 'App').slice(0, 2).toUpperCase(),
      gradient: 'linear-gradient(160deg,#1e1e26,#13131a)',
      shadow: 'rgba(0,0,0,.30)',
      brandColor: i.brandColor ?? '#6366f1',
      iconBase64: i.iconBase64,
    }));

  return [...swTiles, ...cusTiles];
}

// ---- SoftwareTile ----

function SoftwareTile({ tile, onLaunch }: {
  tile: TileData;
  onLaunch: (path: string, id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const bgDefault = `radial-gradient(circle at 0% 120%, ${tile.brandColor}15 0%, transparent 80%), rgb(20,20,20)`;
  const bgHover   = `radial-gradient(circle at 0% 120%, ${tile.brandColor}40 0%, transparent 100%), rgb(24,24,27)`;

  return (
    <div
      className="flex flex-col items-center gap-[13px] px-3 py-[22px] rounded-modal cursor-pointer
                 border border-border-primary
                 hover:border-border-secondary hover:scale-[1.04]
                 transition-all duration-150"
      style={{ background: bgDefault }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = bgHover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = bgDefault; }}
      onClick={() => onLaunch(tile.path, tile.id)}
    >
      {/* Icon: custom base64 > known logoPath > gradient+abbr fallback */}
      {tile.iconBase64 && !imgError ? (
        <div className="flex items-center justify-center" style={{ width: 44, height: 44 }}>
          <img
            src={tile.iconBase64}
            alt={tile.name}
            style={{ width: 36, height: 36, objectFit: 'contain' }}
            onError={() => setImgError(true)}
          />
        </div>
      ) : tile.logoPath && !imgError ? (
        <div className="flex items-center justify-center" style={{ width: 44, height: 44 }}>
          <img
            src={tile.logoPath}
            alt={tile.name}
            style={{ width: 36, height: 36, objectFit: 'contain' }}
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div
          className="flex items-center justify-center select-none font-bold"
          style={{
            width: 44, height: 44, borderRadius: 13,
            background: tile.gradient,
            boxShadow: `0 6px 14px ${tile.shadow}`,
            color: tile.textColor ?? '#fff',
            fontSize: tile.abbr.length === 1 ? 20 : 16,
          }}
        >
          {tile.abbr}
        </div>
      )}
      <span className="text-[13px] font-semibold text-text-primary">{tile.name}</span>
    </div>
  );
}

// ---- LauncherEmptyState ----

function LauncherEmptyState({ onOpenSettings }: { onOpenSettings: (tab: SettingsTab) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-app-bg">
      <div style={{ width: 520 }}>
        <div className="mb-[22px]">
          <h2 className="text-[23px] font-bold text-text-primary mb-[5px]">Tool Launcher</h2>
          <p className="text-[13px] text-text-muted">Select an app to launch</p>
        </div>
        <div
          className="border-[1.5px] border-dashed border-border-secondary rounded-[18px] px-8 py-10 flex flex-col items-center text-center"
          style={{ background: 'radial-gradient(125% 100% at 50% 0%,#131319 0%,#0c0c10 70%)' }}
        >
          <div className="flex gap-4 mb-7 opacity-55">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex flex-col items-center gap-[13px]">
                <div className="w-[54px] h-[54px] rounded-[15px] bg-card-bg border-[1.5px] border-dashed border-border-secondary" />
                <div className="w-12 h-2 rounded-full bg-hover-bg" />
              </div>
            ))}
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">No software added yet</h3>
          <p className="text-[13px] text-text-muted leading-relaxed mb-[26px] max-w-[330px]">
            Add apps — Blender, Houdini, DaVinci and others — and they will appear here as tiles for quick launch.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenSettings('launcher')}
              className="flex items-center gap-2 h-11 px-5 rounded-[12px] text-white font-bold text-[13.5px] border-0 cursor-pointer"
              style={{ background: 'linear-gradient(180deg,#7c3aed,#6d28d9)', boxShadow: '0 6px 18px rgba(124,58,237,.35)' }}
            >
              <Plus className="w-4 h-4" />
              Add software
            </button>
            <button
              onClick={() => onOpenSettings('launcher')}
              className="h-11 px-[17px] bg-transparent border border-border-secondary rounded-[12px]
                         text-text-secondary text-[13px] font-semibold cursor-pointer
                         hover:border-border-hover hover:text-text-primary transition-colors"
            >
              Open Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- SoftwareLauncher (export) ----

export const SoftwareLauncher = memo(function SoftwareLauncher({
  onOpenSettings,
}: {
  onOpenSettings: (tab: SettingsTab) => void;
}) {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const launchSoftwareWithoutProject = useProjectStore(s => s.launchSoftwareWithoutProject);

  useEffect(() => {
    const load = () => setTiles(buildTiles());
    load();
    window.addEventListener('storage', load);
    window.addEventListener('softwarePaths:updated', load as EventListener);
    window.addEventListener('launcherItems:updated', load as EventListener);
    return () => {
      window.removeEventListener('storage', load);
      window.removeEventListener('softwarePaths:updated', load as EventListener);
      window.removeEventListener('launcherItems:updated', load as EventListener);
    };
  }, []);

  if (tiles.length === 0) return <LauncherEmptyState onOpenSettings={onOpenSettings} />;

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-app-bg p-6">
      <div className="bg-sidebar-bg border border-border-secondary/50 rounded-modal p-8">
        <div style={{ width: 520 }}>
          <div className="flex items-end justify-between mb-[22px]">
            <div>
              <h2 className="text-[23px] font-bold text-text-primary mb-[5px]">Tool Launcher</h2>
              <p className="text-[13px] text-text-muted">Select an app to launch</p>
            </div>
            <button
              onClick={() => onOpenSettings('launcher')}
              className="flex items-center gap-[7px] h-[34px] px-[13px] bg-card-bg border border-border-secondary
                         rounded-[9px] text-text-secondary text-[12px] font-semibold cursor-pointer
                         hover:border-border-hover hover:text-text-primary transition-colors"
            >
              <Settings className="w-[14px] h-[14px]" />
              Manage
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {tiles.map(tile => (
              <SoftwareTile key={tile.id} tile={tile} onLaunch={launchSoftwareWithoutProject} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
