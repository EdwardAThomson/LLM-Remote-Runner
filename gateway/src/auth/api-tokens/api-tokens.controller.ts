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
@Controller('tokens')
@UseGuards(JwtAuthGuard)
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Post()
  async create(@Body() dto: CreateTokenDto) {
    return this.tokens.mint(dto.name);
  }

  @Get()
  list() {
    return { items: this.tokens.list() };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id') id: string) {
    return this.tokens.revoke(id);
  }
}
