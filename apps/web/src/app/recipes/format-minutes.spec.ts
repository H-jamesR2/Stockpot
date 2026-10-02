import { formatMinutes } from './format-minutes';

describe('formatMinutes', () => {
  it.each([
    [null, null],
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [200, '3 h 20 min'],
  ])('formats %s as %s', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});
