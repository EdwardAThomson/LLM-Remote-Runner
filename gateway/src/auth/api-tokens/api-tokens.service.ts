import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ApiTokensRepository, ApiTokenRecord } from './api-tokens.repository';

const TOKEN_PREFIX = 'rrt_';
const BCRYPT_ROUNDS = 12;

export interface ApiTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface MintedToken {
  summary: ApiTokenSummary;
  /** Plaintext token, returned ONCE on creation. */
  token: string;
}

export interface VerifiedTokenPrincipal {
  type: 'token';
  tokenId: string;
  name: string;
}

@Injectable()
export class ApiTokensService {
  private readonly logger = new Logger(ApiTokensService.name);

  constructor(private readonly repo: ApiTokensRepository) {}

  async mint(name: string): Promise<MintedToken> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Token name is required');
    }
    const id = randomBytes(8).toString('hex'); // 16-char lookup key
    const secret = randomBytes(32).toString('base64url');
    const plaintext = `${TOKEN_PREFIX}${id}_${secret}`;
    const tokenHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
    const createdAt = new Date().toISOString();

    this.repo.insert({
      id,
      name: trimmedName,
      tokenHash,
      createdAt,
    });

    return {
      token: plaintext,
      summary: {
        id,
        name: trimmedName,
        createdAt,
        lastUsedAt: null,
        revokedAt: null,
      },
    };
  }

  list(): ApiTokenSummary[] {
    return this.repo.listAll().map((row) => this.toSummary(row));
  }

  revoke(id: string): ApiTokenSummary {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Token ${id} not found`);
    }
    if (!existing.revokedAt) {
      this.repo.revoke(id, new Date().toISOString());
    }
    const updated = this.repo.findById(id);
    return this.toSummary(updated ?? existing);
  }

  /**
   * Verify a presented `rrt_<id>_<secret>` token. Returns the principal on
   * success, or null on any failure (unknown id, mismatched secret, revoked).
   */
  async verify(presented: string): Promise<VerifiedTokenPrincipal | null> {
    if (!presented.startsWith(TOKEN_PREFIX)) return null;
    const remainder = presented.slice(TOKEN_PREFIX.length);
    const separatorIndex = remainder.indexOf('_');
    if (separatorIndex <= 0) return null;
    const id = remainder.slice(0, separatorIndex);
    const secret = remainder.slice(separatorIndex + 1);
    if (!id || !secret) return null;

    const record = this.repo.findById(id);
    if (!record) return null;
    if (record.revokedAt) return null;

    let match = false;
    try {
      match = await bcrypt.compare(secret, record.tokenHash);
    } catch (err) {
      this.logger.warn(`bcrypt comparison failed: ${String(err)}`);
      return null;
    }
    if (!match) return null;

    this.repo.touchLastUsed(record.id, new Date().toISOString());
    return { type: 'token', tokenId: record.id, name: record.name };
  }

  private toSummary(record: ApiTokenRecord): ApiTokenSummary {
    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
    };
  }
}
