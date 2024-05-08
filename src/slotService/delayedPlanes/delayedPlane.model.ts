// delayed-plane.model.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

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
  ctot: string;

  @Prop()
  delayTime: number;

  @Prop()
  mostPenalizingAirspace: string;

  @Prop()
  reason: string;
}

export const DelayedPlaneSchema = SchemaFactory.createForClass(DelayedPlane);
