import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { RestrictionModel } from './restriction.model';
import { Model } from 'mongoose';
import { DelayedPlane } from '../delayedPlanes/delayedPlane.model';
import { DelayedPlaneService } from '../delayedPlanes/delayedPlane.service';
import { RouteService } from '../route/route.service';

@Injectable()
export class RestrictionService {
  constructor(
    @Inject('RESTRICTION_MODEL')
    private readonly restrictionModel: Model<RestrictionModel>,
    @Inject(forwardRef(() => DelayedPlaneService))
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly routeService: RouteService,
  ) {}

  async getRestrictions(): Promise<RestrictionModel[]> {
    return await this.restrictionModel.find().exec();
  }

  async getRestrictionsByName(name: string): Promise<RestrictionModel> {
    const restrictions = await this.getRestrictions();
    for (const r of restrictions) {
      if (r.airspace == name) {
        return r;
      }
    }
    return null;
  }

  async removeRestriction(airspace: string) {
    await this.restrictionModel.deleteMany({ airspace: airspace }).exec();
    let airspaces = await this.routeService.getAirspaces();
    for (let i = 0; i < airspaces.length; i++) {
      if (airspaces[i].name == airspace) {
        await this.updateRestriction({
          airspace: airspaces[i].name,
          capacity: airspaces[i].capacity,
          reason: '',
        });
      }
      airspaces = null;
      return true;
    }
    airspaces = null;
    return false;
  }

  async addRestriction(
    airspace: string,
    capacity: number,
    reason: string,
  ): Promise<RestrictionModel> {
    const restriction = await this.getRestrictionsByName(airspace);

    if (restriction != null) {
      this.removeRestriction(airspace);
    }
    const newRestriction = new this.restrictionModel({
      airspace,
      capacity,
      reason,
    });
    await newRestriction.save();
    await this.updateRestriction(newRestriction);
    return newRestriction;
  }

  async updateRestriction(restriction: RestrictionModel): Promise<boolean> {
    let planes = await this.delayedPlaneService.getAllDelayedPlanes();
    let planesToUpdate: DelayedPlane[] = [];
    for (let i = 0; i < planes.length; i++) {
      if (planes[i].atot == '') {
        for (let a = 0; a < planes[i].airspaces.length; a++) {
          if (planes[i].airspaces[a].airspace == restriction.airspace) {
            planes[i].airspaces[a].capacity = restriction.capacity;
            planes[i].airspaces[a].reason = restriction.reason;
            planesToUpdate.push(planes[i]);
          }
        }
      }
    }
    await this.delayedPlaneService.updatePlanes(planesToUpdate);
    planesToUpdate = null;
    planes = null;
    return true;
  }
}
