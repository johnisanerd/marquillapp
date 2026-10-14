import { IsISO8601, IsOptional } from 'class-validator';

export class DocumentMetricsQueryDto {
  /** An ISO 8601 date or date-time. Defaults to the last 7 days. */
  @IsOptional()
  @IsISO8601({ strict: true })
  since?: string;
}
