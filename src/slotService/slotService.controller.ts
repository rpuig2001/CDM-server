import { Controller, Get, Post, Query } from '@nestjs/common';
import { SlotService } from './slotServices.service';
import { HttpService } from '@nestjs/axios';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { RouteService } from './route/route.service';
import { AirspaceService } from './airspace/airspace.service';
import { RestrictionService } from './restriction/restriction.service';

@Controller('slotService')
export class SlotServiceController {
  constructor(
    private readonly slotService: SlotService,
    private readonly httpService: HttpService,
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly airspaceService: AirspaceService,
    private readonly routeService: RouteService,
    private readonly restrictionService: RestrictionService,
  ) {}

  @Get('callsign')
  async setQueryToFindCallign(@Query('callsign') callsign: string) {
    return await this.delayedPlaneService.getDelayedPlaneByCallsign(callsign);
  }

  @Get('depAirport')
  async setQueryToFindDepAirort(@Query('airport') airport: string) {
    return await this.delayedPlaneService.getDelayedPlanesByDepartureAirport(
      airport,
    );
  }

  @Get('airspace')
  async setQueryToFindAirspace(@Query('airspace') airspace: string) {
    return await this.delayedPlaneService.getDelayedPlanesByPenalizingAirspace(
      airspace,
    );
  }

  @Post('cdm')
  async setQueryToSetTSAT(
    @Query('callsign') callsign: string,
    @Query('taxi') taxi: number,
    @Query('tsat') tsat: string,
    @Query('cdmSts') cdmSts: string,
  ) {
    return await this.delayedPlaneService.setCDM_TSAT(
      callsign,
      taxi,
      tsat,
      cdmSts,
    );
  }

  @Post('setCdmStatus')
  async setCdmStatus(
    @Query('callsign') callsign: string,
    @Query('cdmSts') cdmSts: string,
  ) {
    return await this.delayedPlaneService.setCdmSts(callsign, cdmSts);
  }

  @Get('airspaces')
  async getAirspacesWorkload() {
    return await this.airspaceService.getHourlyPeaks();
  }

  @Get('restricted')
  async findRestricted() {
    return await this.delayedPlaneService.getAllrestrictedPlanes();
  }

  @Post('process')
  async getProcessedPlanes(): Promise<boolean> {
    let planes = null;
    let response = null;
    try {
      response = await this.httpService
        .get('https://data.vatsim.net/v3/vatsim-data.json')
        .pipe(
          catchError((error) => {
            console.error('Error fetching planes:', error);
            return of(null);
          }),
        )
        .toPromise();

      if (response && response.data && response.data.pilots) {
        planes = response.data.pilots;
        const [delayedPlanes] = await Promise.all([
          await this.slotService.processPlanes(planes),
        ]);
        //const delayedPlanes = await this.slotService.processPlanes(planes);
        planes = null;
        response = null;
        return delayedPlanes;
      } else {
        console.error('Invalid response from source');
        planes = null;
        response = null;
        return false;
      }
    } catch (error) {
      console.error('Error fetching delayed planes:', error);
      planes = null;
      response = null;
      return false;
    }
  }

  @Post('calculate')
  async getDelayedPlanes(): Promise<boolean> {
    const delayedPlanes = await this.slotService.delayPlanes(
      await this.delayedPlaneService.getAllDelayedPlanes(),
    );
    return delayedPlanes;
  }

  @Get('restrictions')
  async getRestrictions() {
    return await this.restrictionService.getRestrictions();
  }

  @Post('addRestriction')
  async addNewRestriction(
    @Query('airspace') airspace: string,
    @Query('capacity') capacity: number,
    @Query('reason') reason: string,
  ): Promise<any> {
    return await this.restrictionService.addRestriction(
      airspace,
      capacity,
      reason,
    );
  }

  @Post('removeRestriction')
  async removeExistingRestriction(
    @Query('airspace') airspace: string,
  ): Promise<any> {
    return await this.restrictionService.removeRestriction(airspace);
  }
}
