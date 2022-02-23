import { Module } from '@nestjs/common'
import { BotsService } from './bots.service'
// import { ElModule } from './el/el.module'
import { KoishiModule } from './koishi/koishi.module'

@Module({
  imports: [
    // ElModule,
    KoishiModule,
  ],
  providers: [BotsService],
})
export class BotsModule {}
