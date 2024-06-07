import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as mongoose from 'mongoose';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  async onModuleDestroy() {
    await mongoose.disconnect();
    console.log('MongoDB connection closed due to app termination');
  }
}
