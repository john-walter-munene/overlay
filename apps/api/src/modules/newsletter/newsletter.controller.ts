import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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
 * Public newsletter signup with double opt-in (OB-157). Anyone can subscribe;
 * the address is stored as `pending` and a confirmation email is sent. The
 * confirm and unsubscribe endpoints are token-authenticated and exposed over
 * both GET (email clients open the link) and POST (RFC 8058 one-click).
 */
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Post()
  @Throttle(writeThrottle())
  subscribe(@Body() dto: SubscribeDto) {
    return this.newsletter.subscribe(dto.email);
  }

  // Double opt-in confirmation. The token in the emailed link maps to one row.
  @Get('confirm')
  confirmGet(@Query('token') token = '') {
    return this.newsletter.confirm(token);
  }

  @Post('confirm')
  confirmPost(
    @Query('token') queryToken = '',
    @Body() body: { token?: string } = {},
  ) {
    return this.newsletter.confirm(body.token ?? queryToken);
  }

  // One-click unsubscribe (CAN-SPAM/GDPR). Public; the token authenticates it.
  @Get('unsubscribe')
  unsubscribeGet(@Query('token') token = '') {
    return this.newsletter.unsubscribe(token);
  }

  @Post('unsubscribe')
  unsubscribePost(
    @Query('token') queryToken = '',
    @Body() body: { token?: string } = {},
  ) {
    return this.newsletter.unsubscribe(body.token ?? queryToken);
  }
}
