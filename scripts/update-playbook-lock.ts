import {
  currentPlaybookLock,
  playbookLockFile,
  playbookPath,
} from '../src/playbook/playbook';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const lock = currentPlaybookLock();
writeFileSync(
  join(playbookPath, playbookLockFile),
  `${JSON.stringify(lock, null, 2)}\n`,
);
console.log(`Playbook lock: version ${lock.version}, hash ${lock.hash}`);
