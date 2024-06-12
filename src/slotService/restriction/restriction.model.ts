import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class RestrictionModel {
  @Prop()
  airspace: string;

  @Prop()
  capacity: number;

  @Prop()
  reason: string;
}

export const RestrictionSchema = SchemaFactory.createForClass(RestrictionModel);
