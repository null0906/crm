'use client';

import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, Plus, Trash2, Globe, Lock, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import type { EntityType } from '@/lib/types';

interface SavedView {
  id: string;
  name: string;
  entityType: string;
  filters: unknown;
  columns: unknown;
  sortConfig: unknown;
  visibility: string;
  isPinned: boolean | null;
  createdBy: string;
}

interface ActiveFilters {
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
  logic?: string;
}

interface SavedViewsBarProps {
  entityType: EntityType;
  activeFilters?: ActiveFilters;
  onLoadView: (view: SavedView) => void;
  activeViewId?: string;
}

const VISIBILITY_ICONS: Record<string, React.ReactNode> = {
  private: <Lock className="w-3 h-3" />,
  team: <Users className="w-3 h-3" />,
  everyone: <Globe className="w-3 h-3" />,
};

export function SavedViewsBar({ entityType, activeFilters, onLoadView, activeViewId }: SavedViewsBarProps) {
  const utils = trpc.useUtils();
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'team' | 'everyone'>('private');
  const [isPinned, setIsPinned] = useState(false);

  const { data: views = [] } = trpc.savedViews.list.useQuery({ entityType });

  const createView = trpc.savedViews.create.useMutation({
    onSuccess: () => {
      toast.success('View saved');
      void utils.savedViews.list.invalidate();
      setSaveOpen(false);
      setViewName('');
    },
    onError: (err) => toast.error('Failed to save view', { description: err.message }),
  });

  const deleteView = trpc.savedViews.delete.useMutation({
    onSuccess: () => {
      toast.success('View deleted');
      void utils.savedViews.list.invalidate();
    },
    onError: (err) => toast.error('Failed to delete view', { description: err.message }),
  });

  const togglePin = trpc.savedViews.update.useMutation({
    onSuccess: () => void utils.savedViews.list.invalidate(),
  });

  function handleSave() {
    if (!viewName.trim()) return;
    createView.mutate({
      name: viewName.trim(),
      entityType,
      filters: (activeFilters as Record<string, unknown>) ?? {},
      visibility,
      isPinned,
    });
  }

  const pinnedViews = (views as SavedView[]).filter((v) => v.isPinned);
  const unpinnedViews = (views as SavedView[]).filter((v) => !v.isPinned);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Pinned views as tabs */}
      {pinnedViews.map((view) => (
        <ViewChip
          key={view.id}
          view={view}
          isActive={activeViewId === view.id}
          onLoad={onLoadView}
          onDelete={(id) => deleteView.mutate({ id })}
          onTogglePin={(v) => togglePin.mutate({ id: v.id, data: { isPinned: !v.isPinned } })}
        />
      ))}

      {/* Unpinned views in a small dropdown */}
      {unpinnedViews.length > 0 && (
        <UnpinnedDropdown
          views={unpinnedViews}
          activeViewId={activeViewId}
          onLoad={onLoadView}
          onDelete={(id) => deleteView.mutate({ id })}
          onTogglePin={(v) => togglePin.mutate({ id: v.id, data: { isPinned: !v.isPinned } })}
        />
      )}

      {/* Save current view button */}
      {saveOpen ? (
        <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-lg px-2 py-1 shadow-sm">
          <input
            autoFocus
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setSaveOpen(false);
            }}
            placeholder="View name..."
            className="text-xs outline-none w-28"
          />
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'private' | 'team' | 'everyone')}
            className="text-xs border-none outline-none bg-transparent"
          >
            <option value="private">Private</option>
            <option value="team">Team</option>
            <option value="everyone">Everyone</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded"
            />
            Pin
          </label>
          <button
            onClick={handleSave}
            disabled={!viewName.trim() || createView.isPending}
            className="text-xs text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 px-2 py-0.5 rounded"
          >
            Save
          </button>
          <button onClick={() => setSaveOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSaveOpen(true)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors border border-dashed border-slate-300 hover:border-blue-300"
        >
          <Plus className="w-3 h-3" />
          Save view
        </button>
      )}
    </div>
  );
}

function ViewChip({
  view,
  isActive,
  onLoad,
  onDelete,
  onTogglePin,
}: {
  view: SavedView;
  isActive: boolean;
  onLoad: (v: SavedView) => void;
  onDelete: (id: string) => void;
  onTogglePin: (v: SavedView) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
        isActive
          ? 'bg-blue-500 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
      onClick={() => onLoad(view)}
    >
      <span className={isActive ? 'text-blue-100' : 'text-slate-400'}>
        {VISIBILITY_ICONS[view.visibility] ?? null}
      </span>
      {view.name}
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(view); }}
        className={`ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'text-blue-100 hover:text-white' : 'text-slate-400 hover:text-blue-500'}`}
        title="Unpin"
      >
        <BookmarkCheck className="w-3 h-3" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(view.id); }}
        className={`ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'text-blue-100 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}
        title="Delete view"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function UnpinnedDropdown({
  views,
  activeViewId,
  onLoad,
  onDelete,
  onTogglePin,
}: {
  views: SavedView[];
  activeViewId?: string;
  onLoad: (v: SavedView) => void;
  onDelete: (id: string) => void;
  onTogglePin: (v: SavedView) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <Bookmark className="w-3 h-3" />
        {views.length} more
      </button>
      {open && (
        <div className="absolute left-0 top-8 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="py-1">
            {views.map((view) => (
              <div
                key={view.id}
                className={`group flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer ${activeViewId === view.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                onClick={() => { onLoad(view); setOpen(false); }}
              >
                <span className="text-slate-400">{VISIBILITY_ICONS[view.visibility]}</span>
                <span className="flex-1">{view.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onTogglePin(view); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500"
                  title="Pin view"
                >
                  <Bookmark className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(view.id); setOpen(false); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                  title="Delete view"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
