'use client';

import React, { useState } from 'react';
import { Tag, Users, LayoutGrid, FileText, Shield, ChevronRight, Bot, CalendarClock, BellRing } from 'lucide-react';
import Link from 'next/link';

const settingsSections = [
  {
    title: 'CRM',
    items: [
      { label: 'Tags', description: 'Manage tags and categories', href: '/settings/tags', icon: Tag },
      { label: 'Pipelines', description: 'Configure sales pipelines and stages', href: '/settings/pipelines', icon: LayoutGrid },
      { label: 'Custom Fields', description: 'Add custom fields to contacts, companies, and prospects', href: '/settings/custom-fields', icon: FileText },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users & Roles', description: 'Manage team members and permissions', href: '/settings/users', icon: Users },
      { label: 'Audit Log', description: 'View all system activity and changes', href: '/settings/audit-log', icon: Shield },
    ],
  },
  {
    title: 'Integrations',
    items: [
      { label: 'Telegram Bot', description: 'Add contacts and log activities from Telegram', href: '/settings/telegram', icon: Bot },
      { label: 'Digest Schedules', description: 'Send scheduled dashboard reports via email & Telegram', href: '/settings/digests', icon: CalendarClock },
      { label: 'Automations', description: 'Configure stale-lead reminder emails and future workflow automations', href: '/settings/automations', icon: BellRing },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-7">
        <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-xs text-slate-400 mt-0.5">Manage your CRM configuration and preferences.</p>
      </div>

      <div className="space-y-6">
        {settingsSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em] mb-2 px-1">{section.title}</h2>
            <div className="bg-white border border-slate-200/80 rounded-xl divide-y divide-slate-100 shadow-[0_1px_4px_rgba(16,24,40,0.04)]">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50/80 transition-colors duration-100 group first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors duration-100">
                      <Icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600 transition-colors duration-100" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-800">{item.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{item.description}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 group-hover:text-slate-500 transition-colors duration-100" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
