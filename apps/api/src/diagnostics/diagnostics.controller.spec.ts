import { ValidationPipe, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminTokenGuard } from './admin-token.guard';
import { DiagnosticsController } from './diagnostics.controller';
import { DocumentMetricsService } from './document-metrics.service';

jest.mock(
  'src/database/schemas',
  () => ({ WorkflowRun: { name: 'WorkflowRun' } }),
  { virtual: true },
);

// Module wiring is under test (the guard on the route, the global pipe), so
// this builds a Nest app rather than constructing the controller by hand.
describe('DiagnosticsController', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const token = 'admin-secret';

  const makeApp = async () => {
    const metrics = { overall: { runs: 3 }, byDesignSystem: {} };
    const metricsService = { aggregate: jest.fn().mockResolvedValue(metrics) };
    const config = { get: jest.fn(() => token) };
    const moduleRef = await Test.createTestingModule({
      controllers: [DiagnosticsController],
      providers: [
        AdminTokenGuard,
        { provide: ConfigService, useValue: config },
        { provide: DocumentMetricsService, useValue: metricsService },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    return { app, mocks: { metricsService, config }, fixtures: { metrics } };
  };

  let app: INestApplication;
  let mocks: Awaited<ReturnType<typeof makeApp>>['mocks'];
  let fixtures: Awaited<ReturnType<typeof makeApp>>['fixtures'];

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(now);
    ({ app, mocks, fixtures } = await makeApp());
  });

  afterEach(async () => {
    await app.close();
    jest.useRealTimers();
  });

  describe('GET /diagnostics/documents', () => {
    it('should respond 401 when the diagnostics token is missing', async () => {
      await request(app.getHttpServer())
        .get('/diagnostics/documents')
        .expect(401);

      expect(mocks.metricsService.aggregate).not.toHaveBeenCalled();
    });

    it('should respond 401 when the diagnostics token is wrong', async () => {
      await request(app.getHttpServer())
        .get('/diagnostics/documents')
        .set('x-diag-token', 'nope')
        .expect(401);

      expect(mocks.metricsService.aggregate).not.toHaveBeenCalled();
    });

    it('should respond 401 when diagnostics are disabled', async () => {
      mocks.config.get.mockReturnValue(undefined as never);

      await request(app.getHttpServer())
        .get('/diagnostics/documents')
        .set('x-diag-token', token)
        .expect(401);
    });

    it('should return the metrics since the given date when the token is valid', async () => {
      const res = await request(app.getHttpServer())
        .get('/diagnostics/documents?since=2026-10-01T00:00:00Z')
        .set('x-diag-token', token)
        .expect(200);

      expect(res.body).toEqual(fixtures.metrics);
      expect(mocks.metricsService.aggregate).toHaveBeenCalledWith({
        since: new Date('2026-10-01T00:00:00Z'),
      });
    });

    it('should default to the last 7 days when since is absent', async () => {
      await request(app.getHttpServer())
        .get('/diagnostics/documents')
        .set('x-diag-token', token)
        .expect(200);

      expect(mocks.metricsService.aggregate).toHaveBeenCalledWith({
        since: new Date('2026-10-07T12:00:00Z'),
      });
    });

    it.each(['garbage', '2026-13-45', '12345'])(
      'should respond 400 when since is %s',
      async (since) => {
        await request(app.getHttpServer())
          .get(`/diagnostics/documents?since=${since}`)
          .set('x-diag-token', token)
          .expect(400);

        expect(mocks.metricsService.aggregate).not.toHaveBeenCalled();
      },
    );
  });
});
