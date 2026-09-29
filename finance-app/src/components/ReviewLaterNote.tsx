import React from 'react';
import { ClipboardCheck } from 'lucide-react';

export function ReviewLaterNote(): React.ReactElement {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] font-semibold leading-4 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span><b>Note:</b> If information is not yet complete, you may save the transaction as a draft and update the missing amounts or details later in the Review section.</span>
    </p>
  );
}
