/** ISO strings can use different UTC offsets and fractional precision. Compare instants. */
export function hasReadMessage(createdAt: string, lastReadAt: string | null | undefined): boolean {
  if (!lastReadAt) return false;
  return Date.parse(createdAt) <= Date.parse(lastReadAt);
}
