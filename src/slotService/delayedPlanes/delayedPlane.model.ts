import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AirspaceComplete } from '../airspace/interface/airspace-complete.interface';

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
  taxi: number;

  @Prop()
  ctot: string;

  @Prop()
  atot: string;

  @Prop()
  mostPenalizingAirspace: string;

  @Prop()
  airspaces: AirspaceComplete[];

  @Prop()
  route: string;

  @Prop()
  modify: boolean;

  @Prop()
  cdmSts: string;
}

export const DelayedPlaneSchema = SchemaFactory.createForClass(DelayedPlane);
