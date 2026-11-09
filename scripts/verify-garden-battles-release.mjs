import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const APPROVED_REROLL_PACKAGE = '0x4a77289a2cd3d54c18f16a17cc7fe7b8890322e60e566df8683391d5a479f7ec';
export const APPROVED_REROLL_TREASURY = '0x6f1020c2fd6c91129f7cb5e0d651295e87f7245f96b7d090715c89b38197e77f';

export function verifyGardenBattlesBundle(bundle) {
  const target = bundle.match(/\bPACKAGE_ID:\s*["'](0x[a-f0-9]+)["']/)?.[1];
  if (target !== APPROVED_REROLL_PACKAGE) throw new Error('Release blocked: Garden Battles targets an unapproved reroll package. Rebuild the game; use the audited TREE Lock version-16 package.');
  if (!bundle.includes(APPROVED_REROLL_TREASURY) || !bundle.includes('Reroll blocked:')) throw new Error('Release blocked: TREE treasury recipient verification is missing.');
}

export async function verifyGardenBattlesRelease(root = fileURLToPath(new URL('../public/', import.meta.url))) {
  for (const entry of ['battle/index.html', 'battle/trials/index.html', 'battle/leaderboard/index.html']) {
    const html = await readFile(path.join(root, entry), 'utf8');
    const script = html.match(/<script[^>]+src="(\/battle\/assets\/index-[^"/]+\.js)"/)?.[1];
    if (!script) throw new Error(`Release blocked: missing Garden Battles script in ${entry}`);
    verifyGardenBattlesBundle(await readFile(path.join(root, script.slice(1)), 'utf8'));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyGardenBattlesRelease();
  console.log('Garden Battles release verified: approved reroll package and treasury payment guard.');
}
