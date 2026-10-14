import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { getHeapSnapshot } from 'v8';
import type { Response } from 'express';
import { AdminTokenGuard } from './admin-token.guard';
import { DocumentMetrics } from './document-metrics';
import { DocumentMetricsQueryDto } from './document-metrics-query.dto';
import { DocumentMetricsService } from './document-metrics.service';

/** How far back `GET /diagnostics/documents` looks when `since` is absent. */
const DEFAULT_METRICS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('diagnostics')
@UseGuards(AdminTokenGuard)
export class DiagnosticsController {
  constructor(private readonly documentMetrics: DocumentMetricsService) {}

  @Get('heap')
  takeHeapSnapshot(@Res() res: Response) {
    const filename = `heap-${Date.now()}.heapsnapshot`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const snapshot = getHeapSnapshot();
    snapshot.pipe(res);
  }

  @Get('documents')
  getDocumentMetrics(
    @Query() { since }: DocumentMetricsQueryDto,
  ): Promise<DocumentMetrics> {
    return this.documentMetrics.aggregate({
      since: since
        ? new Date(since)
        : new Date(Date.now() - DEFAULT_METRICS_WINDOW_MS),
    });
  }
}
