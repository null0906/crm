'use client';

import React, { useState } from 'react';
import { Tag, Users, LayoutGrid, FileText, Shield, ChevronRight, Bot, CalendarClock } from 'lucide-react';
import Link from 'next/link';

const settingsSections = [
  {
    title: 'CRM',
    items: [
      { label: 'Tags', description: 'Manage tags and categories', href: '/settings/tags', icon: Tag },
      { label: 'Pipelines', description: 'Configure sales pipelines and stages', href: '/settings/pipelines', icon: LayoutGrid },
      { label: 'Custom Fields', description: 'Add custom fields to contacts, companies, and deals', href: '/settings/custom-fields', icon: FileText },
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
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your CRM configuration and preferences.</p>
      </div>

      <div className="space-y-8">
        {settingsSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{section.title}</h2>
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                      <Icon className="w-4 h-4 text-slate-600 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
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
