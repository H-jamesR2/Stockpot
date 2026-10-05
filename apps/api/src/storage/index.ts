import type { Config } from '../config.js';
import type { FileStorage } from './file-storage.js';
import { LocalDiskStorage } from './local-disk-storage.js';

export * from './file-storage.js';

export function createFileStorage(config: Config): FileStorage {
  switch (config.STORAGE_DRIVER) {
    case 'local':
      return new LocalDiskStorage(config.STORAGE_DIR);
  }
}
