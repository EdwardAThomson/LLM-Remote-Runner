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
import { SkipThrottle } from '@nestjs/throttler';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TasksService } from './tasks.service';

// Auth is enforced by the global JwtAuthGuard (jwt OR api-token).
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async create(@Body() dto: CreateTaskDto) {
    const task = await this.tasksService.create(dto);
    return {
      task_id: task.id,
      task,
    };
  }

  @Get()
  findAll(@Query() query: ListTasksQueryDto) {
    return this.tasksService.findAll({
      limit: query.limit,
      cursor: query.cursor,
      backend: query.backend,
      state: query.state,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findDetailOrFail(id);
  }

  @Post(':id/cancel')
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
  async remove(@Param('id') id: string) {
    await this.tasksService.deleteTaskById(id);
  }

  @Sse(':id/stream')
  @SkipThrottle()
  async stream(@Param('id') id: string) {
    const stream = await this.tasksService.streamTask(id);
    return stream;
  }
}
