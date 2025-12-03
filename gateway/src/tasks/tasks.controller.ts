import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
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
  findAll() {
    return this.tasksService.findAll();
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

  @Sse(':id/stream')
  @SkipThrottle()
  async stream(@Param('id') id: string) {
    const stream = await this.tasksService.streamTask(id);
    return stream;
  }
}
