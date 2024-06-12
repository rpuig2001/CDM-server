import { Inject, Injectable } from '@nestjs/common';
import { RestrictionModel } from './restriction.model';
import { Model } from 'mongoose';

@Injectable()
export class RestrictionService {
  constructor(
    @Inject('RESTRICTION_MODEL')
    private readonly restrictionModel: Model<RestrictionModel>,
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
    return newRestriction;
  }
}
