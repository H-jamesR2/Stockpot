import { splitCitations } from './citations';

describe('splitCitations', () => {
  it('splits text and citation groups in order', () => {
    expect(splitCitations('Simmer 2 hours [2]. Bake 1 hour [1][2]. Rest it [1, 3].')).toEqual([
      { text: 'Simmer 2 hours ' },
      { cites: [2] },
      { text: '. Bake 1 hour ' },
      { cites: [1] },
      { cites: [2] },
      { text: '. Rest it ' },
      { cites: [1, 3] },
      { text: '.' },
    ]);
  });

  it('returns plain text when there are no citations', () => {
    expect(splitCitations('No sources here.')).toEqual([{ text: 'No sources here.' }]);
  });
});
