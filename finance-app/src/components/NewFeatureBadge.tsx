import React from 'react';

export function NewFeatureBadge(): React.ReactElement {
  return (
    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30">
      New
    </span>
  );
}
