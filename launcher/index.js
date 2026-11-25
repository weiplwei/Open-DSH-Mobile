import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'open-dsh-mobile-metro';

export function apply(ctx, config = {}) {
  const packageDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = process.env.OPEN_DSH_MOBILE_DIR || config.projectDir || path.resolve(packageDir, '..');
  const port = Number(config.port) || 8081;
  let child = null;
  let disposed = false;
  let restartTimer = null;

  const stop = () => {
    disposed = true;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    const running = child;
    child = null;
    if (!running?.pid) return;
    if (process.platform === 'win32') {
      // npx starts a small process tree on Windows; kill the whole tree, not only cmd.exe.
      spawnSync('taskkill', ['/pid', String(running.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      try { process.kill(-running.pid, 'SIGTERM'); } catch { /* already exited */ }
    }
  };

  const start = () => {
    if (disposed || child) return;
    mkdirSync(packageDir, { recursive: true });
    const logPath = path.join(packageDir, 'metro.log');
    const fd = openSync(logPath, 'a');
    const args = ['expo', 'start', '--lan', '--port', String(port), '--clear', '--go'];
    try {
      child = process.platform === 'win32'
        ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['npx', ...args].join(' ')], {
            cwd: projectDir,
            env: { ...process.env, CI: '1' },
            stdio: ['ignore', fd, fd],
            windowsHide: true,
          })
        : spawn('npx', args, {
            cwd: projectDir,
            env: { ...process.env, CI: '1' },
            stdio: ['ignore', fd, fd],
            detached: true,
          });
      child.once('error', (error) => ctx.logger?.warn?.(`Open DSH Metro failed: ${error.message}`));
      child.once('exit', (code) => {
        child = null;
        if (!disposed) {
          ctx.logger?.warn?.(`Open DSH Metro exited (${code ?? 'unknown'}); restarting in 3 seconds`);
          restartTimer = setTimeout(start, 3000);
        }
      });
      ctx.logger?.info?.(`Open DSH Metro started on LAN port ${port}`);
    } finally {
      closeSync(fd);
    }
  };

  ctx.effect(() => {
    disposed = false;
    start();
    process.once('exit', stop);
    return () => {
      process.removeListener('exit', stop);
      stop();
    };
  });
}
