// vatsim-data.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class VatsimDataService {
  private readonly URL = 'https://data.vatsim.net/v3/vatsim-data.json';

  async fetchAndExtractPilots(): Promise<any[]> {
    try {
      const response = await axios.get(this.URL);
      const { pilots } = response.data;
      return pilots;
    } catch (error) {
      console.error('Error fetching and extracting pilots:', error);
      throw error;
    }
  }
}
