import { Document } from 'mongoose';

export interface Plane extends Document {
  id: number;
  callsign: string;
  start: string;
  server: string;
  rating: number;
  fp: any;
}
