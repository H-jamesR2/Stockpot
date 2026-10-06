import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import type { CreateDocument, DocumentSummary, UploadKind } from '@stockpot/shared';
import { API_BASE_URL } from '../core/api-base-url';

// Mirrors MAX_UPLOAD_CHARS in @stockpot/shared. Importing the value would pull Zod into the
// browser bundle. The API enforces the limit, so this only spares the user a doomed upload.
const MAX_UPLOAD_CHARS = 200_000;
const ACCEPTED = /\.(md|markdown|txt)$/i;

/** "knife-skills_notes.md" becomes "Knife skills notes". */
export function titleFromFilename(filename: string): string {
  const words = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Uploads a Markdown or text file. Closes with the new document once it is chunked and embedded. */
@Component({
  selector: 'sp-upload-document-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './upload-document-dialog.html',
  styleUrl: './upload-document-dialog.scss',
})
export class UploadDocumentDialog {
  private readonly dialogRef = inject<MatDialogRef<UploadDocumentDialog, DocumentSummary>>(MatDialogRef);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    kind: this.fb.control<UploadKind>('technique'),
  });
  protected readonly file = signal<{ name: string; content: string } | null>(null);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async choose(event: Event): Promise<void> {
    const picked = (event.target as HTMLInputElement).files?.[0];
    this.error.set(null);
    this.file.set(null);
    if (!picked) return;

    if (!ACCEPTED.test(picked.name)) {
      this.error.set('Choose a .md, .markdown, or .txt file.');
      return;
    }
    const content = await picked.text();
    if (!content.trim()) {
      this.error.set('That file is empty.');
      return;
    }
    if (content.length > MAX_UPLOAD_CHARS) {
      this.error.set(`That file is too long. The limit is ${MAX_UPLOAD_CHARS.toLocaleString()} characters.`);
      return;
    }
    this.file.set({ name: picked.name, content });
    if (!this.form.controls.title.value) this.form.controls.title.setValue(titleFromFilename(picked.name));
  }

  protected upload(): void {
    const file = this.file();
    if (!file || this.form.invalid || this.uploading()) {
      this.form.markAllAsTouched();
      return;
    }
    const body: CreateDocument = {
      title: this.form.controls.title.value.trim(),
      kind: this.form.controls.kind.value,
      filename: file.name,
      content: file.content,
    };
    this.uploading.set(true);
    this.error.set(null);
    this.http.post<DocumentSummary>(`${this.apiBaseUrl}/documents`, body).subscribe({
      next: (document) => this.dialogRef.close(document),
      error: (error: unknown) => {
        this.uploading.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }
}

function errorMessage(error: unknown): string {
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return 'Could not upload the file. Try again.';
}
