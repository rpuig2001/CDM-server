/* eslint-disable @typescript-eslint/no-var-requires */
import { Injectable } from '@nestjs/common';
import { Plane } from './interface/plane.interface';
import axios from 'axios';

@Injectable()
export class PlaneService {
  async getCid(callsign: string): Promise<number> {
    const planes = await this.getPilots();
    for (const plane of planes) {
      if (plane.callsign == callsign) {
        console.log(`Plane ${callsign} is linked with CID ${plane.id}`);
        return plane.id;
      }
    }
    console.log(`Plane ${callsign} not found`);
    return null;
  }

  async getPilots(): Promise<Plane[]> {
    try {
      const response = await axios.get(
        'https://api.vatsim.net/v2/members/online',
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );
      return response.data as Plane[];
    } catch (error) {
      console.error('Error fetching pilots:', error);
      throw error;
    }
  }
}
