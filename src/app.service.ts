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
      const processResponse = await axios.post(
        'https://cdm-server-production.up.railway.app/slotService/process',
      );
      const calculateResponse = await axios.post(
        'https://cdm-server-production.up.railway.app/slotService/calculate',
      );
      processResponse.data = null;
      calculateResponse.data = null;
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }

  @Cron('*/1 * * * *')
  async handleCronProcessForMasterAirports() {
    try {
      const response = await axios.post(
        'https://cdm-server-production.up.railway.app/airport/removedUnusedMasters',
      );
      response.data = null;
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }
}
