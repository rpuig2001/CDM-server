import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Model } from 'mongoose';
import { cloneDeep } from 'lodash';
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
    let mainPlane = plane;
    let previousTTOT;
    let planeCopy = null;
    let planesCopy = null;
    if (plane) {
      if (cdmSts != 'I') {
        if (tsat.length === 4) {
          console.log(`${mainPlane.callsign} - REQ - Setting TSAT ${tsat}`);
          if (mainPlane.ctot != '') {
            previousTTOT = mainPlane.ctot;
          } else if (mainPlane.tsat != '') {
            previousTTOT = this.helperService.addMinutesToTime(
              mainPlane.tsat,
              mainPlane.taxi,
            );
          } else {
            previousTTOT = this.helperService.addMinutesToTime(
              mainPlane.eobt,
              mainPlane.taxi,
            );
          }

          mainPlane.cdmSts = cdmSts;
          mainPlane.tsat = tsat;
          mainPlane.taxi = taxi;

          //Update airspace times
          mainPlane.airspaces =
            await this.slotServiceService.moveTimesOfAirspace(
              mainPlane.airspaces,
              this.helperService.addMinutesToTime(
                mainPlane.tsat,
                mainPlane.taxi,
              ),
              previousTTOT,
            );

          //Get Planes
          let planes = await this.getAllDelayedPlanes();
          let restrictions = await this.restrictionService.getRestrictions();

          //calculate
          planeCopy = cloneDeep(mainPlane);
          planesCopy = cloneDeep(planes);
          let calcPlane = await this.slotServiceService.calculatePlane(
            planeCopy,
            this.helperService.addMinutesToTime(mainPlane.tsat, mainPlane.taxi),
            planesCopy,
          );
          planeCopy = cloneDeep(mainPlane);
          const initialPlane = await this.slotServiceService.makeCTOTvalid(
            calcPlane,
            planeCopy,
            1,
            true,
          );

          //Get cadAirports
          const cadAirports: cadAirport[] =
            await this.cadAirportService.getAirports(restrictions);

          planeCopy = cloneDeep(mainPlane);
          planesCopy = cloneDeep(planes);
          calcPlane = await this.slotServiceService.calculatePlaneDestination(
            planeCopy,
            planesCopy,
            cadAirports,
            calcPlane,
            this.helperService.addMinutesToTime(mainPlane.tsat, mainPlane.taxi),
          );

          plane = await this.slotServiceService.makeCTOTvalid(
            calcPlane,
            initialPlane,
            2,
            true,
          );

          planes = null;
          restrictions = null;
        } else if (mainPlane && tsat.length === 0) {
          console.log(`${mainPlane.callsign} - REQ - Removing TSAT`);
          if (mainPlane.ctot != '') {
            previousTTOT = mainPlane.ctot;
          } else if (mainPlane.tsat != '') {
            previousTTOT = this.helperService.addMinutesToTime(
              mainPlane.tsat,
              mainPlane.taxi,
            );
          } else {
            previousTTOT = this.helperService.addMinutesToTime(
              mainPlane.eobt,
              mainPlane.taxi,
            );
          }

          mainPlane.cdmSts = cdmSts;
          mainPlane.tsat = '';
          mainPlane.taxi = 15;

          //Update airspace times
          const actualTTOT = this.helperService.addMinutesToTime(
            mainPlane.eobt,
            mainPlane.taxi,
          );
          mainPlane.airspaces =
            await this.slotServiceService.moveTimesOfAirspace(
              mainPlane.airspaces,
              actualTTOT,
              previousTTOT,
            );

          //Get Planes
          let planes = await this.getAllDelayedPlanes();
          let restrictions = await this.restrictionService.getRestrictions();

          //calculate
          planeCopy = cloneDeep(mainPlane);
          planesCopy = cloneDeep(planes);
          let calcPlane = await this.slotServiceService.calculatePlane(
            planeCopy,
            this.helperService.addMinutesToTime(mainPlane.eobt, mainPlane.taxi),
            planesCopy,
          );

          planeCopy = cloneDeep(mainPlane);
          const initialPlane = await this.slotServiceService.makeCTOTvalid(
            calcPlane,
            planeCopy,
            1,
            true,
          );

          //Get cadAirports
          const cadAirports: cadAirport[] =
            await this.cadAirportService.getAirports(restrictions);

          planeCopy = cloneDeep(mainPlane);
          planesCopy = cloneDeep(planes);
          calcPlane = await this.slotServiceService.calculatePlaneDestination(
            planeCopy,
            planesCopy,
            cadAirports,
            calcPlane,
            this.helperService.addMinutesToTime(mainPlane.tsat, mainPlane.taxi),
          );

          plane = await this.slotServiceService.makeCTOTvalid(
            calcPlane,
            initialPlane,
            2,
            true,
          );

          planes = null;
          restrictions = null;
          planeCopy = null;
          planesCopy = null;
          mainPlane = null;
        }
      }
      //Update DB Plane
      await this.slotServiceModel
        .findOneAndUpdate({ callsign }, plane, {
          new: true,
          runValidators: true,
        })
        .exec();

      planeCopy = null;
      mainPlane = null;
      planesCopy = null;

      return plane;
    }

    planeCopy = null;
    mainPlane = null;
    planesCopy = null;

    return null;
  }

  async setCdmSts(callsign: string, cdmSts: string): Promise<boolean> {
    let plane = await this.getDelayedPlaneByCallsign(callsign);
    if (plane) {
      plane.cdmSts = cdmSts;

      if (cdmSts == 'I') {
        plane = await this.resetAirspacesToEobt(plane);
      }

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
    let allPlanes = await this.slotServiceModel.find();
    let dbPlane = null;
    let dbPlanesMap = new Map(
      allPlanes.map((plane) => [plane.callsign, plane]),
    );

    // Check if a plane with the same callsign exists in the database
    for (const plane of planes) {
      dbPlane = dbPlanesMap.get(plane.callsign);
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
    dbPlanesMap = null;
    allPlanes = null;
  }

  async updatePlanes(planes: DelayedPlane[]) {
    let allPlanes = await this.slotServiceModel.find();
    let dbPlane = null;
    let dbPlanesMap = new Map(
      allPlanes.map((plane) => [plane.callsign, plane]),
    );

    for (const plane of planes) {
      dbPlane = dbPlanesMap.get(plane.callsign);
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
    let deletePromises = null;
    try {
      deletePromises = Array.from(dbPlanesMap.values()).map((dbPlane) =>
        this.slotServiceModel.deleteMany({ callsign: dbPlane.callsign }),
      );
      await Promise.all(deletePromises);
    } catch (error: any) {
      console.error(`Error removing unused planees from DB`);
    }
    dbPlanesMap = null;
    allPlanes = null;
    deletePromises = null;
  }

  async resetAirspacesToEobt(plane: DelayedPlane) {
    let previousTTOT = '';
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

    plane.taxi = 15;
    plane.tsat = '';
    plane.ctot = '';

    const newTTOT = this.helperService.addMinutesToTime(plane.eobt, plane.taxi);

    //Update airspace times
    plane.airspaces = await this.slotServiceService.moveTimesOfAirspace(
      plane.airspaces,
      newTTOT,
      previousTTOT,
    );

    return plane;
  }
}
