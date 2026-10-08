// Starts the mock API and `ng serve` together, and stops both when either exits.
import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['demo-api/server.mjs'], { stdio: 'inherit' }),
  spawn('npx', ['ng', 'serve', '--port', '4200'], { stdio: 'inherit' }),
];

const stop = (code = 0) => {
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exit(code);
};
for (const c of children) c.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
