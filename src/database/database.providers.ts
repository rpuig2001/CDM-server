import * as mongoose from 'mongoose';
import { Provider } from '@nestjs/common';

export const databaseProviders: Provider[] = [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: async (): Promise<typeof mongoose> => {
      try {
        const connection = await mongoose.connect(
          'mongodb://mongo:IEtDXdDbODrgdypXYxrzRMZzfYENNqxK@monorail.proxy.rlwy.net:26672',
          {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          }
        );

        mongoose.connection.on('connected', () => {
          console.log('MongoDB connected');
        });

        mongoose.connection.on('disconnected', () => {
          console.log('MongoDB disconnected');
        });

        mongoose.connection.on('error', (error) => {
          console.error('MongoDB connection error:', error);
        });

        return connection;
      } catch (error) {
        console.error('MongoDB connection failed:', error);
        throw error;
      }
    },
  },
];
