import { Controller, Get } from '@nestjs/common';
import { SlotService } from './slotServiceservice';
import { HttpService } from '@nestjs/axios';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Controller('slotService')
export class SlotServiceController {
  constructor(
    private readonly slotService: SlotService,
    private readonly httpService: HttpService,
  ) {}

  @Get('calculate')
  async getDelayedPlanes(): Promise<any[]> {
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
        const delayedPlanes = await this.slotService.delayPlanes(planes);
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
}
