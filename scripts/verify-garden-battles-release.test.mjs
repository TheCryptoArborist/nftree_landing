import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGardenBattlesBundle, APPROVED_REROLL_PACKAGE, APPROVED_REROLL_TREASURY } from './verify-garden-battles-release.mjs';
const correct = `PACKAGE_ID:"${APPROVED_REROLL_PACKAGE}";treasury:"${APPROVED_REROLL_TREASURY}";"Reroll blocked:"`;
test('release accepts the pinned treasury-routing bundle', () => assert.doesNotThrow(() => verifyGardenBattlesBundle(correct)));
test('release rejects version 14 even if another reference names version 16', () => {
  assert.throws(() => verifyGardenBattlesBundle(correct.replace(APPROVED_REROLL_PACKAGE, '0x7b826b0cf7f8de12390351caf5294ffbd6a06579591cd7fb3f10c3796452baab') + APPROVED_REROLL_PACKAGE), /unapproved reroll package/);
});
test('release rejects a missing or incorrect treasury guard', () => {
  assert.throws(() => verifyGardenBattlesBundle(correct.replace(APPROVED_REROLL_TREASURY, '0x0')), /verification is missing/);
  assert.throws(() => verifyGardenBattlesBundle(correct.replace('Reroll blocked:', '')), /verification is missing/);
});

test("release rejects the old version-15 package without TREE Lock proof support", () => {
  assert.throws(() => verifyGardenBattlesBundle(correct.replace(APPROVED_REROLL_PACKAGE, "0x053f4cf0bd41ba3340a0580f4ae1aaca18656ba0032eb3e920de554309d97755")), /unapproved reroll package/);
});
