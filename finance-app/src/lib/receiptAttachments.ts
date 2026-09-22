import { JournalEntry, ReceiptAttachmentDraft } from '../types';

export const MAX_RECEIPTS_PER_TRANSACTION = 3;
export const MAX_RECEIPT_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_STORED_RECEIPT_BYTES = 700 * 1024;
export const ACCEPTED_RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ReceiptFileLike {
  name: string;
  type: string;
  size: number;
}

export function validateReceiptFile(file: ReceiptFileLike): string | null {
  if (!ACCEPTED_RECEIPT_MIME_TYPES.includes(file.type)) {
    return `${file.name} is not a supported receipt image. Use JPG, PNG, or WebP.`;
  }
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_RECEIPT_SOURCE_BYTES) {
    return `${file.name} is larger than 10 MB.`;
  }
  return null;
}

export function validateReceiptCount(existingCount: number, incomingCount: number): string | null {
  if (existingCount + incomingCount > MAX_RECEIPTS_PER_TRANSACTION) {
    return `A transaction can have up to ${MAX_RECEIPTS_PER_TRANSACTION} receipt images.`;
  }
  return null;
}

export function dataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The receipt image could not be opened.'));
    image.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.readAsDataURL(file);
  });
}

function renderCompressed(image: HTMLImageElement, maxDimension: number, quality: number): string {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Receipt image processing is unavailable in this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function prepareReceiptAttachment(file: File): Promise<ReceiptAttachmentDraft> {
  const validation = validateReceiptFile(file);
  if (validation) throw new Error(validation);

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  let dataUrl = renderCompressed(image, 1600, 0.78);
  if (dataUrlByteSize(dataUrl) > MAX_STORED_RECEIPT_BYTES) {
    dataUrl = renderCompressed(image, 1200, 0.62);
  }
  const storedSize = dataUrlByteSize(dataUrl);
  if (storedSize > MAX_STORED_RECEIPT_BYTES) {
    throw new Error(`${file.name} is still too large after compression. Try a clearer crop of the receipt.`);
  }

  return {
    id: `receipt-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    fileName: file.name,
    mimeType: 'image/jpeg',
    size: storedSize,
    dataUrl,
    uploadedAt: new Date().toISOString(),
  };
}

export function formatReceiptSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function linkReceiptIdsToEntry(entry: JournalEntry, receiptIds: string[]): JournalEntry {
  const existingIds = entry.transactionDetails?.receiptAttachmentIds || [];
  return {
    ...entry,
    transactionDetails: {
      ...entry.transactionDetails,
      eventRelated: entry.transactionDetails?.eventRelated ?? !!entry.eventName,
      receiptAttachmentIds: Array.from(new Set([...existingIds, ...receiptIds])),
    },
  };
}
