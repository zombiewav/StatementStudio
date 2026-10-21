import React from 'react';
import { OTHER_ADJUSTMENTS_NOTE } from '../lib/otherAdjustments';
import { useOtherAdjustments } from '../hooks/useOtherAdjustments';
import { TransactionDraft } from '../types';
import { PpeAdjustmentsSection } from '../components/PpeAdjustmentsSection';
import { PrepaidAdjustmentsSection } from '../components/PrepaidAdjustmentsSection';
import { CashAdjustmentSection } from '../components/CashAdjustmentSection';

interface OtherAdjustmentsProps {
  // Review's Continue/Post on a depreciation or retirement draft opens it here.
  draftToResume?: TransactionDraft | null;
  autoPostDraft?: boolean;
  onDraftResumed?: () => void;
  onDraftPosted?: (message: string) => void;
}

function SectionCard({ number, title, updated, outstanding, children }: { number: number; title: string; updated: boolean; outstanding: number; children: React.ReactNode }): React.ReactElement {
  return <section aria-label={title} className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 sm:p-5 ${updated ? 'border-slate-200 dark:border-slate-800' : 'border-rose-200 dark:border-rose-500/30'}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{number}. {title}</h3>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${updated ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'}`}>{updated ? 'Updated' : `${outstanding} to update`}</span>
    </div>
    {children}
  </section>;
}

export function OtherAdjustments({ draftToResume = null, autoPostDraft = false, onDraftResumed, onDraftPosted }: OtherAdjustmentsProps): React.ReactElement {
  const { status, semesterKey, saveRecord } = useOtherAdjustments();
  return <div className="space-y-6">
    <div>
      <h2 className="font-display text-3xl text-slate-900 dark:text-slate-100">Other <em className="text-blue-700 dark:text-blue-400">Adjustments</em></h2>
      <p role="note" className="mt-2 text-xs font-bold text-slate-900 dark:text-slate-100">{OTHER_ADJUSTMENTS_NOTE}</p>
      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Complete these end-of-semester adjustments before generating your financial statements.</p>
    </div>
    <SectionCard number={1} title="Depreciation/Retirement of Property, Plant, and Equipment (PPE)" updated={status.ppe.updated} outstanding={status.ppe.outstanding}>
      <PpeAdjustmentsSection
        groups={status.ppe.groups}
        onSaveClassification={(referenceId, classification) => saveRecord(current => ({ ...current, ppe: { ...(current.ppe || {}), [referenceId]: classification } }))}
        draftToResume={draftToResume} autoPostDraft={autoPostDraft} onDraftResumed={onDraftResumed} onDraftPosted={onDraftPosted}
      />
    </SectionCard>
    <SectionCard number={2} title="Consumption of Prepaid Assets" updated={status.prepaid.updated} outstanding={status.prepaid.outstanding}>
      <PrepaidAdjustmentsSection
        items={status.prepaid.items} semesterKey={semesterKey}
        onCarriedUpdated={accountCode => saveRecord(current => ({ ...current, prepaidCarried: { ...(current.prepaidCarried || {}), [accountCode]: true } }))}
      />
    </SectionCard>
    <SectionCard number={3} title="Cash" updated={status.cash.updated} outstanding={status.cash.outstanding ? 1 : 0}>
      <CashAdjustmentSection cash={status.cash} onSave={amount => saveRecord(current => ({ ...current, cashBankAndEwallet: amount }))} />
    </SectionCard>
  </div>;
}
