// airspace.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { cadAirport } from './interface/cadAirport.interface';

@Injectable()
export class CadAirportService {
  private async fetchData(url: string): Promise<string> {
    const response = await axios.get(url);
    return response.data;
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
        const additionalAirports = await this.parseData(additionalData);
        airports.push(...additionalAirports);
      } else if (line.trim()) {
        const [icao, rate] = line.split(',');
        airports.push({
          icao: icao.trim(),
          rate: parseInt(rate.trim(), 10),
        });
      }
    }

    return airports;
  }

  public async getAirports(): Promise<cadAirport[]> {
    const url =
      'https://raw.githubusercontent.com/rpuig2001/Capacity-Availability-Document-CDM/main/CAD.txt';
    const data = await this.fetchData(url);
    return this.parseData(data);
  }
}
