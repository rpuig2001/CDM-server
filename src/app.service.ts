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
      const response = await axios.get(
        'http://localhost:3000/slotService/calculate',
      );
      console.log(`HTTP request successful: ${response.data}`);
    } catch (error) {
      console.error(`HTTP request failed: ${error.message}`);
    }
  }
}
