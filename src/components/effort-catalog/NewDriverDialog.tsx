'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export function NewDriverDialog({
  open,
  onOpenChange,
  nextPosition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextPosition: number;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState('');
  const [valueType, setValueType] = useState<'select' | 'number'>('select');
  const [appliesTo, setAppliesTo] = useState<'weeks' | 'team' | 'both'>('weeks');
  const [perUnit, setPerUnit] = useState('');
  const [baseline, setBaseline] = useState('0');

  const create = trpc.sizing.createDriver.useMutation({
    onSuccess: () => {
      toast.success('Driver created', {
        description: valueType === 'select' ? 'Add its answers next.' : undefined,
      });
      setName('');
      setPerUnit('');
      setBaseline('0');
      onOpenChange(false);
      void utils.sizing.listDrivers.invalidate();
    },
    onError: (err) => toast.error('Could not create the driver', { description: err.message }),
  });

  const slug = slugify(name);
  // Mirrors the server's refine: a numeric driver without a per-unit rate is
  // meaningless, and createDriver rejects it.
  const numericOk = valueType !== 'number' || (perUnit.trim() !== '' && Number(perUnit) >= 0);
  const valid = name.trim().length > 1 && slug.length > 1 && numericOk;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">New sizing driver</DialogTitle>
          <DialogDescription className="text-[11px]">
            A question that changes how much work an engagement is. It applies to estimates scoped
            from now on — existing estimates keep the answers they were built with.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <Label htmlFor="nd-name" className="text-[11px]">
              Question
            </Label>
            <Input
              id="nd-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Number of subsidiaries in scope"
              className="mt-1"
            />
            {slug && (
              <p className="mt-1 text-[11px] text-slate-400">
                Identifier: <code className="text-slate-500">{slug}</code>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="nd-type" className="text-[11px]">
                Answer type
              </Label>
              <select
                id="nd-type"
                value={valueType}
                onChange={(e) => setValueType(e.target.value as 'select' | 'number')}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value="select">Choose one</option>
                <option value="number">A number</option>
              </select>
            </div>
            <div>
              <Label htmlFor="nd-applies" className="text-[11px]">
                What it changes
              </Label>
              <select
                id="nd-applies"
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value as 'weeks' | 'team' | 'both')}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700"
              >
                <option value="weeks">Adds weeks</option>
                <option value="team">Adds people</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>

          {valueType === 'number' && (
            <div>
              <Label className="text-[11px]">Rate per unit</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={perUnit}
                  onChange={(e) => setPerUnit(e.target.value)}
                  className="w-24"
                  placeholder="0.05"
                />
                <span className="text-[11px] text-slate-400">beyond</span>
                <Input
                  type="number"
                  min={0}
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value)}
                  className="w-20"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                0.05 means +5% of effort for each one beyond the number on the right.
              </p>
            </div>
          )}

          {valueType === 'select' && (
            <p className="text-[11px] leading-relaxed text-slate-400">
              You&apos;ll add the possible answers and their weights once it exists.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate({
                slug,
                name: name.trim(),
                valueType,
                appliesTo,
                position: nextPosition,
                ...(valueType === 'number'
                  ? { multiplierPerUnit: Number(perUnit), unitBaseline: Number(baseline) || 0 }
                  : {}),
              })
            }
          >
            {create.isPending ? 'Creating…' : 'Create driver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
