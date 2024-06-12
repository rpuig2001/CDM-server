import { Mongoose } from 'mongoose';
import { DelayedPlaneSchema } from './delayedPlanes/delayedPlane.model';
import { RestrictionSchema } from './restriction/restriction.model';

export const SlotServiceProviders = [
  {
    provide: 'SLOT_SERVICE_MODEL',
    useFactory: (mongoose: Mongoose) =>
      mongoose.model('SlotService', DelayedPlaneSchema),
    inject: ['DATABASE_CONNECTION'],
  },
  {
    provide: 'RESTRICTION_MODEL',
    useFactory: (mongoose: Mongoose) =>
      mongoose.model('Restrictions', RestrictionSchema),
    inject: ['DATABASE_CONNECTION'],
  },
];
