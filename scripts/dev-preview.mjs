import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const venvDir = path.join(backendDir, '.venv');
const venvPython = path.join(venvDir, 'bin', 'python');
const backendPort = process.env.BACKEND_PORT || '8001';
const extraViteArgs = process.argv.slice(2);

function ensureBackendVenv() {
  if (fs.existsSync(venvPython)) {
    const check = spawnSync(
      venvPython,
      ['-c', 'import fastapi, uvicorn, sqlalchemy, httpx, openpyxl, multipart'],
      {stdio: 'ignore'}
    );
    if (check.status === 0) {
      return venvPython;
    }
  }

  console.log('[dev-preview] Preparando ambiente Python do backend...');
  if (!fs.existsSync(venvPython)) {
    const venvRes = spawnSync('python3', ['-m', 'venv', '--without-pip', venvDir], {
      stdio: 'inherit',
    });
    if (venvRes.status !== 0) {
      console.error('[dev-preview] Falha ao criar .venv do backend.');
      return 'python3';
    }
  }

  const pipCheck = spawnSync(venvPython, ['-m', 'pip', '--version'], {stdio: 'ignore'});
  if (pipCheck.status !== 0) {
    const tmpPip = '/tmp/get-pip-preview.py';
    const dl = spawnSync(
      'curl',
      ['-fsSL', 'https://bootstrap.pypa.io/get-pip.py', '-o', tmpPip],
      {stdio: 'inherit'}
    );
    if (dl.status === 0) {
      spawnSync(venvPython, [tmpPip, '--quiet'], {stdio: 'inherit'});
      try {
        fs.unlinkSync(tmpPip);
      } catch {
        // ignore cleanup error
      }
    }
  }

  const installRes = spawnSync(
    venvPython,
    [
      '-m',
      'pip',
      'install',
      '--quiet',
      'fastapi',
      'uvicorn[standard]',
      'sqlalchemy',
      'alembic',
      'pydantic',
      'pydantic-settings',
      'python-dotenv',
      'psycopg[binary]',
      'openpyxl',
      'python-multipart',
      'httpx',
    ],
    {cwd: backendDir, stdio: 'inherit'}
  );

  if (installRes.status !== 0) {
    console.error('[dev-preview] Falha ao instalar dependências Python.');
  } else {
    console.log('[dev-preview] Ambiente Python do backend pronto.');
  }

  return venvPython;
}

const viteBin = path.join(rootDir, 'node_modules', '.bin', 'vite');
const viteArgs = extraViteArgs.length > 0 ? extraViteArgs : ['--port=3000', '--host=0.0.0.0'];

const viteProc = spawn(viteBin, viteArgs, {
  cwd: rootDir,
  env: {
    ...process.env,
    VITE_API_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
  },
  stdio: 'inherit',
});

let backendProc = null;
let stopping = false;

setImmediate(() => {
  if (stopping) return;
  const pythonExec = ensureBackendVenv();
  if (stopping) return;

  backendProc = spawn(
    pythonExec,
    ['-m', 'uvicorn', 'delivery_system.main:app', '--host', '127.0.0.1', '--port', backendPort],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        PYTHONPATH: path.join(backendDir, 'src'),
      },
      stdio: 'inherit',
    }
  );

  backendProc.on('exit', (code) => {
    if (!stopping && code !== 0 && code !== null) {
      console.error(`[dev-preview] FastAPI exited with code ${code}`);
    }
  });
});

function shutdown(signal) {
  stopping = true;
  if (backendProc) backendProc.kill(signal);
  viteProc.kill(signal);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

viteProc.on('exit', (code) => {
  stopping = true;
  if (backendProc) backendProc.kill('SIGTERM');
  process.exit(code ?? 0);
});
