import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_MARKETS, type PickType } from '@overlay/shared';

export class CreatePickDto {
  @IsString()
  eventId!: string;

  @IsString()
  @IsIn([...SUPPORTED_MARKETS])
  market!: string;

  @IsString()
  selection!: string;

  @IsNumber()
  @Min(1.01)
  oddsAtPick!: number;

  @IsNumber()
  @Min(0.1)
  stakeUnits!: number;

  /**
   * Pre-match (default) or live/in-play (OB-039). Live picks are placed after
   * kickoff, bypass the pre-match cutoff, and are excluded from CLV.
   */
  @IsOptional()
  @IsIn(['pre_match', 'live'])
  pickType?: PickType;

  /** Optional public context / reasoning shown to subscribers. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
