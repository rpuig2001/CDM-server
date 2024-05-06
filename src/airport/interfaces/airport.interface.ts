import { Document } from 'mongoose';

export interface Airport extends Document {
  readonly icao: string;
  readonly position: string;
}
