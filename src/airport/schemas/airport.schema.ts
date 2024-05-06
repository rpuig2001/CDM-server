import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Airport extends Document {
  @Prop({ required: true })
  icao: string;

  @Prop({ required: true })
  position: string;
}

export const AirportSchema = SchemaFactory.createForClass(Airport);
