import { Controller, Get } from '@nestjs/common';
import { AdapterFactory, ApiAdapterFactory, ApiBackend } from '../adapters';
import { Public } from '../auth/public.decorator';

interface CliBackendHealth {
  backend: string;
  type: 'cli';
  available: boolean;
}

interface ApiBackendHealth {
  backend: ApiBackend;
  type: 'api';
  configured: boolean;
}

interface BackendsHealthResponse {
  cli: CliBackendHealth[];
  api: ApiBackendHealth[];
}

@Controller('health')
export class BackendsHealthController {
  constructor(
    private readonly adapterFactory: AdapterFactory,
    private readonly apiAdapterFactory: ApiAdapterFactory,
  ) {}

  @Public()
  @Get('backends')
  async getBackendsHealth(): Promise<BackendsHealthResponse> {
    // CLI backends: check binary availability using the shared adapter factory
    const cliAvailability = await this.adapterFactory.checkAvailability();

    const cli: CliBackendHealth[] = Array.from(cliAvailability.entries()).map(
      ([backend, available]) => ({
        backend,
        type: 'cli',
        available,
      }),
    );

    // API backends: treat "configured" (API key present) as availability
    const allApiBackends: ApiBackend[] = [
      'openai-api',
      'anthropic-api',
      'gemini-api',
    ];

    const api: ApiBackendHealth[] = allApiBackends.map((backend) => ({
      backend,
      type: 'api',
      configured: this.apiAdapterFactory.hasAdapter(backend),
    }));

    return { cli, api };
  }
}
