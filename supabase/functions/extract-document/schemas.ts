// Structured-output schemas for statements and receipts. Amounts are decimal strings, converted to minor units on the server.

const amount = { type: 'string', description: 'Decimal amount with a dot, for example "-42.17". Money spent is negative.' };
const date = { type: 'string', description: 'ISO date, YYYY-MM-DD' };
const currency = { type: 'string', description: 'ISO 4217 code, for example EUR' };

export const statementSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'description', 'amount', 'currency'],
        properties: { date, description: { type: 'string' }, amount, currency },
      },
    },
  },
};

export const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['merchant', 'date', 'total', 'currency', 'items'],
  properties: {
    merchant: { type: 'string' },
    date,
    total: { type: 'string', description: 'Total paid as a positive decimal, for example "18.40"' },
    currency,
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'amount'],
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          amount: { type: 'string', description: 'Line total as a positive decimal' },
        },
      },
    },
  },
};

export const STATEMENT_PROMPT =
  'You read bank and card statements. List every transaction on these pages, in page order. ' +
  'Use the booking date. Money leaving the account is negative, money arriving is positive. ' +
  'Skip balances, totals, and headers. If a line shows no currency, use the statement currency.';

export const RECEIPT_PROMPT =
  'You read shop receipts. Give the shop name as printed, the purchase date, the total paid, ' +
  'the currency, and each item line with its quantity and line total.';
