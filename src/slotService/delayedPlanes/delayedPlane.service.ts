import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Model } from 'mongoose';
import { DelayedPlane } from './delayedPlane.model';
import { HelperService } from '../helper/helper.service';
import { SlotService } from '../slotServiceservice';

@Injectable()
export class DelayedPlaneService {
  constructor(
    // eslint-disable-next-line prettier/prettier
    @Inject(forwardRef(() => SlotService)) private readonly slotServiceService: SlotService,
    private readonly helperService: HelperService,
    // eslint-disable-next-line prettier/prettier
    @Inject('SLOT_SERVICE_MODEL') private readonly slotServiceModel: Model<DelayedPlane>,
  ) {}

  async getAllDelayedPlanes(): Promise<DelayedPlane[]> {
    return await this.slotServiceModel.find().exec();
  }

  async getAllrestrictedPlanes(): Promise<DelayedPlane[]> {
    return await this.slotServiceModel.find({ ctot: { $ne: '' } }).exec();
  }

  async setCDM_TSAT(
    callsign: string,
    taxi: number,
    tsat: string,
  ): Promise<DelayedPlane> {
    let plane = await this.getDelayedPlaneByCallsign(callsign);
    let previousTTOT;
    if (plane) {
      if (tsat.length === 4) {
        if (plane.tsat != '') {
          previousTTOT = this.helperService.addMinutesToTime(
            plane.tsat,
            plane.taxi,
          );
        } else {
          previousTTOT = this.helperService.addMinutesToTime(
            plane.eobt,
            plane.taxi,
          );
        }

        plane.cdm = true;
        plane.tsat = tsat;
        plane.taxi = taxi;

        //Update airspace times
        const diff = this.helperService.getTimeDifferenceInMinutes(
          previousTTOT,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
        );

        if (diff > 0) {
          for (let z = 0; z < plane.airspaces.length; z++) {
            plane.airspaces[z].entryTime = this.helperService.addMinutesToTime(
              plane.airspaces[z].entryTime,
              diff,
            );
            plane.airspaces[z].exitTime = this.helperService.addMinutesToTime(
              plane.airspaces[z].exitTime,
              diff,
            );
          }
        } else if (diff != 0) {
          for (let z = 0; z < plane.airspaces.length; z++) {
            plane.airspaces[z].entryTime =
              this.helperService.removeMinutesFromTime(
                plane.airspaces[z].entryTime,
                Math.abs(diff),
              );
            plane.airspaces[z].exitTime =
              this.helperService.removeMinutesFromTime(
                plane.airspaces[z].exitTime,
                Math.abs(diff),
              );
          }
        }
        //get Airspaces data
        const airspacesWorkload =
          await this.slotServiceService.getAirspacesWorkload(plane.callsign);

        //calculate
        plane = await this.slotServiceService.calculatePlane(
          plane,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
          airspacesWorkload,
        );
      } else if (plane && tsat.length === 0) {
        if (plane.tsat != '') {
          previousTTOT = this.helperService.addMinutesToTime(
            plane.tsat,
            plane.taxi,
          );
        } else {
          previousTTOT = this.helperService.addMinutesToTime(
            plane.eobt,
            plane.taxi,
          );
        }

        plane.cdm = false;
        plane.tsat = '';
        plane.taxi = 15;

        //Update airspace times
        const actualTTOT = this.helperService.addMinutesToTime(
          plane.eobt,
          plane.taxi,
        );
        const diff = this.helperService.getTimeDifferenceInMinutes(
          previousTTOT,
          actualTTOT,
        );

        if (
          this.helperService.isTime1GreaterThanTime2(actualTTOT, previousTTOT)
        ) {
          for (let z = 0; z < plane.airspaces.length; z++) {
            plane.airspaces[z].entryTime = this.helperService.addMinutesToTime(
              plane.airspaces[z].entryTime,
              diff,
            );
            plane.airspaces[z].exitTime = this.helperService.addMinutesToTime(
              plane.airspaces[z].exitTime,
              diff,
            );
          }
        } else if (diff != 0) {
          for (let z = 0; z < plane.airspaces.length; z++) {
            plane.airspaces[z].entryTime =
              this.helperService.removeMinutesFromTime(
                plane.airspaces[z].entryTime,
                diff,
              );
            plane.airspaces[z].exitTime =
              this.helperService.removeMinutesFromTime(
                plane.airspaces[z].exitTime,
                diff,
              );
          }
        }
        //get Airspaces data
        const airspacesWorkload =
          await this.slotServiceService.getAirspacesWorkload(plane.callsign);

        //calculate
        plane = await this.slotServiceService.calculatePlane(
          plane,
          this.helperService.addMinutesToTime(plane.eobt, plane.taxi),
          airspacesWorkload,
        );
      }

      //Update DB Plane
      const dbPlane = await this.slotServiceModel.findOne({ callsign }).exec();
      dbPlane.set(plane);
      await dbPlane.save();

      return plane;
    }

    return null;
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
