import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_MARKETS } from '@overlay/shared';

export class CreatePickDto {
  @IsString()
  @MaxLength(64)
  eventId!: string;

  @IsString()
  @IsIn([...SUPPORTED_MARKETS])
  market!: string;

  @IsString()
  @MaxLength(160)
  selection!: string;

  @IsNumber()
  @Min(1.01)
  oddsAtPick!: number;

  @IsNumber()
  @Min(0.1)
  stakeUnits!: number;

  /** Optional public context / reasoning shown to subscribers. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
