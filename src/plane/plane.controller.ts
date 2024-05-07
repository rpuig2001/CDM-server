import { Controller, Get, Query } from '@nestjs/common';
import { PlaneService } from './plane.service';

@Controller('plane')
export class PlaneController {
  constructor(private readonly planeService: PlaneService) {}

  @Get('cidCheck')
  setQueryToCheckCid(@Query('cid') cid: number) {
    return this.planeService.cidCheck(cid);
  }
}
