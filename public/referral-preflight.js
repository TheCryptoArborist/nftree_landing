const signedClaims = new Map();

function cacheKey(referralCode, walletAddress) {
  return `${referralCode}:${String(walletAddress).toLowerCase()}`;
}

export function clearPreparedReferralClaim(referralCode, walletAddress) {
  signedClaims.delete(cacheKey(referralCode, walletAddress));
}

export async function prepareReferralClaim({ referralCode, walletAddress, requestChallenge, signClaim, now = Date.now() }) {
  if (!referralCode) return { claim: null, error: null };
  try {
    const key = cacheKey(referralCode, walletAddress);
    const cached = signedClaims.get(key);
    if (cached && Date.parse(cached.expiresAt) > now) return { claim: cached.claim, error: null, reused: true };
    signedClaims.delete(key);
    const challenge = await requestChallenge({
      action: "challenge",
      walletAddress,
      referralCode,
    });
    const signed = await signClaim(challenge.message);
    const claim = {
      challengeId: challenge.challengeId,
      signature: signed.signature,
      walletAddress,
      referralCode,
    };
    signedClaims.set(key, { claim, expiresAt: challenge.expiresAt });
    return {
      claim,
      error: null,
    };
  } catch (error) {
    return {
      claim: null,
      error: error instanceof Error ? error : new Error("Referral verification is unavailable."),
    };
  }
}
