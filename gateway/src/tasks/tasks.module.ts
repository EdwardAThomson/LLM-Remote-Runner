import { Module } from '@nestjs/common';
import { AdapterFactory, ApiAdapterFactory } from '../adapters';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [AdapterFactory, ApiAdapterFactory, TasksService],
  exports: [TasksService],
})
export class TasksModule {}
