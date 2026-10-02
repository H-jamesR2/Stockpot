import { expiryLabel } from './expiry-label';

describe('expiryLabel', () => {
  it.each([
    [null, 'No expiry', 'none'],
    [-1, 'Expired 1 day ago', 'expired'],
    [-5, 'Expired 5 days ago', 'expired'],
    [0, 'Expires today', 'soon'],
    [1, 'Tomorrow', 'soon'],
    [3, 'In 3 days', 'soon'],
    [4, 'In 4 days', 'later'],
  ])('labels %s as "%s" (%s)', (days, text, tone) => {
    expect(expiryLabel(days)).toEqual({ text, tone });
  });
});
