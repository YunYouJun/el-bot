import { Module } from '@nestjs/common'
import { BotsModule } from './bots/bots.module'
import { CoreModule } from './core/core.module'

@Module({
  imports: [BotsModule, CoreModule],
})
export class AppModule {}
