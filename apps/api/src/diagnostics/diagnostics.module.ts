import { Module } from '@nestjs/common';
import { DiagnosticsController } from './diagnostics.controller';
import { AdminTokenGuard } from './admin-token.guard';
import { DocumentMetricsService } from './document-metrics.service';

@Module({
  controllers: [DiagnosticsController],
  providers: [AdminTokenGuard, DocumentMetricsService],
  exports: [DocumentMetricsService],
})
export class DiagnosticsModule {}
