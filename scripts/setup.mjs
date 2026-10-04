// Fetch the pinned polyrl checkout into vendor/polyrl and check the game files
// it vendors against the hashes of the live 0.6.3 client.
// autocrlf is forced off: CRLF conversion on Windows changes the worker bundle.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const COMMIT = '8e523df05e3667a6ffdad3b03ab6c8ea3969ea0f';
const HASHES = {
  'simulation_worker.bundle.js': 'f9b0d88dd006e75d3dce7306487ed1db7f21ac252263d77fed50b10cbf5a90f2',
  'lib/polytrack_physics.js': '42815d83ab6929d7eafd7e98835905f40e147e031fc5f87dfb90c35f002df54a',
  'polytrack_physics.wasm': 'd4ef02676973d41afc34b23b5248f6950b35dc4cc7e3047e3a9c6bd88e4c180e',
};
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (!existsSync('vendor/polyrl/.git')) run('git clone -c core.autocrlf=false https://github.com/roowus/polyrl vendor/polyrl');
run(`git -C vendor/polyrl -c core.autocrlf=false checkout -q ${COMMIT}`);

let ok = true;
for (const [file, want] of Object.entries(HASHES)) {
  const got = createHash('sha256').update(readFileSync(`vendor/polyrl/node/vendor/${file}`)).digest('hex');
  console.log(`${got === want ? 'ok  ' : 'BAD '} ${file}`);
  ok &&= got === want;
}
process.exit(ok ? 0 : 1);
