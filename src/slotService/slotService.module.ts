import { Module } from '@nestjs/common';
import { SlotServiceController } from './slotService.controller'; // Import FlightDelayController
import { SlotService } from './slotServiceservice';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { AirspaceService } from './airspace/airspace.service';
import { VatsimDataService } from './vatsim/vatsim-data.service'; // Import VatsimDataService
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [SlotServiceController],
  providers: [
    SlotService,
    DelayedPlaneService,
    AirspaceService,
    VatsimDataService,
  ],
})
export class SlotServiceModule {}
