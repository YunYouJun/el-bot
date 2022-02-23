import { Module } from '@nestjs/common'
import { CoreController } from './core.controller'

@Module({
  controllers: [CoreController],
})
export class CoreModule {}
