import { Module } from '@nestjs/common';
import { AdapterFactory, ApiAdapterFactory } from '../adapters';
import { BackendsHealthController } from './backends-health.controller';

@Module({
  controllers: [BackendsHealthController],
  providers: [AdapterFactory, ApiAdapterFactory],
})
export class ObservabilityModule {}
