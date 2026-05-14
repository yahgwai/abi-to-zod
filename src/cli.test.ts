import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from './codegen.js';
import { type Abi } from './abi.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(repoRoot, 'dist', 'cli.js');
const fixturePath = join(repoRoot, 'test', 'fixtures', 'erc', 'ERC20.json');

const tmpDirs: string[] = [];

beforeAll(() => {
  // Ensure CLI is built before any test runs. Vitest sets cwd to repo root.
  spawnSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
});

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

function makeTmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'abi-to-zod-cli-'));
  tmpDirs.push(d);
  return d;
}

describe('cli', () => {
  it('stdout matches programmatic generate when no output path given', () => {
    const abi = JSON.parse(readFileSync(fixturePath, 'utf8')) as Abi;
    const expected = generate(abi, basename(fixturePath));

    const res = spawnSync(process.execPath, [cliPath, fixturePath], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toBe(expected);
  });

  it('writes to output file when given', () => {
    const abi = JSON.parse(readFileSync(fixturePath, 'utf8')) as Abi;
    const expected = generate(abi, basename(fixturePath));

    const out = join(makeTmpDir(), 'out.ts');
    const res = spawnSync(process.execPath, [cliPath, fixturePath, out], { encoding: 'utf8' });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('');
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf8')).toBe(expected);
  });

  it('exits non-zero with usage message when no input provided', () => {
    const res = spawnSync(process.execPath, [cliPath], { encoding: 'utf8' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Usage:/);
  });
});
