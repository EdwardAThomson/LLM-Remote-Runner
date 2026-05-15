import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { ApiTokensService } from './api-tokens.service';
import { CreateTokenDto } from './dto/create-token.dto';

/**
 * Token-management endpoints. Restricted to human (JWT) callers only — services
 * authenticated with an API token must NOT be able to mint or revoke tokens.
 * The strict JwtAuthGuard from `jwt-auth.guard.ts` only accepts the `jwt`
 * strategy, so API-token-authenticated requests are rejected here even though
 * the global guard would accept them elsewhere.
 */
@ApiTags('tokens')
@ApiBearerAuth('bearer')
@Controller('tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Post()
  @ApiOperation({
    summary: 'Mint an API token',
    description:
      'Creates a new `rrt_<id>_<secret>` token. The plaintext value is returned ONCE in this response — store it securely.',
  })
  async create(@Body() dto: CreateTokenDto) {
    return this.tokens.mint(dto.name);
  }

  @Get()
  @ApiOperation({
    summary: 'List API tokens',
    description: 'Lists active and revoked tokens. Secrets are never returned.',
  })
  list() {
    return { items: this.tokens.list() };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a token',
    description:
      'Marks the token as revoked. Subsequent requests using it will be rejected.',
  })
  revoke(@Param('id') id: string) {
    return this.tokens.revoke(id);
  }
}
