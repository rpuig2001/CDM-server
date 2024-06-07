import * as mongoose from 'mongoose';

export const databaseProviders = [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: async (): Promise<typeof mongoose> => {
      try {
        const connection = await mongoose.connect(
          'mongodb+srv://cdm_admin:ugR6h4EopPJdGZUZ@cdm-cluster.qhmhmcu.mongodb.net/interface?retryWrites=true&w=majority&appName=CDM-Cluster',
          {
            maxPoolSize: 20,
          },
        );

        mongoose.connection.on('connected', () => {
          console.log('Mongoose connected to the database');
        });

        mongoose.connection.on('error', (err) => {
          console.error('Mongoose connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
          console.log('Mongoose disconnected from the database');
        });

        return connection;
      } catch (error) {
        console.error('Failed to connect to MongoDB', error);
        throw error;
      }
    },
  },
];
