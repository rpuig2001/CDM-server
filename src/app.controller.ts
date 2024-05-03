import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test')
  getTest(): string {
    return this.appService.getTest();
  }

  @Get('newPlane/:callsign')
  findOne(@Param('callsign') callsign: string): string {
    if (callsign == null){
      return `Plane undifined`;
    }
    return `Plane: ${callsign}`;
  }
}
