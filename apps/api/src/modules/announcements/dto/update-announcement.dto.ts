import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Edit a tip-drop schedule announcement (OB-034). Every field is optional;
 * only the supplied fields are changed. Cross-field validity is re-checked in
 * the service against the merged record.
 */
export class UpdateAnnouncementDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) title?: string;

  @IsOptional() @IsString() @MaxLength(500) message?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) timezone?: string;

  @IsOptional()
  @IsIn(['one_off', 'daily', 'weekly'])
  recurrence?: 'one_off' | 'daily' | 'weekly';

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'timeOfDay must be HH:MM (24h)',
  })
  timeOfDay?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional() @IsInt() @Min(0) @Max(6) weekday?: number;

  @IsOptional() @IsInt() @Min(1) @Max(1440) reminderMinutes?: number;
}
