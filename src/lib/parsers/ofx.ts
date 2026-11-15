import { parseAmountToMinor } from '../money';
import type { ParseResult, SourceRecord } from './types';

function tag(block: string, name: string) {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return match ? match[1].trim() : '';
}

/** Parses OFX 1.x (SGML) and 2.x (XML) statements. The OFX FITID becomes the transaction ID. */
export function parseOfx(text: string, accountCurrency: string): ParseResult {
  const currency = (tag(text, 'CURDEF') || accountCurrency).toUpperCase();
  const records: SourceRecord[] = [];
  const errors: ParseResult['errors'] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  blocks.forEach((block, index) => {
    const posted = tag(block, 'DTPOSTED');
    const date = /^\d{8}/.test(posted) ? `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}` : null;
    const amount = parseAmountToMinor(tag(block, 'TRNAMT'), '.', currency);
    if (!date || amount === null) {
      errors.push({ row: index + 1, message: 'Unreadable transaction' });
      return;
    }
    const fitid = tag(block, 'FITID');
    records.push({
      booking_date: date,
      amount_minor: amount,
      currency,
      description: tag(block, 'NAME') || tag(block, 'MEMO'),
      ...(fitid ? { provider_transaction_id: fitid } : {}),
      raw: { NAME: tag(block, 'NAME'), MEMO: tag(block, 'MEMO'), TRNTYPE: tag(block, 'TRNTYPE') },
    });
  });
  return { records, errors };
}
