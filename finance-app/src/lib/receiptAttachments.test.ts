import { describe, expect, it } from 'vitest';
import {
  dataUrlByteSize,
  MAX_RECEIPTS_PER_TRANSACTION,
  linkReceiptIdsToEntry,
  validateReceiptCount,
  validateReceiptFile,
} from './receiptAttachments';

describe('receipt attachment validation', () => {
  it('accepts supported image files within the source-size limit', () => {
    expect(validateReceiptFile({ name: 'receipt.jpg', type: 'image/jpeg', size: 500_000 })).toBeNull();
    expect(validateReceiptFile({ name: 'receipt.png', type: 'image/png', size: 500_000 })).toBeNull();
  });

  it('rejects unsupported files and oversized source images', () => {
    expect(validateReceiptFile({ name: 'receipt.pdf', type: 'application/pdf', size: 500_000 })).toContain('not a supported');
    expect(validateReceiptFile({ name: 'huge.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 })).toContain('larger than 10 MB');
  });

  it('caps the number of receipts attached to one transaction', () => {
    expect(validateReceiptCount(1, MAX_RECEIPTS_PER_TRANSACTION - 1)).toBeNull();
    expect(validateReceiptCount(2, 2)).toContain('up to');
  });

  it('calculates decoded bytes from a base64 data URL', () => {
    expect(dataUrlByteSize('data:image/jpeg;base64,YWJjZA==')).toBe(4);
  });

  it('links receipt ids to both smart and legacy journal entries without duplicates', () => {
    const linked = linkReceiptIdsToEntry({
      id: 'je-1', reference: 'JE-0001', date: '2026-01-01', description: 'Legacy', project: 'General Fund Operations', lines: [],
    }, ['receipt-1', 'receipt-1']);
    expect(linked.transactionDetails?.eventRelated).toBe(false);
    expect(linked.transactionDetails?.receiptAttachmentIds).toEqual(['receipt-1']);

    const relinked = linkReceiptIdsToEntry(linked, ['receipt-1', 'receipt-2']);
    expect(relinked.transactionDetails?.receiptAttachmentIds).toEqual(['receipt-1', 'receipt-2']);
  });
});
