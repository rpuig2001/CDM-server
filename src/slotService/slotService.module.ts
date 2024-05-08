import { Module } from '@nestjs/common';
import { SlotServiceController } from './slotService.controller'; // Import FlightDelayController
import { SlotService } from './slotServiceservice';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { AirspaceService } from './airspace/airspace.service';
import { VatsimDataService } from './vatsim/vatsim-data.service'; // Import VatsimDataService
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from 'src/database/database.module';
import { SlotServiceProviders } from './slotService.providers';

@Module({
  imports: [HttpModule, DatabaseModule],
  controllers: [SlotServiceController],
  providers: [
    SlotService,
    ...SlotServiceProviders,
    DelayedPlaneService,
    AirspaceService,
    VatsimDataService,
  ],
})
export class SlotServiceModule {}
