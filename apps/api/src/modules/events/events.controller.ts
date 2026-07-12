import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/roles.guard';

class IngestDto {
  @IsString() sport!: string;
}

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('upcoming')
  upcoming() {
    return this.events.listUpcoming();
  }

  @Post('ingest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async ingest(@Body() dto: IngestDto) {
    const count = await this.events.ingest(dto.sport);
    return { ingested: count };
  }
}
