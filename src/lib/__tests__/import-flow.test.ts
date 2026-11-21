import { buildPreview, fileKind, nextStep, type Account, type PendingFile } from '../import-flow';

const csv: PendingFile = { name: 'march.csv', kind: 'csv', text: 'Date,Description,Amount\n2026-03-03,Lidl,-42.17\n' };
const account: Account = { id: 'a1', name: 'Current', currency: 'EUR', file_mapping: null };
const mapped: Account = {
  ...account,
  file_mapping: { date: 'Date', description: 'Description', amount: 'Amount', dateFormat: 'YYYY-MM-DD', decimalSeparator: '.' },
};

it('asks for a column mapping on the first CSV upload for an account', () => {
  expect(nextStep(csv, account)).toBe('map-columns');
});

it('reuses the saved mapping on the next upload without asking again', () => {
  expect(nextStep(csv, mapped)).toBe('preview');
  expect(buildPreview(csv, mapped).records).toHaveLength(1);
});

it('never asks for a mapping for OFX files', () => {
  expect(nextStep({ name: 's.ofx', kind: 'ofx', text: '' }, account)).toBe('preview');
});

it('finds no transactions in an empty file', () => {
  expect(buildPreview({ ...csv, text: '' }, mapped).records).toEqual([]);
});

it('recognizes statement file types', () => {
  expect(fileKind('Revolut.CSV')).toBe('csv');
  expect(fileKind('bank.ofx')).toBe('ofx');
  expect(fileKind('photo.jpg')).toBeNull();
});

it('asks for the mapping again when the saved one does not fit the file', () => {
  const broken: Account = {
    ...account,
    file_mapping: { date: 'Summary', description: 'Summary', amount: 'Summary', dateFormat: 'YYYY-MM-DD', decimalSeparator: '.' },
  };
  expect(nextStep(csv, broken)).toBe('map-columns');
});
