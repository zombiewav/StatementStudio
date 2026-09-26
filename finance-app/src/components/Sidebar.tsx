import React from 'react';
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
  LogOut,
  Sparkles,
  ClipboardCheck,
  History
} from "lucide-react";
import { useFinance } from '../context/FinanceContext';
import { computePendingObligations } from '../lib/reviewEngine';

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
  const { loadSampleData, clearAllData, journalEntries, accounts } = useFinance();
  const pendingReviewCount = computePendingObligations(journalEntries, accounts).length;

  const menuItems: MenuItem[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: "Dashboard" },
    { id: 'transactions', icon: ArrowRightLeft, label: "Transactions" },
    { id: 'transaction-history', icon: History, label: "Transaction History" },
    { id: 'review', icon: ClipboardCheck, label: "Review" },
    { id: 'journals', icon: BookOpen, label: "Journal Entries" },
    { id: 'ledger', icon: Layers, label: "General Ledger" },
    { id: 'trial-balance', icon: Scale, label: "Trial Balance" },
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
        className={`fixed top-0 bottom-0 left-0 bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800 flex flex-col h-full z-50 transition-all duration-300 select-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Header Title */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
          {!isCollapsed ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-900 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-blue-900/10">
                S
              </div>
              <h1 className="text-lg font-black text-blue-950 dark:text-blue-100 tracking-tight flex items-center">
                Statement<span className="text-blue-600">Studio</span>
              </h1>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-blue-900 flex items-center justify-center mx-auto text-white font-extrabold text-lg shadow-md shadow-blue-900/10">
              S
            </div>
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
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl transition-all relative group font-semibold text-xs
                  ${isActive
                    ? "bg-blue-900 text-white shadow-lg shadow-blue-900/15"
                    : "text-slate-500 dark:text-slate-300 hover:text-blue-950 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                  }
                `}
                type="button"
              >
                <item.icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-900 dark:group-hover:text-blue-200 transition-colors'}`} />
                {!isCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                {item.id === 'review' && pendingReviewCount > 0 && !isCollapsed && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white text-blue-900' : 'bg-amber-500 text-white'}`}>
                    {pendingReviewCount}
                  </span>
                )}

                {/* Tooltip on Collapsed */}
                {isCollapsed && (
                  <div className="absolute left-16 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity ml-4 z-50 white-space-nowrap shadow-md">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
          <button
            onClick={loadSampleData}
            className="w-full flex items-center gap-3.5 px-3.5 py-2 hover:bg-emerald-50/50 rounded-xl text-emerald-600 hover:text-emerald-700 font-bold text-xs transition-colors group"
            type="button"
          >
            <Sparkles className="w-4.5 h-4.5 shrink-0 text-emerald-500" />
            {!isCollapsed && <span className="truncate">Load Sample Data</span>}
            {isCollapsed && (
              <div className="absolute left-16 bg-emerald-800 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity ml-4 z-50 shadow-md">
                Load Sample Data
              </div>
            )}
          </button>

          <button
            onClick={clearAllData}
            className="w-full flex items-center gap-3.5 px-3.5 py-2 hover:bg-rose-50/50 rounded-xl text-rose-500 hover:text-rose-600 font-bold text-xs transition-colors group"
            type="button"
          >
            <LogOut className="w-4.5 h-4.5 shrink-0 text-rose-400" />
            {!isCollapsed && <span className="truncate">Clear Ledger</span>}
            {isCollapsed && (
              <div className="absolute left-16 bg-rose-800 text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity ml-4 z-50 shadow-md">
                Clear Ledger
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
