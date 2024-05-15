import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';

@Injectable()
export class AppService {
  getInitialize(): string {
    return 'CDM API';
  }

  @Cron('*/2 * * * *')
  async handleCronCalculate() {
    try {
      await axios.get(
        'https://cdm-server-production.up.railway.app/slotService/calculate',
      );
      console.log(`Request sent to start calculation`);
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }

  @Cron('*/1 * * * *')
  async handleCronProcess() {
    try {
      console.log(`Request sent to start calculation`);
      await axios.get(
        'https://cdm-server-production.up.railway.app/slotService/process',
      );
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }
}
