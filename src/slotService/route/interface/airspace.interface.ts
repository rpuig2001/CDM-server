import { Waypoint } from './waypoint.interface';

export interface Airspace {
  name: string;
  boundaries: Waypoint[];
}
