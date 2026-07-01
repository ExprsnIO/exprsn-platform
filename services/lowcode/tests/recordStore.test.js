'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../src/services/filevaultClient', () => ({
  writeRecordFile: jest.fn(),
  deleteRecordFile: jest.fn(),
  exportEntityFile: jest.fn(),
}));

const filevault = require('../src/services/filevaultClient');
const recordStore = require('../src/services/recordStore');

beforeEach(() => jest.clearAllMocks());

function fakeRecord(over = {}) {
  return { id: 'rec-1', data: { a: 1 }, storageRef: null, save: jest.fn().mockResolvedValue(), destroy: jest.fn(), ...over };
}

describe('recordStore mode routing', () => {
  test('mode() defaults to db and validates the enum', () => {
    expect(recordStore.mode({})).toBe('db');
    expect(recordStore.mode({ storage: { mode: 'mirror' } })).toBe('mirror');
    expect(recordStore.mode({ storage: { mode: 'bogus' } })).toBe('db');
  });

  test('mirrorsPerRecord is true for mirror/filevault, false for db/export', () => {
    expect(recordStore.mirrorsPerRecord({ storage: { mode: 'mirror' } })).toBe(true);
    expect(recordStore.mirrorsPerRecord({ storage: { mode: 'filevault' } })).toBe(true);
    expect(recordStore.mirrorsPerRecord({ storage: { mode: 'export' } })).toBe(false);
    expect(recordStore.mirrorsPerRecord({})).toBe(false);
  });

  test('db-mode write does NOT touch FileVault', async () => {
    const rec = fakeRecord();
    const out = await recordStore.onWrite({ key: 'e', storage: { mode: 'db' } }, rec);
    expect(out.skipped).toBe(true);
    expect(filevault.writeRecordFile).not.toHaveBeenCalled();
  });

  test('mirror write persists the returned fileId onto storageRef', async () => {
    filevault.writeRecordFile.mockResolvedValue({ ok: true, fileId: 'fv-9' });
    const rec = fakeRecord();
    await recordStore.onWrite({ key: 'ticket', storage: { mode: 'mirror' } }, rec, { authorization: 'Bearer x' });
    expect(filevault.writeRecordFile).toHaveBeenCalled();
    expect(rec.storageRef).toEqual({ filevaultId: 'fv-9' });
    expect(rec.save).toHaveBeenCalledWith({ fields: ['storageRef'] });
  });

  test('replacing a record deletes the previous FileVault file', async () => {
    filevault.writeRecordFile.mockResolvedValue({ ok: true, fileId: 'fv-new' });
    const rec = fakeRecord({ storageRef: { filevaultId: 'fv-old' } });
    await recordStore.onWrite({ key: 'ticket', storage: { mode: 'mirror' } }, rec);
    expect(filevault.deleteRecordFile).toHaveBeenCalledWith('fv-old', expect.any(Object));
  });

  test('onDelete removes the mirrored file for mirror mode', async () => {
    const rec = fakeRecord({ storageRef: { filevaultId: 'fv-1' } });
    await recordStore.onDelete({ storage: { mode: 'mirror' } }, rec, { authorization: 'Bearer x' });
    expect(filevault.deleteRecordFile).toHaveBeenCalledWith('fv-1', { authorization: 'Bearer x' });
  });

  test('onDelete is a no-op for db mode', async () => {
    await recordStore.onDelete({ storage: { mode: 'db' } }, fakeRecord());
    expect(filevault.deleteRecordFile).not.toHaveBeenCalled();
  });
});
