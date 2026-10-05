import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileNotFoundError } from '../src/storage/index.js';
import { LocalDiskStorage } from '../src/storage/local-disk-storage.js';

describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'stockpot-storage-'));
    storage = new LocalDiskStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores and reads back a file under a nested key', async () => {
    await storage.put('documents/braising.md', Buffer.from('# Braising\nLow and slow.'));
    expect((await storage.get('documents/braising.md')).toString()).toBe('# Braising\nLow and slow.');
    expect(await readdir(path.join(root, 'documents'))).toEqual(['braising.md']);
  });

  it('reports a missing file with FileNotFoundError', async () => {
    await expect(storage.get('documents/nope.md')).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it('deletes files and ignores keys that are already gone', async () => {
    await storage.put('a.txt', Buffer.from('x'));
    await storage.delete('a.txt');
    await storage.delete('a.txt');
    await expect(storage.get('a.txt')).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it.each(['', '../escape.txt', 'documents/../../escape.txt', '/etc/passwd', 'a//b', './a', 'a\\b'])(
    'rejects the unsafe key %j',
    async (key) => {
      await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('Invalid storage key');
    },
  );
});
