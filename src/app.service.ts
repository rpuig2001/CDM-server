import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';

@Injectable()
export class AppService {
  getInitialize(): string {
    return 'CDM API';
  }

  @Cron('*/10 * * * *')
  async handleCron() {
    try {
      await axios.get('http://localhost:3000/slotService/calculate');
      console.log(`Request sent to start calculation`);
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }
}
