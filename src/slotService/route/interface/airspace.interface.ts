import { Waypoint } from './waypoint.interface';

export interface Airspace {
  name: string;
  capacity: number;
  boundaries: Waypoint[];
}
