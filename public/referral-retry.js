export const MAX_REFERRAL_RETRIES = 5;
export const REFERRAL_RETRY_BASE_MS = 500;

export class ReferralRequestError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ReferralRequestError";
    this.status = status;
    this.transient = status === 0 || [408, 425, 429].includes(status) || status >= 500;
  }
}

export function nextPendingClaim(claim, now = Date.now()) {
  const retryCount = Number(claim.retryCount || 0) + 1;
  if (retryCount > MAX_REFERRAL_RETRIES) return null;
  return { ...claim, retryCount, nextAttemptAt: now + REFERRAL_RETRY_BASE_MS * (2 ** (retryCount - 1)) };
}

export function shouldRetryReferral(error) {
  return Boolean(error?.transient);
}
