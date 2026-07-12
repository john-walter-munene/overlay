import { IsIn, IsNumber, IsString, Min } from 'class-validator';

export class CreatePickDto {
  @IsString()
  eventId!: string;

  @IsString()
  @IsIn(['1X2', 'moneyline', 'spread', 'totals'])
  market!: string;

  @IsString()
  selection!: string;

  @IsNumber()
  @Min(1.01)
  oddsAtPick!: number;

  @IsNumber()
  @Min(0.1)
  stakeUnits!: number;
}
