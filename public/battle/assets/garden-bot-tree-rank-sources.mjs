/**
 * Garden Bot verified TREE source presentation (read-only).
 * Shared by the embedded NFTree test bundle and source-state tests.
 *
 * The backend's current sources are SuiDex V2, SuiDex V3 and TREE Lock.
 * Retired Moonbags must not be presented as a permanently pending balance.
 */
export const TREE_RANK_SOURCES = Object.freeze([
  { id: "suidex-v2", label: "V2 LP" },
  { id: "suidex-v3", label: "V3 LP" },
  { id: "tree-lock", label: "TREE Lock" },
]);

/**
 * No data is NEVER interpreted as a verified zero. Values are only displayed
 * when explicitly provided by the eligibility API.
 *
 * @param {{status?:string,underlyingTreeDisplay?:string}|null|undefined} source
 * @param {string} eligibilityStatus
 * @returns {{status:string,value:string}}
 */
export function formatTreeRankSource(source, eligibilityStatus = "checking") {
  if (!source) {
    if (eligibilityStatus === "checking") {
      return { status: "checking", value: "Checking…" };
    }
    if (eligibilityStatus === "unavailable") {
      return { status: "unavailable", value: "Unavailable" };
    }
    return { status: "not-reported", value: "Not reported" };
  }
  if (source.status === "verified-zero") {
    return { status: "verified-zero", value: "0 TREE" };
  }
  if (source.status === "unavailable") {
    return { status: "unavailable", value: "Unavailable" };
  }
  if (source.status === "qualified-data") {
    const amount = source.underlyingTreeDisplay;
    return {
      status: "qualified-data",
      value: typeof amount === "string" && amount.trim() !== ""
        ? amount.trim() + " TREE"
        : "Verified (amount unavailable)",
    };
  }
  return { status: "not-reported", value: "Not reported" };
}
