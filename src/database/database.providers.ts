import * as mongoose from 'mongoose';

export const databaseProviders = [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: async (): Promise<typeof mongoose> =>
      await mongoose.connect(
        'mongodb://mongo:IEtDXdDbODrgdypXYxrzRMZzfYENNqxK@monorail.proxy.rlwy.net:26672',
        {
            uri_decode_auth: true,
            useUnifiedTopology: true,
          }
      ),
    /*await mongoose.connect(
        'mongodb+srv://cdm_admin:ugR6h4EopPJdGZUZ@cdm-cluster.qhmhmcu.mongodb.net/interface?retryWrites=true&w=majority&appName=CDM-Cluster',
      ),*/
  },
];