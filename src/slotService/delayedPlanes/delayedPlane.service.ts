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

  async saveDelayedPlane(plane: DelayedPlane): Promise<DelayedPlane> {
    // Find all planes in the database
    const allPlanes = await this.slotServiceModel.find();

    // Array to store promises for deleting planes
    const deletePromises = [];

    // Check if a plane with the same callsign exists in the database
    let existingPlane;
    for (const dbPlane of allPlanes) {
      if (dbPlane.callsign === plane.callsign) {
        existingPlane = dbPlane;
      } else {
        // If a plane with a different callsign exists, delete it
        deletePromises.push(
          this.slotServiceModel.deleteOne({
            _id: dbPlane._id,
          }),
        );
      }
    }

    // If an existing plane was found, replace it
    if (existingPlane) {
      // Update existing plane with new data
      existingPlane.set(plane);

      // Save the updated plane
      await existingPlane.save();

      return plane;
    } else {
      // If no plane with the same callsign exists, create a new one
      const newPlane = new this.slotServiceModel(plane);
      await newPlane.save(); // Save the new plane
      return newPlane.toObject(); // Convert Mongoose document to plain object and return it
    }
  }
}
