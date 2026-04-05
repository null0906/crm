'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Tag } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4',
  '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280', '#0F172A',
];

export default function TagsSettingsPage() {
  const utils = trpc.useUtils();
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('#3B82F6');
  const [deleteId, setDeleteId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: tags = [], isLoading } = trpc.tags.list.useQuery({});

  const createTag = trpc.tags.create.useMutation({
    onSuccess: () => {
      toast.success('Tag created');
      setCreateName('');
      void utils.tags.list.invalidate();
    },
    onError: (err) => toast.error('Failed to create tag', { description: err.message }),
  });

  const deleteTag = trpc.tags.delete.useMutation({
    onSuccess: () => {
      toast.success('Tag deleted');
      setDeleteOpen(false);
      void utils.tags.list.invalidate();
    },
    onError: (err) => toast.error('Failed to delete tag', { description: err.message }),
  });

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="text-slate-400 hover:text-slate-600">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Tags</h1>
          <p className="text-xs text-slate-400 mt-0.5">Organize contacts, companies, and deals with tags.</p>
        </div>
      </div>

      {/* Create tag */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Create Tag</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tagName" className="text-xs">Name</Label>
            <Input
              id="tagName"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Hot Lead"
              className="h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && createName.trim()) {
                  createTag.mutate({ name: createName.trim(), color: createColor });
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${createColor === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setCreateColor(c)}
                />
              ))}
            </div>
          </div>
          <Button
            size="sm"
            disabled={!createName.trim() || createTag.isPending}
            onClick={() => createTag.mutate({ name: createName.trim(), color: createColor })}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Tag list */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-5 text-sm text-slate-400">Loading...</div>
        ) : tags.length === 0 ? (
          <div className="p-8 text-center">
            <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No tags yet. Create your first tag above.</p>
          </div>
        ) : (
          tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color ?? '#6B7280' }} />
              <span className="text-sm text-slate-800 flex-1">{tag.name}</span>
              <span className="text-xs text-slate-400 font-mono">{tag.color}</span>
              <button
                onClick={() => { setDeleteId(tag.id); setDeleteOpen(true); }}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete tag?"
        description="This will remove the tag from all contacts, companies, and deals."
        confirmLabel="Delete"
        destructive
        loading={deleteTag.isPending}
        onConfirm={() => deleteTag.mutate({ id: deleteId })}
      />
    </div>
  );
}
