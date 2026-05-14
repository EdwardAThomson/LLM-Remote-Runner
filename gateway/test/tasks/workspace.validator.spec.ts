import { BadRequestException } from '@nestjs/common';
import { mkdtemp, mkdir, realpath, rm, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveAllowedCwd } from '../../src/tasks/workspace.validator';

describe('resolveAllowedCwd', () => {
  let root: string;
  let defaultWorkspace: string;
  let extraAllowed: string;
  let outside: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'lrr-ws-')));
    defaultWorkspace = join(root, 'default');
    extraAllowed = join(root, 'extra');
    outside = join(root, 'outside');
    await mkdir(defaultWorkspace);
    await mkdir(extraAllowed);
    await mkdir(outside);
    await mkdir(join(defaultWorkspace, 'sub'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('falls back to DEFAULT_WORKSPACE when no cwd is provided', async () => {
    const resolved = await resolveAllowedCwd(undefined, {
      defaultWorkspace,
      allowedWorkspaces: [],
    });
    expect(resolved).toBe(defaultWorkspace);
  });

  it('treats whitespace-only cwd as not provided', async () => {
    const resolved = await resolveAllowedCwd('   ', {
      defaultWorkspace,
      allowedWorkspaces: [],
    });
    expect(resolved).toBe(defaultWorkspace);
  });

  it('accepts a subdirectory of the default workspace', async () => {
    const sub = join(defaultWorkspace, 'sub');
    const resolved = await resolveAllowedCwd(sub, {
      defaultWorkspace,
      allowedWorkspaces: [],
    });
    expect(resolved).toBe(sub);
  });

  it('accepts a path in the additional allowlist', async () => {
    const resolved = await resolveAllowedCwd(extraAllowed, {
      defaultWorkspace,
      allowedWorkspaces: [extraAllowed],
    });
    expect(resolved).toBe(extraAllowed);
  });

  it('rejects a path outside the allowlist', async () => {
    await expect(
      resolveAllowedCwd(outside, {
        defaultWorkspace,
        allowedWorkspaces: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects symlinks that escape the allowlist', async () => {
    const escape = join(defaultWorkspace, 'escape');
    await symlink(outside, escape);

    await expect(
      resolveAllowedCwd(escape, {
        defaultWorkspace,
        allowedWorkspaces: [],
      }),
    ).rejects.toThrow(/not in the allowlist/);
  });

  it('rejects a nonexistent path with a clear error', async () => {
    const missing = join(defaultWorkspace, 'does-not-exist');
    await expect(
      resolveAllowedCwd(missing, {
        defaultWorkspace,
        allowedWorkspaces: [],
      }),
    ).rejects.toThrow(/does not exist|not accessible/);
  });

  it('rejects a traversal attempt that resolves outside the allowlist', async () => {
    const traversal = join(defaultWorkspace, '..', 'outside');
    await expect(
      resolveAllowedCwd(traversal, {
        defaultWorkspace,
        allowedWorkspaces: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('errors clearly when neither cwd nor DEFAULT_WORKSPACE is set', async () => {
    await expect(
      resolveAllowedCwd(undefined, {
        defaultWorkspace: '',
        allowedWorkspaces: [],
      }),
    ).rejects.toThrow(/No workspace configured/);
  });
});
