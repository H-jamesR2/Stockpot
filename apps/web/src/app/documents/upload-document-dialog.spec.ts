import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { summary } from './test-data';
import { titleFromFilename, UploadDocumentDialog } from './upload-document-dialog';

describe('titleFromFilename', () => {
  it.each([
    ['knife-skills_notes.md', 'Knife skills notes'],
    ['braising.markdown', 'Braising'],
    ['food safety.txt', 'Food safety'],
  ])('turns %s into %s', (filename, title) => {
    expect(titleFromFilename(filename)).toBe(title);
  });
});

describe('UploadDocumentDialog', () => {
  let http: HttpTestingController;
  let close: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<UploadDocumentDialog>;
  let element: HTMLElement;

  beforeEach(async () => {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialogRef, useValue: { close } }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UploadDocumentDialog);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function choose(name: string, content: string) {
    const input = element.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File([content], name)], configurable: true });
    input.dispatchEvent(new Event('change'));
    // Reading the file is async.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const uploadButton = () => element.ownerDocument.querySelector<HTMLButtonElement>('button[form=upload-form]')!;
  const submit = () => element.querySelector('form')!.dispatchEvent(new Event('submit'));
  const titleInput = () => element.querySelector<HTMLInputElement>('input[formControlName=title]')!;

  it('suggests a title from the file name and uploads the file text', async () => {
    expect(uploadButton().disabled).toBe(true);
    await choose('knife-skills.md', '# Knife skills\n\nKeep it sharp.');
    expect(titleInput().value).toBe('Knife skills');
    expect(uploadButton().disabled).toBe(false);

    submit();
    const request = http.expectOne({ method: 'POST', url: '/api/documents' });
    expect(request.request.body).toEqual({
      title: 'Knife skills',
      kind: 'technique',
      filename: 'knife-skills.md',
      content: '# Knife skills\n\nKeep it sharp.',
    });
    const created = summary({ kind: 'technique', title: 'Knife skills', recipeSlug: null });
    request.flush(created);
    expect(close).toHaveBeenCalledWith(created);
  });

  it('keeps a title the user already typed', async () => {
    titleInput().value = 'My knife notes';
    titleInput().dispatchEvent(new Event('input'));
    await choose('knife-skills.md', 'Keep it sharp.');
    expect(titleInput().value).toBe('My knife notes');
  });

  it.each([
    ['notes.pdf', 'some text', 'Choose a .md, .markdown, or .txt file.'],
    ['empty.md', '  \n ', 'That file is empty.'],
    ['huge.txt', 'x'.repeat(200_001), 'That file is too long.'],
  ])('refuses %s before uploading', async (name, content, message) => {
    await choose(name, content);
    expect(element.querySelector('[role=alert]')?.textContent).toContain(message);
    expect(uploadButton().disabled).toBe(true);
    submit();
    http.expectNone('/api/documents');
  });

  it('shows the server message when the upload is refused', async () => {
    await choose('braising.md', 'Braise low and slow.');
    submit();
    http
      .expectOne('/api/documents')
      .flush(
        { statusCode: 409, error: 'Conflict', message: 'This file was already uploaded as "Braising"' },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('already uploaded as "Braising"');
    expect(close).not.toHaveBeenCalled();
    expect(uploadButton().disabled).toBe(false);
  });
});
