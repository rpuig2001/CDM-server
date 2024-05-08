import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AirportModule } from './airport/airport.module';
import { PlaneModule } from './plane/plane.module';
import { SlotServiceModule } from './slotService/slotService.module';

@Module({
  imports: [DatabaseModule, AirportModule, PlaneModule, SlotServiceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
