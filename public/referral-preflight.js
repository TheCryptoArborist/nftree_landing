export async function prepareReferralClaim({ referralCode, walletAddress, requestChallenge, signClaim }) {
  if (!referralCode) return { claim: null, error: null };
  try {
    const challenge = await requestChallenge({
      action: "challenge",
      walletAddress,
      referralCode,
    });
    const signed = await signClaim(challenge.message);
    return {
      claim: {
        challengeId: challenge.challengeId,
        signature: signed.signature,
        walletAddress,
        referralCode,
      },
      error: null,
    };
  } catch (error) {
    return {
      claim: null,
      error: error instanceof Error ? error : new Error("Referral verification is unavailable."),
    };
  }
}
