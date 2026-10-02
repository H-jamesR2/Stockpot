export type ExpiryTone = 'expired' | 'soon' | 'later' | 'none';

export interface ExpiryLabel {
  text: string;
  tone: ExpiryTone;
}

/** Items within this many days are flagged as expiring soon. */
export const SOON_DAYS = 3;

export function expiryLabel(daysUntilExpiry: number | null): ExpiryLabel {
  if (daysUntilExpiry === null) return { text: 'No expiry', tone: 'none' };
  if (daysUntilExpiry < 0) {
    const days = -daysUntilExpiry;
    return { text: `Expired ${days} ${days === 1 ? 'day' : 'days'} ago`, tone: 'expired' };
  }
  if (daysUntilExpiry === 0) return { text: 'Expires today', tone: 'soon' };
  if (daysUntilExpiry === 1) return { text: 'Tomorrow', tone: 'soon' };
  return { text: `In ${daysUntilExpiry} days`, tone: daysUntilExpiry <= SOON_DAYS ? 'soon' : 'later' };
}
