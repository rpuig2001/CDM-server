import mongoose, { ConnectOptions } from 'mongoose';

export const databaseProviders = [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: async (): Promise<typeof mongoose> =>
      await mongoose.connect('mongodb://mongo:IEtDXdDbODrgdypXYxrzRMZzfYENNqxK@monorail.proxy.rlwy.net:26672', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      } as ConnectOptions),
    /*await mongoose.connect(
        'mongodb+srv://cdm_admin:ugR6h4EopPJdGZUZ@cdm-cluster.qhmhmcu.mongodb.net/interface?retryWrites=true&w=majority&appName=CDM-Cluster',
      ),*/
  },
];