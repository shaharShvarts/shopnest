// customerAccountId must come from the verified customer session resolver.
// The legacy user_id cookie is client supplied and is not authentication.
export function paymentOwnerKey(identity: {
  customerAccountId: number | null;
  userId: number | null;
  sessionId: string | null;
}): string | null {
  if (identity.customerAccountId) return `customer:${identity.customerAccountId}`;
  if (identity.userId) return null;
  return identity.sessionId ? `session:${identity.sessionId}` : null;
}
