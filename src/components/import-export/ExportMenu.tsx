'use client';

import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExportFormat } from '@/lib/record-exports';

interface ExportMenuProps {
  onExport: (format: ExportFormat) => void;
  busy?: boolean;
  label?: string;
  title?: string;
}

export function ExportMenu({ onExport, busy = false, label = 'Export', title }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy} title={title}>
          <Download className="h-3.5 w-3.5" />
          {busy ? 'Exporting...' : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onExport('xlsx')}>
          <FileSpreadsheet className="h-4 w-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('csv')}>
          <FileText className="h-4 w-4" />
          CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
