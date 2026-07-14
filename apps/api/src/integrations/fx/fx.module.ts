import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';

/** Currency conversion for checkout (OB-06x). */
@Module({
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class FxModule {}
