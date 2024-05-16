import { Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { DelayedPlane } from './delayedPlane.model';

@Injectable()
export class DelayedPlaneService {
  constructor(
    @Inject('SLOT_SERVICE_MODEL')
    private readonly slotServiceModel: Model<DelayedPlane>,
  ) {}

  async getAllDelayedPlanes(): Promise<DelayedPlane[]> {
    return await this.slotServiceModel.find().exec();
  }

  async getAllrestrictedPlanes(): Promise<DelayedPlane[]> {
    return await this.slotServiceModel.find({ ctot: { $ne: '' } }).exec();
  }

  async setCDM_TTOT(
    callsign: string,
    taxi: number,
    tsat: string,
  ): Promise<DelayedPlane> {
    const plane = await this.slotServiceModel.findOne({ callsign }).exec();
    if (plane && tsat.length === 4) {
      plane.cdm = true;
      plane.tsat = tsat;
      plane.taxi = taxi;
      plane.modify = true;
      await plane.save();
      return plane;
    } else {
      return null;
    }
  }

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
    const allPlanes = await this.slotServiceModel.find();
    const dbPlanesMap = new Map(
      allPlanes.map((plane) => [plane.callsign, plane]),
    );

    // Check if a plane with the same callsign exists in the database
    for (const plane of planes) {
      const dbPlane = dbPlanesMap.get(plane.callsign);
      if (dbPlane) {
        if (JSON.stringify(dbPlane.toObject()) !== JSON.stringify(plane)) {
          console.log(`Updating ${dbPlane.callsign}`);
          dbPlane.set(plane);
          await dbPlane.save();
        }
        dbPlanesMap.delete(plane.callsign);
      }
    }
  }

  async updatePlanes(planes: DelayedPlane[]): Promise<void> {
    const allPlanes = await this.slotServiceModel.find();
    const dbPlanesMap = new Map(
      allPlanes.map((plane) => [plane.callsign, plane]),
    );

    for (const plane of planes) {
      const dbPlane = dbPlanesMap.get(plane.callsign);
      if (dbPlane) {
        if (plane.modify) {
          console.log(`Updating aircraft ${dbPlane.callsign}`);
          plane.modify = false;
          dbPlane.set(plane);
          await dbPlane.save();
        }
        dbPlanesMap.delete(plane.callsign);
      } else {
        console.log(`Saving aircraft ${plane.callsign}`);
        const newPlane = new this.slotServiceModel(plane);
        await newPlane.save();
      }
    }

    const deletePromises = Array.from(dbPlanesMap.values()).map((dbPlane) =>
      this.slotServiceModel.deleteOne({ callsign: dbPlane.callsign }),
    );

    await Promise.all(deletePromises);
  }
}
