import React from 'react';

export function UnremittedCollectionNote(): React.ReactElement {
  return (
    <p role="note" className="text-[14px] font-medium leading-6 text-red-600 dark:text-red-400">
      <b>Reminder:</b> The system automatically records all collections as Cash. If any amount collected by an officer remains unremitted at the end of the reporting period, record the unremitted amount by selecting <b>“Unremitted Collections by an Officer”</b> under the <b>Miscellaneous Transaction</b> category to transfer the amount from Cash to Due from Officer.
    </p>
  );
}
