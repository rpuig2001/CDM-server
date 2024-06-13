import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Model } from 'mongoose';
import { DelayedPlane } from './delayedPlane.model';
import { HelperService } from '../helper/helper.service';
import { SlotService } from '../slotServices.service';
import { RestrictionService } from '../restriction/restriction.service';
import { CadAirportService } from '../cadAirport/cadAirport.service';
import { cadAirport } from '../cadAirport/interface/cadAirport.interface';

@Injectable()
export class DelayedPlaneService {
  constructor(
    // eslint-disable-next-line prettier/prettier
    @Inject(forwardRef(() => SlotService)) private readonly slotServiceService: SlotService,
    // eslint-disable-next-line prettier/prettier
    @Inject(forwardRef(() => SlotService)) private readonly delayedPlaneService: DelayedPlaneService,
    private readonly helperService: HelperService,
    // eslint-disable-next-line prettier/prettier
    @Inject('SLOT_SERVICE_MODEL') private readonly slotServiceModel: Model<DelayedPlane>,
    private readonly cadAirportService: CadAirportService,
    private readonly restrictionService: RestrictionService,
  ) {}

  async getAllDelayedPlanes(): Promise<DelayedPlane[]> {
    return await this.slotServiceModel.find().exec();
  }

  async getAllrestrictedPlanes(): Promise<DelayedPlane[]> {
    return await this.slotServiceModel.find({ ctot: { $ne: '' } }).exec();
  }

  async deletePlane(callsign: string) {
    await this.slotServiceModel.deleteOne({ callsign: callsign }).exec();
  }

  async setCDM_TSAT(
    callsign: string,
    taxi: number,
    tsat: string,
    cdmSts: string,
  ): Promise<DelayedPlane> {
    let plane = await this.getDelayedPlaneByCallsign(callsign);
    let previousTTOT;
    if (plane) {
      if (tsat.length === 4) {
        if (plane.ctot != '') {
          previousTTOT = plane.ctot;
        } else if (plane.tsat != '') {
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

        plane.cdmSts = cdmSts;
        plane.tsat = tsat;
        plane.taxi = taxi;

        //Update airspace times
        plane.airspaces = await this.slotServiceService.moveTimesOfAirspace(
          plane.airspaces,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
          previousTTOT,
        );

        //Get Planes
        const planes = await this.getAllDelayedPlanes();
        const restrictions = await this.restrictionService.getRestrictions();

        //calculate
        let calcPlane = await this.slotServiceService.calculatePlane(
          plane,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
          planes,
        );
        let initialPlane = plane;
        initialPlane = await this.slotServiceService.makeCTOTvalid(
          calcPlane,
          plane,
        );

        //Get cadAirports
        const cadAirports: cadAirport[] =
          await this.cadAirportService.getAirports(restrictions);

        calcPlane = await this.slotServiceService.calculatePlaneDestination(
          plane,
          planes,
          cadAirports,
          calcPlane,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
        );

        plane = await this.slotServiceService.makeCTOTvalid(
          calcPlane,
          initialPlane,
        );
      } else if (plane && tsat.length === 0) {
        if (plane.ctot != '') {
          previousTTOT = plane.ctot;
        } else if (plane.tsat != '') {
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

        plane.cdmSts = cdmSts;
        plane.tsat = '';
        plane.taxi = 15;

        //Update airspace times
        const actualTTOT = this.helperService.addMinutesToTime(
          plane.eobt,
          plane.taxi,
        );
        plane.airspaces = await this.slotServiceService.moveTimesOfAirspace(
          plane.airspaces,
          actualTTOT,
          previousTTOT,
        );

        //Get Planes
        const planes = await this.getAllDelayedPlanes();
        const restrictions = await this.restrictionService.getRestrictions();

        //calculate
        let calcPlane = await this.slotServiceService.calculatePlane(
          plane,
          this.helperService.addMinutesToTime(plane.eobt, plane.taxi),
          planes,
        );
        let initialPlane = plane;
        initialPlane = await this.slotServiceService.makeCTOTvalid(
          calcPlane,
          initialPlane,
        );

        //Get cadAirports
        const cadAirports: cadAirport[] =
          await this.cadAirportService.getAirports(restrictions);

        calcPlane = await this.slotServiceService.calculatePlaneDestination(
          plane,
          planes,
          cadAirports,
          calcPlane,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
        );

        plane = await this.slotServiceService.makeCTOTvalid(
          calcPlane,
          initialPlane,
        );
      }

      //Update DB Plane
      await this.slotServiceModel
        .findOneAndUpdate({ callsign }, plane, {
          new: true,
          runValidators: true,
        })
        .exec();

      return plane;
    }

    return null;
  }

  async setCdmSts(callsign: string, cdmSts: string): Promise<boolean> {
    const plane = await this.getDelayedPlaneByCallsign(callsign);
    if (plane) {
      plane.cdmSts = cdmSts;
      //Update DB Plane
      await this.slotServiceModel
        .findOneAndUpdate({ callsign }, plane, {
          new: true,
          runValidators: true,
        })
        .exec();
      return true;
    }
    return false;
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
        if (
          JSON.stringify(dbPlane.toObject()) !== JSON.stringify(plane) &&
          plane.tsat == dbPlane.tsat
        ) {
          //console.log(`Updating ${dbPlane.callsign}`);
          dbPlane.set(plane);
          try {
            await dbPlane.save();
          } catch (error: any) {
            console.error(`Error saving ${dbPlane.callsign} to DB: ${error}`);
          }
        }
        dbPlanesMap.delete(plane.callsign);
      }
    }
  }

  async updatePlanes(planes: DelayedPlane[]) {
    const allPlanes = await this.slotServiceModel.find();
    const dbPlanesMap = new Map(
      allPlanes.map((plane) => [plane.callsign, plane]),
    );

    for (const plane of planes) {
      const dbPlane = dbPlanesMap.get(plane.callsign);
      if (dbPlane) {
        if (plane.modify && plane.tsat == dbPlane.tsat) {
          //console.log(`Updating aircraft ${dbPlane.callsign}`);
          plane.modify = false;
          dbPlane.set(plane);
          try {
            await dbPlane.save();
          } catch (error: any) {
            console.error(`Error saving ${dbPlane.callsign} to DB: ${error}`);
          }
        }
        dbPlanesMap.delete(plane.callsign);
      } else {
        //console.log(`Saving aircraft ${plane.callsign}`);
        plane.modify = false;
        const newPlane = new this.slotServiceModel(plane);
        try {
          await newPlane.save();
        } catch (error: any) {
          console.error(`Error saving ${dbPlane.callsign} to DB: ${error}`);
        }
      }
    }

    try {
      const deletePromises = Array.from(dbPlanesMap.values()).map((dbPlane) =>
        this.slotServiceModel.deleteMany({ callsign: dbPlane.callsign }),
      );
      await Promise.all(deletePromises);
    } catch (error: any) {
      console.error(`Error removing unused planees from DB`);
    }
  }
}
