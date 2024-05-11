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

    // Create a map of planes from the database, using the callsign as the key
    const dbPlanesMap = new Map(
      allPlanes.map((plane) => [plane.callsign, plane]),
    );

    // Check if a plane with the same callsign exists in the database
    for (const plane of planes) {
      const dbPlane = dbPlanesMap.get(plane.callsign);
      if (dbPlane) {
        // If a plane with the same callsign exists, check if it's different from the new data
        if (JSON.stringify(dbPlane.toObject()) !== JSON.stringify(plane)) {
          // If the plane data is different, update it
          dbPlane.set(plane);
          await dbPlane.save(); // Save the changes to the database
        }
        dbPlanesMap.delete(plane.callsign); // Remove it from the map
      } else {
        // If no plane with the same callsign exists, create a new one
        const newPlane = new this.slotServiceModel(plane);
        await newPlane.save(); // Save the new plane to the database
      }
    }

    // Any remaining planes in the map exist in the database but not in the passed list, so delete them
    const deletePromises = Array.from(dbPlanesMap.values()).map((dbPlane) =>
      this.slotServiceModel.deleteOne({ _id: dbPlane._id }),
    );

    // Wait for all delete promises to complete
    await Promise.all(deletePromises);
  }
}
