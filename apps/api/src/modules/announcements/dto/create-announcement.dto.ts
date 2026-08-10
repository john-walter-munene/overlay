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
 * Create a tip-drop schedule announcement (OB-034). Cross-field rules
 * (`date` required for one-off, `weekday` for weekly, timezone validity) are
 * enforced in the service so the error copy is precise.
 */
export class CreateAnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(120) title!: string;

  @IsOptional() @IsString() @MaxLength(500) message?: string;

  /** IANA timezone, e.g. "Africa/Nairobi". Validated in the service. */
  @IsString() @MinLength(1) @MaxLength(64) timezone!: string;

  @IsIn(['one_off', 'daily', 'weekly']) recurrence!:
    | 'one_off'
    | 'daily'
    | 'weekly';

  /** Wall-clock time of day in `timezone`, as "HH:MM" (24h). */
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'timeOfDay must be HH:MM (24h)',
  })
  timeOfDay!: string;

  /** Required for `one_off`: the calendar day of the drop, `YYYY-MM-DD`. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  /** Required for `weekly`: 0 = Sunday … 6 = Saturday. */
  @IsOptional() @IsInt() @Min(0) @Max(6) weekday?: number;

  /** Optional pre-drop reminder lead time in minutes. */
  @IsOptional() @IsInt() @Min(1) @Max(1440) reminderMinutes?: number;
}
