import React, { useEffect, useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { checkPpeClassification, PPE_QUESTIONS, PpeGroupStatus } from '../lib/otherAdjustments';
import { PPE_ITEMS, ppeItemForDepreciation, ppeItemForRetirement } from '../lib/ppeItems';
import { PpeClassification, TransactionDraft } from '../types';
import { DEPRECIATION_DRAFT, DepreciationEntry } from './DepreciationEntry';
import { RETIREMENT_OF_PPE_DRAFT, RetirementOfPpeEntry } from './RetirementOfPpeEntry';

interface PinnedForm { kind: 'retirement' | 'depreciation'; referenceId: string; itemCode: string; quantity: number }

interface PpeAdjustmentsSectionProps {
  groups: PpeGroupStatus[];
  onSaveClassification: (referenceId: string, classification: PpeClassification) => void;
  draftToResume?: TransactionDraft | null;
  autoPostDraft?: boolean;
  onDraftResumed?: () => void;
  onDraftPosted?: (message: string) => void;
}

const statusLabel = (group: PpeGroupStatus): { text: string; tone: 'done' | 'open' } => {
  if (group.needsClassification) return { text: 'Needs classification', tone: 'open' };
  if (group.retirementPending > 0) return { text: `Retire ${group.retirementPending} unit${group.retirementPending === 1 ? '' : 's'}`, tone: 'open' };
  if (group.depreciationPending) return { text: 'Depreciation needed', tone: 'open' };
  return { text: 'Updated', tone: 'done' };
};

export function PpeAdjustmentsSection({ groups, onSaveClassification, draftToResume = null, autoPostDraft = false, onDraftResumed, onDraftPosted }: PpeAdjustmentsSectionProps): React.ReactElement {
  const { journalEntries, formatCurrency } = useFinance();
  const [openItem, setOpenItem] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [answers, setAnswers] = useState({ continueQuantity: '', nextYearQuantity: '', retireQuantity: '' });
  const [pinned, setPinned] = useState<PinnedForm[]>([]);

  const selected = groups.find(group => group.reference.referenceId === selectedId);
  const itemsWithGroups = PPE_ITEMS.filter(item => groups.some(group => group.reference.item.code === item.code));

  const select = (group: PpeGroupStatus) => {
    setSelectedId(group.reference.referenceId);
    setOpenItem(group.reference.item.code);
    setAnswers(group.classification
      ? { continueQuantity: String(group.classification.continueQuantity), nextYearQuantity: String(group.classification.nextYearQuantity), retireQuantity: String(group.classification.retireQuantity) }
      : { continueQuantity: '', nextYearQuantity: '', retireQuantity: '' });
  };

  // Review's Continue/Post on a depreciation or retirement draft lands here: open its group and bring its form up.
  useEffect(() => {
    if (!draftToResume || (draftToResume.category !== DEPRECIATION_DRAFT && draftToResume.category !== RETIREMENT_OF_PPE_DRAFT)) return;
    const entry = journalEntries.find(candidate => candidate.id === draftToResume.journalEntryId);
    const savedItemCode = entry?.transactionDetails?.ppeItemCode || (typeof draftToResume.formState.itemCode === 'string' ? draftToResume.formState.itemCode : '')
      || ppeItemForDepreciation(entry?.transactionType ?? entry?.description)?.code || '';
    // Drafts saved before references existed name only the item: they belong to its oldest group.
    const referenceId = entry?.transactionDetails?.ppeReferenceId || (typeof draftToResume.formState.referenceChoice === 'string' ? draftToResume.formState.referenceChoice : '')
      || (typeof draftToResume.formState.referenceId === 'string' ? draftToResume.formState.referenceId : '')
      || groups.find(group => group.reference.item.code === savedItemCode)?.reference.referenceId || '';
    const itemCode = savedItemCode || ppeItemForRetirement(groups.find(group => group.reference.referenceId === referenceId)?.reference.item.code)?.code || '';
    const kind = draftToResume.category === RETIREMENT_OF_PPE_DRAFT ? 'retirement' as const : 'depreciation' as const;
    const quantity = kind === 'retirement' ? Number(draftToResume.formState.quantity) || entry?.transactionDetails?.ppeRetiredQuantity || 0 : 0;
    if (!referenceId) return;
    setSelectedId(referenceId);
    setOpenItem(itemCode);
    setPinned(previous => previous.some(item => item.kind === kind && item.referenceId === referenceId) ? previous : [...previous, { kind, referenceId, itemCode, quantity }]);
  }, [draftToResume, journalEntries, groups]);

  const check = useMemo(
    () => selected ? checkPpeClassification(selected.reference.quantity + selected.retiredThisSemester, answers, selected.retiredThisSemester) : null,
    [selected, answers],
  );
  const pin = (kind: PinnedForm['kind'], referenceId: string, itemCode: string, quantity: number) =>
    setPinned(previous => previous.some(item => item.kind === kind && item.referenceId === referenceId) ? previous : [...previous, { kind, referenceId, itemCode, quantity }]);

  const classification = selected?.classification;
  const keptUnits = classification ? classification.continueQuantity + classification.nextYearQuantity : 0;
  const pinnedFor = (kind: PinnedForm['kind']) => pinned.find(item => item.kind === kind && item.referenceId === selectedId);
  const retireTarget = classification ? classification.retireQuantity : pinnedFor('retirement')?.quantity || 0;
  const showRetirement = retireTarget > 0 || !!pinnedFor('retirement');
  const depreciationReady = !!selected && !!classification && keptUnits > 0 && selected.retirementPending === 0;
  const showDepreciation = !!pinnedFor('depreciation') || (depreciationReady && (selected.reference.netBookValue > 0.005));
  const itemCode = selected?.reference.item.code || pinned.find(item => item.referenceId === selectedId)?.itemCode || '';
  const unitNote = (value: number) => `${value} unit${value === 1 ? '' : 's'}`;

  return <div className="space-y-4">
    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Pick a PPE item that your organization still holds, then the group of units (items bought at the same amount per unit) you want to adjust.</p>
    {itemsWithGroups.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[13px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">No PPE item has a remaining quantity, so there is nothing to depreciate or retire this semester.</p>}
    <div className="flex flex-wrap gap-2">
      {itemsWithGroups.map(item => {
        const itemGroups = groups.filter(group => group.reference.item.code === item.code);
        const open = itemGroups.filter(group => group.outstanding).length;
        return <button key={item.code} type="button" aria-pressed={openItem === item.code} onClick={() => setOpenItem(openItem === item.code ? '' : item.code)} className={`rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${openItem === item.code ? 'border-blue-700 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-100' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
          {item.label}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-black ${open > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'}`}>{open > 0 ? `${open} to update` : 'Updated'}</span>
        </button>;
      })}
    </div>

    {openItem && <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-slate-50 text-[12px] font-bold uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr><th className="p-3">Group</th><th className="p-3 text-right">Available Quantity</th><th className="p-3 text-right">Amount per Unit</th><th className="p-3 text-right">Remaining Original Cost</th><th className="p-3 text-right">Accumulated Depreciation</th><th className="p-3 text-right">Net Book Value</th><th className="p-3">Status</th></tr>
        </thead>
        <tbody>
          {groups.filter(group => group.reference.item.code === openItem).map(group => {
            const label = statusLabel(group);
            const chosen = group.reference.referenceId === selectedId;
            return <tr key={group.reference.referenceId} aria-selected={chosen} onClick={() => select(group)} className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${chosen ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
              <td className="p-3 font-bold text-slate-900 dark:text-slate-100"><button type="button" onClick={() => select(group)} className="text-left underline-offset-2 hover:underline">Group {group.groupNumber}</button></td>
              <td className="p-3 text-right font-semibold">{group.reference.quantity}</td>
              <td className="p-3 text-right font-semibold">{formatCurrency(group.reference.unitCost)}</td>
              <td className="p-3 text-right font-semibold">{formatCurrency(group.reference.cost)}</td>
              <td className="p-3 text-right font-semibold">{formatCurrency(group.reference.accumulatedDepreciation)}</td>
              <td className="p-3 text-right font-semibold">{formatCurrency(group.reference.netBookValue)}</td>
              <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase ${label.tone === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'}`}>{label.text}</span></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>}

    {(selected || pinned.some(item => item.referenceId === selectedId)) && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        {selected ? <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{selected.reference.item.label} · Group {selected.groupNumber}: {selected.reference.quantity} available at {formatCurrency(selected.reference.unitCost)} per unit</h4>
          {[['continueQuantity', 0], ['nextYearQuantity', 1], ['retireQuantity', 2]].map(([field, index]) => <label key={field as string} className="block text-[13px] font-bold text-slate-700 dark:text-slate-300">
            <span>Question {(index as number) + 1}: {PPE_QUESTIONS[index as number]}</span>
            <input type="number" min="0" step="1" aria-label={`Question ${(index as number) + 1} quantity`} value={answers[field as keyof typeof answers]} onChange={event => setAnswers(previous => ({ ...previous, [field as string]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-800" />
          </label>)}
          <div className="flex items-center justify-between rounded-lg bg-white p-3 text-xs font-black dark:bg-slate-800">
            <span>TOTAL</span><span aria-label="Total units">{check?.total ?? 0} of {selected.reference.quantity + selected.retiredThisSemester}</span>
          </div>
          {check?.error && Object.values(answers).some(value => value !== '') && <p role="alert" className="text-[12px] font-bold text-rose-700 dark:text-rose-300">{check.error}</p>}
          <button type="button" disabled={!check || !!check.error} onClick={() => check && !check.error && onSaveClassification(selected.reference.referenceId, check.quantities)} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{classification ? 'Update classification' : 'Save classification'}</button>
          {classification && <ul className="space-y-1 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {keptUnits > 0 && (selected.reference.netBookValue > 0.005
              ? <li>• {unitNote(keptUnits)} kept: record this semester&apos;s depreciation in the form{selected.retirementPending > 0 ? ' (after the retirement)' : ''}.</li>
              : <li>• {unitNote(keptUnits)} kept: the Net Book Value is zero, so no depreciation transaction is necessary.</li>)}
            {classification.retireQuantity > 0 && <li>• {unitNote(classification.retireQuantity)} no longer used: record the retirement{selected.retirementPending === 0 ? ' (done)' : ''}.</li>}
          </ul>}
        </div> : <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">This group is fully updated: every unit has been retired or accounted for.</p>}
      </div>
      <div className="space-y-4">
        {showRetirement && <RetirementOfPpeEntry key={`retire-${selectedId}`} fixed={{ itemCode, referenceId: selectedId, targetQuantity: retireTarget }} draftToResume={draftToResume} autoPostDraft={autoPostDraft} onDraftResumed={onDraftResumed} onDraftPosted={onDraftPosted} onDraftSaved={() => pin('retirement', selectedId, itemCode, retireTarget)} />}
        {selected && classification && keptUnits > 0 && selected.retirementPending > 0 && !pinnedFor('depreciation') && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Record the retirement first, so the depreciation covers only the units you keep.</p>}
        {showDepreciation && <DepreciationEntry key={`depreciate-${selectedId}`} referenceId={selectedId} draftToResume={draftToResume} autoPostDraft={autoPostDraft} onDraftResumed={onDraftResumed} onDraftPosted={onDraftPosted} onDraftSaved={() => pin('depreciation', selectedId, itemCode, 0)} />}
      </div>
    </div>}
  </div>;
}
