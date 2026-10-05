import { Module, OnModuleInit } from '@nestjs/common'
import consola from 'consola'
import { ElBotModule } from 'el-bot/nest'
import { BotsService } from './bots.service'
// import { ElModule } from './el/el.module'

@Module({
  imports: [
    // ElModule,
    ElBotModule.forRoot(),
  ],
  providers: [BotsService],
})
export class BotsModule implements OnModuleInit {
  onModuleInit(): void {
    consola.info('BotsModule initialized')
  }
}
