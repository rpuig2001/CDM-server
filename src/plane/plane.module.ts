import { Module } from '@nestjs/common';
import { PlaneController } from './plane.controller';
import { PlaneService } from './plane.service';

@Module({
  imports: [],
  controllers: [PlaneController],
  providers: [PlaneService],
})
export class PlaneModule {}
