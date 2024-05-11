import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class AirspaceCapacity {
  @Prop()
  name: string;

  @Prop()
  value: number;
}

export const AirspaceCapacitySchema =
  SchemaFactory.createForClass(AirspaceCapacity);
