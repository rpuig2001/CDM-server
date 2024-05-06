import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AirportModule } from './airport/airport.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [AirportModule, DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
