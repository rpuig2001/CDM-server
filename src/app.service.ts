import { Injectable, HttpService, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private httpService: HttpService) {}

  getInitialize(): string {
    return 'CDM API';
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCronProcess() {
    try {
      this.logger.log('Sending request to start calculation');

      // Send request to start calculation
      await this.sendRequest('/slotService/process');

      // Send request to perform calculation
      await this.sendRequest('/slotService/calculate');

      this.logger.log('Requests successfully sent.');
    } catch (error) {
      this.logger.error(`HTTP request failed: ${error.message}`);
    }
  }

  private async sendRequest(endpoint: string) {
    return this.httpService
      .post(`https://cdm-server-production.up.railway.app${endpoint}`, {})
      .pipe(
        catchError((error) => {
          return throwError(() => error);
        }),
      )
      .toPromise();
  }
}