// airspace.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { cadAirport } from './interface/cadAirport.interface';
import { RestrictionModel } from '../restriction/restriction.model';

@Injectable()
export class CadAirportService {
  private async fetchData(url: string): Promise<string> {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`Error fetching data from ${url}`);
        if (error.response?.status === 500) {
          console.error('Internal Server Error');
        }
      } else {
        console.error('Unexpected error:', error);
      }
      return null;
    }
  }

  private async parseData(data: string): Promise<cadAirport[]> {
    const airports: cadAirport[] = [];
    const lines = data.split('\n');

    for (const line of lines) {
      if (line.startsWith('#')) {
        continue;
      }
      if (line.startsWith('URL')) {
        const url = line.split(',')[1];
        const additionalData = await this.fetchData(url.trim());
        if (additionalData) {
          const additionalAirports = await this.parseData(additionalData);
          airports.push(...additionalAirports);
        }
      } else if (line.trim()) {
        const [icao, rate] = line.split(',');
        airports.push({
          icao: icao.trim(),
          rate: parseInt(rate.trim(), 10),
          reason: '',
        });
      }
    }

    return airports;
  }

  public async getAirports(
    restrictions: RestrictionModel[],
  ): Promise<cadAirport[]> {
    const url =
      'https://raw.githubusercontent.com/rpuig2001/Capacity-Availability-Document-CDM/main/CAD.txt';
    const data = await this.fetchData(url);
    const cadAirports = await this.parseData(data);

    for (const a of cadAirports) {
      for (const r of restrictions) {
        if (a.icao == r.airspace) {
          a.rate = 60 / r.capacity;
          a.reason = r.reason;
        }
      }
    }

    return cadAirports;
  }
}
