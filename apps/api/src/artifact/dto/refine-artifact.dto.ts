import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefineArtifactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  feedback: string;

  /**
   * DOCUMENT only: switch the refinement to this Design System's ACTIVE
   * version. Without it, the refinement keeps the Current Version's pin.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  designSystemId?: string;
}
