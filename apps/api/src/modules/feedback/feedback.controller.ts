import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FeedbackService } from './feedback.service';
import { writeThrottle } from '../../common/throttling';

class CreateFeedbackDto {
  @IsIn(['suggestion', 'bug', 'question', 'fees', 'complaint', 'other'])
  category!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
}

/**
 * Public support-center endpoint: anyone (signed in or not) can send feedback,
 * a question, a bug report or a fees query. Rate-limited by the global
 * throttler to deter abuse.
 */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @Throttle(writeThrottle())
  create(@Body() dto: CreateFeedbackDto) {
    return this.feedback.create(dto.category, dto.message, dto.email);
  }
}
