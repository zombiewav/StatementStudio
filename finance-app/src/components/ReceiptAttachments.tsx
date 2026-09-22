import React, { useState } from 'react';
import { Image, Paperclip } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  formatReceiptSize,
  prepareReceiptAttachment,
  validateReceiptCount,
} from '../lib/receiptAttachments';

export function ReceiptAttachments({
  entryId,
  allowAdd = false,
}: {
  entryId: string;
  allowAdd?: boolean;
}): React.ReactElement {
  const { receiptAttachments, attachReceiptsToEntry } = useFinance();
  const receipts = receiptAttachments.filter(receipt => receipt.entryId === entryId);
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const countError = validateReceiptCount(receipts.length, files.length);
    if (countError) {
      setMessage(countError);
      return;
    }

    setIsProcessing(true);
    setMessage('');
    try {
      const prepared = [];
      for (const file of Array.from(files)) prepared.push(await prepareReceiptAttachment(file));
      attachReceiptsToEntry(entryId, prepared);
      setMessage(`${prepared.length} receipt image${prepared.length === 1 ? '' : 's'} attached.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The receipt image could not be attached.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          <Paperclip className="h-3.5 w-3.5" /> Receipts ({receipts.length})
        </p>
        {allowAdd && receipts.length < 3 && (
          <label className="cursor-pointer rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
            {isProcessing ? 'Processing…' : receipts.length > 0 ? 'Add another' : 'Attach receipt'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={isProcessing}
              onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ''; }}
              className="sr-only"
            />
          </label>
        )}
      </div>

      {receipts.length === 0 ? (
        <p className="mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {allowAdd ? 'No receipt attached. You can add one here without changing the accounting entry.' : 'No receipt attached.'}
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {receipts.map(receipt => (
            <a
              key={receipt.id}
              href={receipt.dataUrl}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              title={`Open ${receipt.fileName}`}
            >
              <img src={receipt.dataUrl} alt={`Receipt ${receipt.fileName}`} className="h-24 w-full object-cover" />
              <div className="flex items-center gap-1.5 p-2">
                <Image className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-slate-700 dark:text-slate-200">{receipt.fileName}</span>
                <span className="text-[8px] text-slate-400">{formatReceiptSize(receipt.size)}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {message && <p className={`mt-2 text-[10px] font-semibold ${message.includes('attached') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-300'}`}>{message}</p>}
    </div>
  );
}
