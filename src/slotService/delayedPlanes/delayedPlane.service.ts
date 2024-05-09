import { Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { DelayedPlane } from './delayedPlane.model';

@Injectable()
export class DelayedPlaneService {
  constructor(
    @Inject('SLOT_SERVICE_MODEL')
    private readonly slotServiceModel: Model<DelayedPlane>,
  ) {}

  async getDelayedPlaneByCallsign(
    callsign: string,
  ): Promise<DelayedPlane | null> {
    return await this.slotServiceModel.findOne({ callsign }).exec();
  }

  async getDelayedPlanesByDepartureAirport(
    airport: string,
  ): Promise<DelayedPlane[]> {
    return await this.slotServiceModel.find({ departure: airport }).exec();
  }

  async getDelayedPlanesByPenalizingAirspace(
    airspace: string,
  ): Promise<DelayedPlane[]> {
    return await this.slotServiceModel
      .find({ mostPenalizingAirspace: airspace })
      .exec();
  }

  async saveDelayedPlane(planes: DelayedPlane[]): Promise<void> {
    // Find all planes in the database
    const allPlanes = await this.slotServiceModel.find();

    // Array to store promises for deleting planes
    const deletePromises = [];

    // Check if a plane with the same callsign exists in the database
    for (const dbPlane of allPlanes) {
      let found = false;
      for (const plane of planes) {
        if (dbPlane.callsign === plane.callsign) {
          //Overried database entry already existing
          dbPlane.set(plane);
          found = true;
          break;
        }
      }
      if(!found){
        // If a plane with a different callsign exists, delete it
          this.slotServiceModel.deleteOne({
            _id: dbPlane._id,
          });
      }
    }

    for (const plane of planes) {
      let found = false;
      for (const dbPlane of allPlanes) {
        if (plane.callsign === dbPlane.callsign) {
          found = true;
          break;
        }
      }
      if(!found){
        // Create a new plane
        const newPlane = new this.slotServiceModel(plane);
        await newPlane.save();
      }
    }
  }
}
