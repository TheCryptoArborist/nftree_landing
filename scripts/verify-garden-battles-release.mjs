import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const APPROVED_REROLL_PACKAGE = '0x053f4cf0bd41ba3340a0580f4ae1aaca18656ba0032eb3e920de554309d97755';
export const APPROVED_REROLL_TREASURY = '0x6f1020c2fd6c91129f7cb5e0d651295e87f7245f96b7d090715c89b38197e77f';

export function verifyGardenBattlesBundle(bundle) {
  const target = bundle.match(/\bPACKAGE_ID:\s*["'](0x[a-f0-9]+)["']/)?.[1];
  if (target !== APPROVED_REROLL_PACKAGE) throw new Error('Release blocked: Garden Battles targets an unapproved reroll package. Rebuild the game; do not restore a version-14 bundle.');
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
