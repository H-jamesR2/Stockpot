/** Where raw uploaded files live. Local disk now, S3 in the AWS phase. */
export interface FileStorage {
  put(key: string, content: Buffer): Promise<void>;
  /** Throws FileNotFoundError when nothing is stored under the key. */
  get(key: string): Promise<Buffer>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
}

export class FileNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`No stored file for key "${key}"`);
    this.name = 'FileNotFoundError';
  }
}

/** Keys are relative paths such as "documents/2f1c.md". */
export function assertValidKey(key: string): void {
  const segments = key.split('/');
  const valid =
    key.length > 0 &&
    !key.startsWith('/') &&
    !key.includes('\\') &&
    !key.includes('\0') &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
  if (!valid) throw new Error(`Invalid storage key "${key}"`);
}
