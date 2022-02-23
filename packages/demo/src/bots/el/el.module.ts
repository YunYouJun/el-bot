
import { Module } from '@nestjs/common'
import { ElService } from './el.service'

@Module({
  providers: [ElService],
})
export class ElModule {}
