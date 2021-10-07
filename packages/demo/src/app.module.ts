import { Module } from "@nestjs/common";
import { BotsModule } from "./bots/bots.module";

@Module({
  imports: [BotsModule],
})
export class AppModule {}
