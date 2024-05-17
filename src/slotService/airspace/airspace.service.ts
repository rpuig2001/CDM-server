// airspace.service.ts
import { Injectable } from '@nestjs/common';
import { SlotService } from '../slotServiceservice';
import { AirspaceAll } from './interface/airspaces-all.interface';

@Injectable()
export class AirspaceService {
  constructor(private readonly slotServiceService: SlotService) {}

  async getHourlyPeaks(): Promise<{
    [airspace: string]: {
      [hour: string]: { peakMinute: string; maxCount: number };
    };
  }> {
    const airspacesData =
      await this.slotServiceService.getAirspacesWorkload('');

    const occupancy: { [key: string]: { [time: string]: number } } = {};

    // Process each workload and airspace entry
    airspacesData.forEach((workload) => {
      workload.airspaces.forEach((airspace) => {
        const { airspace: name, entryTime, exitTime } = airspace;

        if (!occupancy[name]) {
          occupancy[name] = {};
        }

        // Convert times to integers
        const entryHour = parseInt(entryTime.substring(0, 2));
        const entryMinute = parseInt(entryTime.substring(2, 4));
        const exitHour = parseInt(exitTime.substring(0, 2));
        const exitMinute = parseInt(exitTime.substring(2, 4));

        // Calculate occupancy for each minute the aircraft is in the airspace
        for (let hour = entryHour; hour <= exitHour; hour++) {
          for (
            let minute = hour === entryHour ? entryMinute : 0;
            minute <= (hour === exitHour ? exitMinute : 59);
            minute++
          ) {
            const time = `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
            if (!occupancy[name][time]) {
              occupancy[name][time] = 0;
            }
            occupancy[name][time]++;
          }
        }
      });
    });

    // Initialize the result structure to ensure all hours are present
    const hourlyPeaks: {
      [airspace: string]: {
        [hour: string]: { peakMinute: string; maxCount: number };
      };
    } = {};

    Object.keys(occupancy).forEach((name) => {
      hourlyPeaks[name] = {};
      for (let hour = 0; hour < 24; hour++) {
        const hourStr = String(hour).padStart(2, '0');
        hourlyPeaks[name][hourStr] = { peakMinute: '0000', maxCount: 0 };
      }
    });

    // Calculate peak counts for each hour
    Object.keys(occupancy).forEach((name) => {
      for (let hour = 0; hour < 24; hour++) {
        const hourStr = String(hour).padStart(2, '0');
        let maxCount = 0;
        let peakMinute: string = '0000';

        for (let minute = 0; minute < 60; minute++) {
          const time = `${hourStr}${String(minute).padStart(2, '0')}`;
          if (occupancy[name][time] && occupancy[name][time] > maxCount) {
            maxCount = occupancy[name][time];
            peakMinute = time;
          }
        }

        // Update the peak info
        hourlyPeaks[name][hourStr] = { peakMinute, maxCount };
      }
    });

    return hourlyPeaks;
  }
}
