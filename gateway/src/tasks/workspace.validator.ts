import { BadRequestException } from '@nestjs/common';
import { realpath } from 'fs/promises';
import { resolve, sep } from 'path';

export interface WorkspaceValidatorOptions {
  /** The configured DEFAULT_WORKSPACE (always allowed). */
  defaultWorkspace: string;
  /** Additional allowlist entries from ALLOWED_WORKSPACES. */
  allowedWorkspaces: string[];
}

/**
 * Resolve a requested cwd to an absolute, canonical path and confirm it falls
 * under the allowlist. The default workspace is always allowed; additional
 * roots come from ALLOWED_WORKSPACES.
 *
 * Throws BadRequestException if the path can't be resolved or escapes the
 * allowlist. Returns the canonical absolute path on success.
 */
export async function resolveAllowedCwd(
  requested: string | null | undefined,
  options: WorkspaceValidatorOptions,
): Promise<string> {
  const trimmed = typeof requested === 'string' ? requested.trim() : '';
  const target = trimmed.length > 0 ? trimmed : options.defaultWorkspace;

  if (!target) {
    throw new BadRequestException(
      'No workspace configured: provide cwd or set DEFAULT_WORKSPACE',
    );
  }

  const absoluteTarget = resolve(target);

  const allowlistAbsolute = [
    resolve(options.defaultWorkspace),
    ...options.allowedWorkspaces.map((entry) => resolve(entry)),
  ];

  let canonicalTarget: string;
  try {
    canonicalTarget = await realpath(absoluteTarget);
  } catch (error) {
    throw new BadRequestException(
      `Workspace path does not exist or is not accessible: ${absoluteTarget}`,
    );
  }

  for (const allowed of allowlistAbsolute) {
    let canonicalAllowed: string;
    try {
      canonicalAllowed = await realpath(allowed);
    } catch {
      // Skip allowlist entries that don't exist on disk. We still let other
      // entries match; if none do we fall through to the rejection below.
      continue;
    }

    if (isWithin(canonicalTarget, canonicalAllowed)) {
      return canonicalTarget;
    }
  }

  throw new BadRequestException(
    `Workspace path is not in the allowlist: ${absoluteTarget}. ` +
      `Allowed roots: ${allowlistAbsolute.join(', ')}`,
  );
}

function isWithin(candidate: string, root: string): boolean {
  if (candidate === root) {
    return true;
  }
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return candidate.startsWith(rootWithSep);
}
