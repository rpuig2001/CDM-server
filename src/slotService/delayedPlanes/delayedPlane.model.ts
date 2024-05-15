import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AirspaceComplete } from '../interface/airspace-complete.interface';

@Schema()
export class DelayedPlane {
  @Prop()
  callsign: string;

  @Prop()
  departure: string;

  @Prop()
  arrival: string;

  @Prop()
  eobt: string;

  @Prop()
  ttot: string;

  @Prop()
  ctot: string;

  @Prop()
  delayTime: number;

  @Prop()
  mostPenalizingAirspace: string;

  @Prop()
  reason: string;

  @Prop()
  airspaces: AirspaceComplete[];

  @Prop()
  isAirbone: boolean;
}

export const DelayedPlaneSchema = SchemaFactory.createForClass(DelayedPlane);
