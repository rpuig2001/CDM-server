import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInitialize(): string {
    return 'CDM API';
  }
}
