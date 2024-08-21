import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';

@Injectable()
export class AppService {
  getInitialize(): string {
    return 'CDM API';
  }

  @Cron('*/5 * * * *')
  async handleCronProcessAndCalculate() {
    try {
      /*console.log(`Request sent to start calculation`);*/
      await axios.post(
        'https://cdm-server-production.up.railway.app/slotService/process',
      );
      await axios.post(
        'https://cdm-server-production.up.railway.app/slotService/calculate',
      );
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }

  @Cron('3,8,13,18,23,28,33,38,43,48,53,58 * * * *')
  async handleCronProcessing() {
    try {
      /*console.log(`Request sent to start calculation`);*/
      await axios.post(
        'https://cdm-server-production.up.railway.app/slotService/process',
      );
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }

  @Cron('/1 * * * *')
  async handleCronProcessForMasterAirports() {
    try {
      await axios.post(
        'https://cdm-server-production.up.railway.app/airport/removedUnusedMasters',
      );
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }
}
