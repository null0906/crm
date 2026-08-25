'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BaselinesTab } from '@/components/effort-catalog/BaselinesTab';
import { SizingDriversTab } from '@/components/effort-catalog/SizingDriversTab';

/**
 * Kept separate from the cost model on purpose: effort is not money. Reads here
 * are open to anyone — the estimate builder needs them — while every screen
 * under /settings/cost-model is gated.
 */
export default function EffortCatalogSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
      >
        <ChevronLeft className="h-3 w-3" />
        Settings
      </Link>

      <div className="mb-6">
        <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">Effort catalog</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          How much work an engagement normally is, and what makes a particular one bigger.
        </p>
      </div>

      <Tabs defaultValue="baselines">
        <TabsList>
          <TabsTrigger value="baselines">Effort Baselines</TabsTrigger>
          <TabsTrigger value="drivers">Sizing Drivers</TabsTrigger>
        </TabsList>

        <TabsContent value="baselines" className="mt-5">
          <BaselinesTab />
        </TabsContent>
        <TabsContent value="drivers" className="mt-5">
          <SizingDriversTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
