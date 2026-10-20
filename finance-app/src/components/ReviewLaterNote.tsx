import React from 'react';
import { ClipboardCheck } from 'lucide-react';

// Client (Oct 2026): shown on every transaction form, directly above Save as Draft, in a large, noticeable style.
export const REVIEW_LATER_NOTE_TEXT = 'Save this transaction as a draft and do not post it yet until all collections and payments made within the reporting period have been updated. You may edit the transaction later in the Review section before posting.';

export function ReviewLaterNote(): React.ReactElement {
  return (
    <p className="flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3.5 text-[15px] font-bold leading-6 text-amber-900 dark:border-amber-400/60 dark:bg-amber-500/15 dark:text-amber-100">
      <ClipboardCheck className="mt-1 h-5 w-5 shrink-0" />
      <span><b>Note:</b> {REVIEW_LATER_NOTE_TEXT}</span>
    </p>
  );
}
