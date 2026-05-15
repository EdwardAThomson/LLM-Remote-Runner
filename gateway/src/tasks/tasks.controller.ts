import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TasksService } from './tasks.service';

// Auth is enforced by the global JwtAuthGuard (jwt OR api-token).
@ApiTags('tasks')
@ApiBearerAuth('bearer')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a task',
    description:
      'Starts a new task asynchronously. The response returns the initial task summary; subscribe to `GET /tasks/:id/stream` for live status and log events.',
  })
  async create(@Body() dto: CreateTaskDto) {
    const task = await this.tasksService.create(dto);
    return {
      task_id: task.id,
      task,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List tasks',
    description:
      'Returns the most recent tasks, paginated by cursor. Use the `next_cursor` from the response to fetch older pages.',
  })
  findAll(@Query() query: ListTasksQueryDto) {
    return this.tasksService.findAll({
      limit: query.limit,
      cursor: query.cursor,
      backend: query.backend,
      state: query.state,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get task detail',
    description: 'Returns the full task record including stored logs.',
  })
  findOne(@Param('id') id: string) {
    return this.tasksService.findDetailOrFail(id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a task',
    description: 'Requests cancellation of a queued or running task.',
  })
  async cancel(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.tasksService.cancelTask(
      id,
      reason?.trim() ? reason.trim() : 'Task canceled by user',
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a task',
    description:
      'Deletes a finished task and its logs. Refuses while the task is still queued or running.',
  })
  async remove(@Param('id') id: string) {
    await this.tasksService.deleteTaskById(id);
  }

  @Sse(':id/stream')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Stream task events (SSE)',
    description:
      'Server-Sent Events stream of `status`, `log`, `heartbeat`, and `done` events. If the task already finalized, replays the stored transcript and closes.',
  })
  @ApiOkResponse({
    description: 'text/event-stream of task events.',
    content: { 'text/event-stream': {} },
  })
  async stream(@Param('id') id: string) {
    const stream = await this.tasksService.streamTask(id);
    return stream;
  }
}
