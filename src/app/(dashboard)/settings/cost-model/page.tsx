'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinancialAccessGate } from '@/components/shared/FinancialAccessGate';
import { DeliveryRolesTab } from '@/components/cost-model/DeliveryRolesTab';
import { CostRatesTab } from '@/components/cost-model/CostRatesTab';
import { GnrPolicyTab } from '@/components/cost-model/GnrPolicyTab';
import { MarginTargetsTab } from '@/components/cost-model/MarginTargetsTab';

export default function CostModelSettingsPage() {
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
        <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">
          Cost &amp; pricing model
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          What an engagement costs to deliver, and what you aim to charge for it.
        </p>
      </div>

      <FinancialAccessGate what="the cost model">
        <Tabs defaultValue="rates">
          <TabsList>
            <TabsTrigger value="rates">Cost Rates</TabsTrigger>
            <TabsTrigger value="roles">Delivery Roles</TabsTrigger>
            <TabsTrigger value="gnr">Overheads</TabsTrigger>
            <TabsTrigger value="margin">Margin Targets</TabsTrigger>
          </TabsList>

          <TabsContent value="rates" className="mt-5">
            <CostRatesTab />
          </TabsContent>
          <TabsContent value="roles" className="mt-5">
            <DeliveryRolesTab />
          </TabsContent>
          <TabsContent value="gnr" className="mt-5">
            <GnrPolicyTab />
          </TabsContent>
          <TabsContent value="margin" className="mt-5">
            <MarginTargetsTab />
          </TabsContent>
        </Tabs>
      </FinancialAccessGate>
    </div>
  );
}
