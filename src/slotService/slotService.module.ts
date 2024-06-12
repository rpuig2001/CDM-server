import { Module } from '@nestjs/common';
import { SlotServiceController } from './slotService.controller'; // Import FlightDelayController
import { SlotService } from './slotServices.service';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { AirspaceService } from './airspace/airspace.service';
import { VatsimDataService } from './vatsim/vatsim-data.service'; // Import VatsimDataService
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from 'src/database/database.module';
import { SlotServiceProviders } from './slotService.providers';
import { RouteService } from './route/route.service';
import { HelperService } from './helper/helper.service';
import { CadAirportService } from './cadAirport/cadAirport.service';
import { RestrictionService } from './restriction/restriction.service';

@Module({
  imports: [HttpModule, DatabaseModule],
  controllers: [SlotServiceController],
  providers: [
    SlotService,
    ...SlotServiceProviders,
    DelayedPlaneService,
    AirspaceService,
    VatsimDataService,
    RouteService,
    HelperService,
    CadAirportService,
    RestrictionService,
  ],
})
export class SlotServiceModule {}
