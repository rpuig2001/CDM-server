/* eslint-disable @typescript-eslint/no-var-requires */
import { Injectable } from '@nestjs/common';
import { Plane } from './interface/plane.interface';
import axios from 'axios';

@Injectable()
export class PlaneService {
  async cidCheck(cid: number): Promise<string> {
    const planes = await this.getPilots();
    for (const plane of planes) {
      if (plane.id == cid) {
        return plane.callsign;
      }
    }
    console.log(`Plane with CID ${cid} not found`);
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
