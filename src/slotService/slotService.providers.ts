import { Mongoose } from 'mongoose';
import { DelayedPlaneSchema } from './delayedPlanes/delayedPlane.model';

export const SlotServiceProviders = [
  {
    provide: 'SLOT_SERVICE_MODEL',
    useFactory: (mongoose: Mongoose) =>
      mongoose.model('SlotService', DelayedPlaneSchema),
    inject: ['DATABASE_CONNECTION'],
  },
];
