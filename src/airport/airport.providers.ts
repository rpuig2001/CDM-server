import { Mongoose } from 'mongoose';
import { AirportSchema } from './schemas/airport.schema';

export const AirportProviders = [
  {
    provide: 'AIRPORT_MODEL',
    useFactory: (mongoose: Mongoose) =>
      mongoose.model('Airport', AirportSchema),
    inject: ['DATABASE_CONNECTION'],
  },
];
