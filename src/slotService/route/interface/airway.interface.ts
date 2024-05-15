import { Waypoint } from './waypoint.interface';

export interface Airway {
  nameAirway: string;
  waypointsForAirway: Waypoint[];
}
