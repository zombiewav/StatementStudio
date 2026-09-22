import React, { useMemo, useState } from 'react';
import { Check, Edit3, ListPlus, Plus, Search, ShieldCheck, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';

export function CustomTransactionTypesManager(): React.ReactElement {
  const {
    accounts,
    classificationRules,
    customClassificationRules,
    addCustomClassificationRule,
    updateCustomClassificationRule,
  } = useFinance();
  const activeAccounts = accounts.filter(account => account.isActive);
  const customNames = new Set(customClassificationRules.map(rule => rule.description.toLowerCase()));
  const builtInTypes = useMemo(
    () => Array.from(new Set(classificationRules
      .filter(rule => !customNames.has(rule.description.toLowerCase()))
      .map(rule => rule.description)
    )).sort(),
    [classificationRules, customClassificationRules]
  );

  const [search, setSearch] = useState('');
  const [showAllBuiltIns, setShowAllBuiltIns] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [debitCode, setDebitCode] = useState('');
  const [creditCode, setCreditCode] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDebit, setEditingDebit] = useState('');
  const [editingCredit, setEditingCredit] = useState('');

  const query = search.trim().toLowerCase();
  const filteredBuiltIns = builtInTypes.filter(type => type.toLowerCase().includes(query));
  const displayedBuiltIns = showAllBuiltIns || query ? filteredBuiltIns : filteredBuiltIns.slice(0, 12);
  const filteredCustom = customClassificationRules.filter(rule => rule.description.toLowerCase().includes(query));

  const accountLabel = (code: string) => {
    const account = accounts.find(candidate => candidate.code === code);
    return account ? `${account.code} — ${account.name}` : code;
  };

  const resetAddForm = () => {
    setName('');
    setDebitCode('');
    setCreditCode('');
    setShowAddForm(false);
  };

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      addCustomClassificationRule(name, debitCode, creditCode);
      setMessage(`${name.trim()} was added to the transaction dropdown.`);
      resetAddForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add the transaction type.');
    }
  };

  const beginEdit = (id: string) => {
    const rule = customClassificationRules.find(candidate => candidate.id === id);
    if (!rule) return;
    setEditingId(id);
    setEditingName(rule.description);
    setEditingDebit(rule.debitAccountCode);
    setEditingCredit(rule.creditAccountCode);
    setMessage('');
  };

  const saveEdit = () => {
    if (!editingId) return;
    setMessage('');
    try {
      updateCustomClassificationRule(editingId, {
        description: editingName,
        debitAccountCode: editingDebit,
        creditAccountCode: editingCredit,
      });
      setMessage(`${editingName.trim()} was updated. Existing journal entries were not changed.`);
      setEditingId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the transaction type.');
    }
  };

  const toggleActive = (id: string, isActive: boolean) => {
    setMessage('');
    try {
      updateCustomClassificationRule(id, { isActive: !isActive });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the transaction type.');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <ListPlus className="h-4.5 w-4.5 text-blue-800 dark:text-blue-400" /> Manage Transaction Types
          </h3>
          <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">Custom types use fixed automatic accounts. Built-in accounting rules remain protected.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAddForm(previous => !previous); setMessage(''); }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-800 dark:bg-blue-600"
        >
          <Plus className="h-3.5 w-3.5" /> Add Custom Type
        </button>
      </div>

      {message && (
        <p className={`mt-3 rounded-lg p-2.5 text-[10px] font-semibold ${message.includes('added') || message.includes('updated') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'}`}>{message}</p>
      )}

      {showAddForm && (
        <form onSubmit={handleAdd} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-500/20 dark:bg-blue-500/5 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Transaction Type Name</label>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="Example: Alumni Fundraiser" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Automatic Debit Account</label>
            <select value={debitCode} onChange={event => setDebitCode(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <option value="">Select debit account…</option>
              {activeAccounts.map(account => <option key={account.code} value={account.code}>{account.code} — {account.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Automatic Credit Account</label>
            <select value={creditCode} onChange={event => setCreditCode(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <option value="">Select credit account…</option>
              {activeAccounts.map(account => <option key={account.code} value={account.code}>{account.code} — {account.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 md:col-span-3 md:justify-end">
            <button type="button" onClick={resetAddForm} className="rounded-lg border border-slate-300 px-3 py-2 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-[10px] font-bold text-white hover:bg-blue-800">Save Custom Type</button>
          </div>
        </form>
      )}

      <div className="relative mt-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search transaction types…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Built-in Types ({filteredBuiltIns.length})</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {displayedBuiltIns.map(type => <span key={type} className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{type}</span>)}
            {displayedBuiltIns.length === 0 && <p className="text-[10px] text-slate-400">No built-in types match.</p>}
          </div>
          {!query && filteredBuiltIns.length > 12 && (
            <button type="button" onClick={() => setShowAllBuiltIns(previous => !previous)} className="mt-3 text-[9px] font-bold text-blue-700 hover:underline dark:text-blue-300">{showAllBuiltIns ? 'Show fewer' : `Show all ${filteredBuiltIns.length}`}</button>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Custom Types ({filteredCustom.length})</p>
          <div className="mt-3 space-y-2">
            {filteredCustom.length === 0 && <p className="text-[10px] text-slate-400">No custom transaction types yet.</p>}
            {filteredCustom.map(rule => editingId === rule.id ? (
              <div key={rule.id} className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/30 dark:bg-blue-500/5">
                <input value={editingName} onChange={event => setEditingName(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white p-2 text-[10px] font-semibold dark:border-slate-700 dark:bg-slate-950" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select value={editingDebit} onChange={event => setEditingDebit(event.target.value)} className="rounded-md border border-slate-300 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-950">{activeAccounts.map(account => <option key={account.code} value={account.code}>Dr {account.code} — {account.name}</option>)}</select>
                  <select value={editingCredit} onChange={event => setEditingCredit(event.target.value)} className="rounded-md border border-slate-300 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-950">{activeAccounts.map(account => <option key={account.code} value={account.code}>Cr {account.code} — {account.name}</option>)}</select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-md border border-slate-300 p-1.5 text-slate-500 dark:border-slate-700"><X className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={saveEdit} className="rounded-md bg-blue-700 p-1.5 text-white"><Check className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ) : (
              <div key={rule.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${rule.isActive ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40' : 'border-slate-200 bg-slate-100 opacity-60 dark:border-slate-800 dark:bg-slate-950/20'}`}>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold text-slate-800 dark:text-slate-100">{rule.description}</p>
                  <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">Dr {accountLabel(rule.debitAccountCode)} · Cr {accountLabel(rule.creditAccountCode)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => beginEdit(rule.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Edit custom type"><Edit3 className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => toggleActive(rule.id, rule.isActive)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={rule.isActive ? 'Disable custom type' : 'Enable custom type'}>
                    {rule.isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
