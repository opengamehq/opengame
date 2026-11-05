import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './package-web.mjs';

const action = process.argv[2];
if (!['check', 'deploy'].includes(action)) throw new Error('Expected check or deploy.');
if (!existsSync(join(root, 'dist/.opengame-swift-export'))) throw new Error('Run npm run build or npm run package:web first.');
// The creator installs the approved CLI separately; never resolve an unowned
// npm scope or silently submit/certify a release from a starter script.
const result = spawnSync(process.env.OPENGAME_BIN || 'opengame', [action, '.', '--json'], { cwd: root, stdio: 'inherit' });
if (result.error) throw new Error(`Install the approved OpenGame CLI and sign in first: ${result.error.message}`);
process.exit(result.status || (result.signal ? 1 : 0));
