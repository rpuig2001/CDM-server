import { Injectable } from '@nestjs/common';
import { DelayedPlane } from './delayedPlane.model';

@Injectable()
export class DelayedPlaneService {
  private delayedPlanes: DelayedPlane[] = [];

  async saveDelayedPlane(plane: DelayedPlane): Promise<DelayedPlane> {
    this.delayedPlanes.push(plane);
    return plane;
  }

  getDelayedPlanes(): DelayedPlane[] {
    return this.delayedPlanes;
  }
}
