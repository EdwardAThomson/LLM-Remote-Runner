import { Module } from '@nestjs/common';
import { AdapterFactory, ApiAdapterFactory } from '../adapters';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [TasksController],
  providers: [
    AdapterFactory,
    ApiAdapterFactory,
    TasksRepository,
    WebhooksService,
    TasksService,
  ],
  exports: [TasksService],
})
export class TasksModule {}
