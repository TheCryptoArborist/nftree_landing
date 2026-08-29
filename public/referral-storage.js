export const REFERRAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const ALLOWED_REFERRAL_CODE = "mischief-finance";

export function clearStoredReferral(storage = window.localStorage, documentObject = document) {
  try {
    storage.removeItem("nftreeReferral");
  } catch {}
  documentObject.cookie = "nftreeReferral=; path=/; max-age=0; SameSite=Lax";
}

export function readStoredReferral(
  storage = window.localStorage,
  documentObject = document,
  now = Date.now(),
) {
  try {
    const payload = JSON.parse(storage.getItem("nftreeReferral") || "{}");
    const savedAt = Date.parse(payload.savedAt);
    const invalid =
      payload.code !== ALLOWED_REFERRAL_CODE ||
      typeof payload.savedAt !== "string" ||
      !Number.isFinite(savedAt) ||
      savedAt > now ||
      now - savedAt >= REFERRAL_MAX_AGE_MS;

    if (invalid) {
      clearStoredReferral(storage, documentObject);
      return null;
    }
    return { code: ALLOWED_REFERRAL_CODE, name: "Mischief Finance" };
  } catch {
    clearStoredReferral(storage, documentObject);
    return null;
  }
}
