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
  tsat: string;

  @Prop()
  ctot: string;

  @Prop()
  taxi: number;

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

  @Prop()
  route: string;

  @Prop()
  modify: boolean;

  @Prop()
  cdm: boolean;
}

export const DelayedPlaneSchema = SchemaFactory.createForClass(DelayedPlane);
