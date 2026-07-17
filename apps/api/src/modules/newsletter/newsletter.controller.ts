import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, MaxLength } from 'class-validator';
import { NewsletterService } from './newsletter.service';
import { writeThrottle } from '../../common/throttling';

class SubscribeDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

/**
 * Public newsletter signup (OB-072). Anyone (signed in or not) can subscribe
 * with an email; the address is stored and a confirmation email is sent.
 * Rate-limited by the write throttler to deter abuse.
 */
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Post()
  @Throttle(writeThrottle())
  subscribe(@Body() dto: SubscribeDto) {
    return this.newsletter.subscribe(dto.email);
  }
}
