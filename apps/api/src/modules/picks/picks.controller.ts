import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PicksService } from './picks.service';
import { CreatePickDto } from './dto/create-pick.dto';

// NOTE: auth guard + resolving the tipster from the session lands in Phase 0.
// For now the tipsterId is a placeholder until auth is wired.
@Controller('picks')
export class PicksController {
  constructor(private readonly picks: PicksService) {}

  @Post()
  create(@Body() dto: CreatePickDto) {
    const tipsterId = 'placeholder-tipster';
    return this.picks.createLockedPick(tipsterId, dto);
  }

  @Get('tipster/:tipsterId')
  listByTipster(@Param('tipsterId') tipsterId: string) {
    return this.picks.listByTipster(tipsterId);
  }
}
