import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Model } from 'mongoose';
import { DelayedPlane } from './delayedPlane.model';
import { HelperService } from '../helper/helper.service';
import { SlotService } from '../slotServices.service';
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
        plane.airspaces = await this.slotServiceService.moveTimesOfAirspace(
          plane.airspaces,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
          previousTTOT,
        );
        //get Airspaces data
        const airspacesWorkload =
          await this.slotServiceService.getAirspacesWorkload(plane.callsign);

        //calculate
        let calcPlane = await this.slotServiceService.calculatePlane(
          plane,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
          airspacesWorkload,
        );

        //Get Planes
        const planes = await this.getAllDelayedPlanes();
        //Get cadAirports
        const cadAirports: cadAirport[] =
          await this.cadAirportService.getAirports();

        calcPlane = await this.slotServiceService.calculatePlaneDestination(
          plane.airspaces,
          planes,
          cadAirports,
          calcPlane,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
        );

        plane = await this.slotServiceService.makeCTOTvalid(calcPlane, plane);
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
        plane.airspaces = await this.slotServiceService.moveTimesOfAirspace(
          plane.airspaces,
          actualTTOT,
          previousTTOT,
        );

        //get Airspaces data
        const airspacesWorkload =
          await this.slotServiceService.getAirspacesWorkload(plane.callsign);

        //calculate
        let calcPlane = await this.slotServiceService.calculatePlane(
          plane,
          this.helperService.addMinutesToTime(plane.eobt, plane.taxi),
          airspacesWorkload,
        );

        //Get Planes
        const planes = await this.getAllDelayedPlanes();
        //Get cadAirports
        const cadAirports: cadAirport[] =
          await this.cadAirportService.getAirports();

        calcPlane = await this.slotServiceService.calculatePlaneDestination(
          plane.airspaces,
          planes,
          cadAirports,
          calcPlane,
          this.helperService.addMinutesToTime(plane.tsat, plane.taxi),
        );

        plane = await this.slotServiceService.makeCTOTvalid(calcPlane, plane);
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
          //console.log(`Updating ${dbPlane.callsign}`);
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
          //console.log(`Updating aircraft ${dbPlane.callsign}`);
          plane.modify = false;
          dbPlane.set(plane);
          await dbPlane.save();
        }
        dbPlanesMap.delete(plane.callsign);
      } else {
        //console.log(`Saving aircraft ${plane.callsign}`);
        plane.modify = false;
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
