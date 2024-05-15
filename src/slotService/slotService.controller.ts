import { Controller, Get, Query } from '@nestjs/common';
import { SlotService } from './slotServiceservice';
import { HttpService } from '@nestjs/axios';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { RouteService } from './route/route.service';

@Controller('slotService')
export class SlotServiceController {
  constructor(
    private readonly slotService: SlotService,
    private readonly httpService: HttpService,
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly routeService: RouteService,
  ) {}

  @Get('callsign')
  setQueryToFindCallign(@Query('callsign') callsign: string) {
    return this.delayedPlaneService.getDelayedPlaneByCallsign(callsign);
  }

  @Get('depAirport')
  setQueryToFindDepAirort(@Query('airport') airport: string) {
    return this.delayedPlaneService.getDelayedPlanesByDepartureAirport(airport);
  }

  @Get('airspace')
  setQueryToFindAirspace(@Query('airspace') airspace: string) {
    return this.delayedPlaneService.getDelayedPlanesByPenalizingAirspace(
      airspace,
    );
  }

  @Get('restricted')
  findRestricted() {
    return this.delayedPlaneService.getAllrestrictedPlanes();
  }

  @Get('process')
  async getProcessedPlanes(): Promise<any[]> {
    try {
      const response = await this.httpService
        .get('https://data.vatsim.net/v3/vatsim-data.json')
        .pipe(
          catchError((error) => {
            console.error('Error fetching planes:', error);
            return of(null);
          }),
        )
        .toPromise();

      if (response && response.data && response.data.pilots) {
        const planes = response.data.pilots;
        const delayedPlanes = await this.slotService.processPlanes(planes);
        return delayedPlanes;
      } else {
        console.error('Invalid response from source');
        return [];
      }
    } catch (error) {
      console.error('Error fetching delayed planes:', error);
      return [];
    }
  }

  @Get('calculate')
  async getDelayedPlanes(): Promise<any[]> {
    const delayedPlanes = await this.slotService.delayPlanes(
      await this.delayedPlaneService.getAllDelayedPlanes(),
    );
    return delayedPlanes;
  }
}
