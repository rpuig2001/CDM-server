// airspace.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class AirspaceService {
  constructor() {}

  calculateEntryTime(
    departureTime: Date,
    airspaceCode: string,
    minutes: number,
  ): Date {
    const deptime = new Date(departureTime);
    deptime.setMinutes(deptime.getMinutes() + minutes);
    return deptime;
  }
}
