
import { Module } from '@nestjs/common'
import { KoishiService } from './koishi.service'

@Module({
  providers: [KoishiService],
})
export class KoishiModule {}
