import React, { useState, useMemo } from 'react';
import { FolderKanban, Plus, Pencil, Check, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';

export function ProjectsPage(): React.ReactElement {
  const { projects, addProject, updateProject, journalEntries, accounts, formatCurrency } = useFinance();
  const [showAddForm, setShowAddForm] = useState(false);

  // Inline Budget Editing State
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetValue, setEditingBudgetValue] = useState('');

  const startEditingBudget = (proj: { id: string; budget: number }) => {
    setEditingBudgetId(proj.id);
    setEditingBudgetValue(String(proj.budget));
  };

  const saveEditingBudget = (id: string) => {
    const value = Number(editingBudgetValue);
    if (!isNaN(value) && value >= 0) {
      updateProject(id, { budget: value });
    }
    setEditingBudgetId(null);
  };
  
  // New Project Form State
  const [projName, setProjName] = useState('');
  const [budget, setBudget] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Compute revenues and expenses per program
  const projectMetrics = useMemo(() => {
    const metrics: Record<string, { revenue: number; expenses: number }> = {};

    projects.forEach(p => {
      metrics[p.name] = { revenue: 0, expenses: 0 };
    });

    journalEntries.forEach(je => {
      // Find matching project
      const proj = projects.find(p => p.name === je.project);
      if (proj) {
        je.lines.forEach(line => {
          const acc = accounts.find(a => a.code === line.accountCode);
          if (!acc) return;
          if (acc.type === 'Revenue') {
            metrics[proj.name].revenue += (line.credit - line.debit);
          } else if (acc.type === 'Expenses') {
            metrics[proj.name].expenses += (line.debit - line.credit);
          }
        });
      }
    });

    return metrics;
  }, [projects, journalEntries, accounts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!projName.trim()) {
      setErrorMsg('Please provide an activity or program name.');
      return;
    }
    if (budget < 0) {
      setErrorMsg('Budget must be positive or zero.');
      return;
    }

    if (projects.some(p => p.name.toLowerCase() === projName.toLowerCase())) {
      setErrorMsg('An activity with this name already exists.');
      return;
    }

    addProject(projName, budget, description);
    
    // Clear state
    setProjName('');
    setBudget(0);
    setDescription('');
    setShowAddForm(false);
  };

  const handleStatusChange = (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Active' ? 'Completed' : currentStatus === 'Completed' ? 'On Hold' : 'Active';
    updateProject(id, { status: nextStatus as any });
  };

  return (
    <div id="p1" className="space-y-6 bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="flex justify-between items-center">

        <div>
          <h2 id="p2" className="text-xl font-bold text-slate-900 dark:text-slate-100">Activities & Programs</h2>
          <p id="p3" className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Allocate funding, monitor budgets, and audit margin efficiencies for distinct activities.</p>
        </div>
        
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-md shadow-blue-900/10 transition-colors cursor-pointer"
          type="button"
        >
          <Plus className="w-4.5 h-4.5" /> Define New Activity
        </button>
      </div>

      {/* Add Project Form Drawer */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-xl space-y-4 animate-in fade-in slide-in-from-top-3 duration-200">
          <h3 className="text-sm font-bold text-gray-800 dark:text-slate-100 border-b border-gray-50 dark:border-slate-800 pb-2">Define New Activity Account</h3>
          
          {errorMsg && (
            <p className="text-xs text-rose-600 font-semibold bg-rose-50 p-2 rounded-lg">{errorMsg}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Activity Name</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="e.g. Health Outreach Q3, Engineering Sprint B..."
                className="w-full bg-gray-50 border border-gray-100 rounded-xl text-xs font-semibold text-gray-850 p-2.5 outline-none focus:border-blue-900 focus:bg-white transition-colors"
                required
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Allocated Budget</label>
              <input
                type="number"
                value={budget || ''}
                onChange={(e) => setBudget(Number(e.target.value))}
                placeholder="0.00"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-850 p-2.5 outline-none focus:border-blue-900 focus:bg-white transition-colors"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe program objectives..."
                className="w-full bg-gray-50 border border-gray-100 rounded-xl text-xs font-medium text-gray-700 p-2.5 outline-none focus:border-blue-900 focus:bg-white transition-colors h-20 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg shadow-sm shadow-blue-900/10 cursor-pointer"
            >
              Add Program
            </button>
          </div>
        </form>
      )}

      {/* Projects List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {projects.map((proj) => {
          const metrics = projectMetrics[proj.name] || { revenue: 0, expenses: 0 };
          const netMargin = metrics.revenue - metrics.expenses;
          
          // Budget utilization ratio
          const spendingRatio = proj.budget > 0 ? (metrics.expenses / proj.budget) * 100 : 0;
          const statusColors = {
            Active: 'bg-blue-50 text-blue-900 border-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/50',
            Completed: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40',
            'On Hold': 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40'
          };


          return (
            <div key={proj.id} id="p4" className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
              {/* Card Title & Header */}
              <div className="space-y-2">

                <div className="flex justify-between items-start">

                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 text-blue-900 border border-slate-100 flex items-center justify-center">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 id="p5" className="text-xs font-black text-slate-900 dark:text-slate-100">{proj.name}</h3>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">Objective Fund Code</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleStatusChange(proj.id, proj.status)}
                    className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full border cursor-pointer hover:scale-105 active:scale-95 transition-transform ${statusColors[proj.status]}`}

                    type="button"
                    title="Click to cycle status"
                  >
                    {proj.status}
                  </button>
                </div>

                  <p id="p6" className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed min-h-8">
                  {proj.description || 'No description provided.'}
                </p>
              </div>

              {/* Financial Breakdown Table */}
              <div className="grid grid-cols-3 gap-3 border-y border-slate-50 dark:border-slate-800 py-4 my-4 text-center">

                <div>
                  <span id="p7" className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Budget Cap</span>
                  {editingBudgetId === proj.id ? (
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="number"
                        autoFocus
                        value={editingBudgetValue}
                        onChange={(e) => setEditingBudgetValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditingBudget(proj.id);
                          if (e.key === 'Escape') setEditingBudgetId(null);
                        }}
                        className="w-16 bg-white dark:bg-slate-950 border border-blue-900 dark:border-blue-500 rounded text-[11px] font-bold text-slate-900 dark:text-slate-100 p-0.5 outline-none text-center"
                      />
                      <button type="button" onClick={() => saveEditingBudget(proj.id)} className="text-emerald-600 hover:text-emerald-700" title="Save">
                        <Check className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => setEditingBudgetId(null)} className="text-slate-400 hover:text-rose-500" title="Cancel">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditingBudget(proj)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-900 dark:text-slate-100 hover:text-blue-900 dark:hover:text-blue-300 group"
                      title="Edit budget"
                    >
                      {formatCurrency(proj.budget)}
                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </button>
                  )}
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Actual Cost</span>
                  <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{formatCurrency(metrics.expenses)}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Margin</span>
                  <span className={`text-[11px] font-bold ${netMargin >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-500 dark:text-rose-300'}`}>
                    {formatCurrency(netMargin)}
                  </span>
                </div>
              </div>

              {/* Budget Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <span>Budget Burn Rate</span>
                  <span className={spendingRatio > 100 ? 'text-rose-600 dark:text-rose-300 font-bold' : spendingRatio > 85 ? 'text-amber-500 dark:text-amber-300 font-bold' : 'text-slate-700 dark:text-slate-300'}>

                    {spendingRatio.toFixed(1)}% Used
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-100/50">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      spendingRatio > 100 ? 'bg-rose-500' : spendingRatio > 85 ? 'bg-amber-500' : 'bg-blue-900'
                    }`}
                    style={{ width: `${Math.min(spendingRatio, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
