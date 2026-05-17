import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

// Auth handled by the global JwtAuthGuard (JWT or API token).
@ApiTags('conversations')
@ApiBearerAuth('bearer')
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a conversation',
    description:
      'Creates an empty conversation. Title is optional (auto-derived from the first user message if omitted).',
  })
  create(@Body() dto: CreateConversationDto) {
    return this.conversationsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List conversations',
    description:
      'Most recently updated first. Cursor-paginated via `next_cursor`.',
  })
  list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.conversationsService.list({ limit: parsedLimit, cursor });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a conversation with its full transcript',
  })
  findOne(@Param('id') id: string) {
    return this.conversationsService.findDetailOrFail(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a conversation',
    description: 'Rename the conversation or change its system prompt. Pass null to clear a field.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a conversation and all its messages',
  })
  remove(@Param('id') id: string) {
    this.conversationsService.delete(id);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Send a user message and kick off the assistant turn',
    description:
      'Appends a user message, creates a task with the full transcript (including the conversation\'s system prompt), and returns `{ message_id, task_id }`. The assistant message is written automatically when the task finalizes — stream it via `GET /api/tasks/:task_id/stream` to watch the response live.',
  })
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(id, dto);
  }
}
