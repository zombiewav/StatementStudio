import React, { useMemo } from 'react';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  BookOpen, 
  Layers, 
  Scale, 
  FileSpreadsheet, 
  LineChart, 
  FolderKanban,
  Settings,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  SlidersHorizontal
} from "lucide-react";
import { useFinance } from '../context/FinanceContext';
import { computeTransactionReviewStates } from '../lib/reviewEngine';
import { useOtherAdjustments } from '../hooks/useOtherAdjustments';
import { LogoMark } from './LogoMark';
import { CLOSING_PAGES_ENABLED } from '../lib/featureFlags';

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

interface MenuItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

export function Sidebar({
  activePage,
  setActivePage,
  isOpen,
  setIsOpen,
  isCollapsed,
  setIsCollapsed,
}: SidebarProps): React.ReactElement {
  const { journalEntries, accounts, settings } = useFinance();
  const semesterKey = `${settings.reportingYear}::${settings.semester}`;
  const pendingReviewCount = useMemo(
    () => computeTransactionReviewStates(journalEntries.filter(entry => !entry.isDraft), accounts, semesterKey).filter(state => state.status === 'incomplete').length,
    [journalEntries, accounts, semesterKey]
  );
  // Client (Oct 21 2026): the Other Adjustments tab is red while end-of-semester adjustments are outstanding.
  const { status: adjustmentStatus } = useOtherAdjustments();

  const menuItems: MenuItem[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: "Dashboard" },
    { id: 'transactions', icon: ArrowRightLeft, label: "Transactions" },
    { id: 'transaction-history', icon: History, label: "FS History" },
    { id: 'review', icon: ClipboardCheck, label: "Review" },
    { id: 'other-adjustments', icon: SlidersHorizontal, label: "Other Adjustments" },
    { id: 'journals', icon: BookOpen, label: "Journal Entries" },
    { id: 'ledger', icon: Layers, label: "General Ledger" },
    { id: 'trial-balance', icon: Scale, label: "Trial Balance" },
    ...(CLOSING_PAGES_ENABLED ? [
      { id: 'closing-entries', icon: ClipboardCheck, label: "Closing Entries" },
      { id: 'post-closing-ledger', icon: Layers, label: "Post-Closing General Ledger" },
      { id: 'post-closing-trial-balance', icon: Scale, label: "Post-Closing Trial Balance" },
    ] : []),
    { id: 'statements', icon: FileSpreadsheet, label: "Financial Statements" },
    { id: 'analytics', icon: LineChart, label: "Analytics" },
    { id: 'projects', icon: FolderKanban, label: "Activities & Programs" },
    { id: 'settings', icon: Settings, label: "Settings" },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 bg-[#faf8f3] border-r border-slate-200 dark:bg-[#0d1015] dark:border-slate-800 flex flex-col h-full z-50 transition-all duration-300 select-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Header Title */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
          {!isCollapsed ? (
            <div className="flex items-center gap-2">
              <LogoMark className="h-8 w-8 text-blue-900 dark:text-blue-400" />
              <h1 className="text-[17px] font-medium text-slate-950 dark:text-slate-100 tracking-tight flex items-center">
                StatementStudio
              </h1>
            </div>
          ) : (
            <LogoMark className="mx-auto h-8 w-8 text-blue-900 dark:text-blue-400" />
          )}

          {/* Collapse Button - Desktop Only */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-6 h-6 rounded-full border border-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-blue-900 dark:hover:text-blue-200 transition-colors absolute -right-3 top-5 shadow-sm hidden md:flex"
            type="button"
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = activePage === item.id;
            const needsAttention = item.id === 'other-adjustments' && adjustmentStatus.hasOutstanding;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl transition-all relative group font-semibold text-xs
                  ${needsAttention
                    ? `bg-rose-50 text-rose-700 ring-1 ${isActive ? 'ring-rose-400 shadow-sm' : 'ring-rose-200'} dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/40`
                    : isActive
                    ? "bg-[#f3e9d1] text-slate-950 shadow-sm ring-1 ring-[#d9c58f] dark:bg-slate-800/70 dark:text-slate-100 dark:ring-slate-700/60"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                  }
                `}
                type="button"
                data-nav
                data-attention={needsAttention ? 'true' : undefined}
              >
                <item.icon className={`w-4.5 h-4.5 shrink-0 ${needsAttention ? 'text-rose-600 dark:text-rose-400' : isActive ? 'text-blue-900 dark:text-blue-400' : 'text-slate-400 group-hover:text-blue-900 dark:group-hover:text-blue-400 transition-colors'}`} />
                {!isCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                {needsAttention && !isCollapsed && (
                  <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white">{adjustmentStatus.outstanding}</span>
                )}
                {item.id === 'review' && pendingReviewCount > 0 && !isCollapsed && (
                  <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-900 text-white' : 'bg-amber-500 text-white'}`}>
                    {pendingReviewCount}
                  </span>
                )}

                {/* Tooltip on Collapsed */}
                {isCollapsed && (
                  <div className="absolute left-16 bg-slate-900 text-white text-[12px] font-bold px-2 py-1 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity ml-4 z-50 white-space-nowrap shadow-md">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
