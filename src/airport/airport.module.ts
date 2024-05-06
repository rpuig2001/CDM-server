import { Module } from '@nestjs/common';
import { AirportController } from './airport.controller';
import { AirportService } from './airport.service';
import { AirportProviders } from './airport.providers';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AirportController],
  providers: [AirportService, ...AirportProviders],
})
export class AirportModule {}
