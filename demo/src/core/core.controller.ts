import { Controller, Get } from '@nestjs/common'

@Controller('')
export class CoreController {
  @Get()
  index(): string {
    return 'Hello, Demo Bot!'
  }
}
