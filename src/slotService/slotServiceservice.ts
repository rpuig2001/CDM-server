import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { RouteService } from './route/route.service';
import { DelayedPlane } from './delayedPlanes/delayedPlane.model';
import { AirspaceAll } from './airspace/interface/airspaces-all.interface';
import { AirspaceCounter } from './airspace/interface/airspace-counter.interface';
import { AirspaceComplete } from './airspace/interface/airspace-complete.interface';
import { HelperService } from './helper/helper.service';

@Injectable()
export class SlotService {
  constructor(
    @Inject(forwardRef(() => DelayedPlaneService))
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly routeService: RouteService,
    private readonly helperService: HelperService,
  ) {}

  async processPlanes(planes: any[]): Promise<DelayedPlane[]> {
    console.log(`Processing ${planes.length} planes`);
    const delayedPlanes: DelayedPlane[] = [];
    const [waypoints, airways, airspaces, existingPlanes] = await Promise.all([
      this.routeService.getWaypoints(),
      this.routeService.getAirways(),
      this.routeService.getAirspaces(),
      this.delayedPlaneService.getAllDelayedPlanes(),
    ]);

    let counter = 1;
    for (const plane of planes) {
      await new Promise((resolve) => setImmediate(resolve));
      const { flight_plan } = plane;
      //console.log(`${plane.callsign} - (${counter}/${planes.length})`);
      counter = counter + 1;

      if (!flight_plan || flight_plan.flight_rules === 'V') {
        //console.log(`Flightplan not available or VFR Flightplan, skipping`);
        continue;
      }

      const isAirbone = plane.groundspeed > 80;

      const existingPlane = existingPlanes.find((existingPlane) => {
        return (
          existingPlane.callsign === plane.callsign &&
          existingPlane.departure === flight_plan.departure &&
          existingPlane.arrival === flight_plan.arrival &&
          existingPlane.route === flight_plan.route
        );
      });

      if (existingPlane) {
        if (isAirbone == true && existingPlane.isAirbone != true) {
          //Set automatically airbone
          //console.log(`${existingPlane.callsign} just departed, updating`);
          existingPlane.isAirbone = true;
          existingPlane.modify = true;
          const previousTTOT = this.helperService.addMinutesToTime(
            existingPlane.eobt,
            existingPlane.taxi,
          );
          if (!existingPlane.cdm) {
            existingPlane.eobt = this.helperService.removeMinutesFromTime(
              this.helperService.getCurrentUTCTime(),
              existingPlane.taxi,
            );
          }
          const actualTTOT = this.helperService.addMinutesToTime(
            existingPlane.eobt,
            existingPlane.taxi,
          );
          existingPlane.airspaces = await this.moveTimesOfAirspace(
            existingPlane.airspaces,
            actualTTOT,
            previousTTOT,
          );
          delayedPlanes.push(existingPlane);
          continue;
        } else {
          if (existingPlane.cdm) {
            //console.log(`Plane controlled by CDM, skipping`);
            existingPlane.modify = false;
            delayedPlanes.push(existingPlane);
            continue;
          } else {
            //console.log(`Plane already fetched, skipping`);
            existingPlane.modify = false;
            delayedPlanes.push(existingPlane);
            continue;
          }
        }
      }

      //console.log(`Calculating route for ${plane.callsign}`);
      const myairspaces: AirspaceComplete[] =
        await this.routeService.calculateEntryExitTimes(
          `${flight_plan.departure} ${flight_plan.route} ${flight_plan.arrival}`,
          this.helperService.addMinutesToTime(flight_plan.deptime, 15),
          flight_plan.cruise_tas,
          waypoints,
          airways,
          airspaces,
        );

      delayedPlanes.push({
        callsign: plane.callsign,
        departure: flight_plan.departure,
        arrival: flight_plan.arrival,
        eobt: flight_plan.deptime,
        tsat: '',
        ctot: '',
        taxi: 15,
        delayTime: 0,
        mostPenalizingAirspace: '',
        reason: '',
        airspaces: myairspaces,
        isAirbone,
        route: flight_plan.route,
        modify: true,
        cdm: false,
      });
    }

    try {
      await this.delayedPlaneService.updatePlanes(delayedPlanes);
      console.log(`Processed data saved to DB`);
    } catch (error) {
      console.log(`ERROR saving to DB`, error);
    }

    return delayedPlanes;
  }

  async getAirspacesWorkload(callsign: string): Promise<AirspaceAll[]> {
    const planes = await this.delayedPlaneService.getAllDelayedPlanes();
    const airspaceAll: AirspaceAll[] = [];

    for (const foundPlane of planes) {
      if (foundPlane.callsign != callsign || callsign == '') {
        airspaceAll.push({
          airspaces: foundPlane.airspaces,
        });
      }
    }
    return airspaceAll;
  }

  async calculatePlane(
    plane: DelayedPlane,
    tempTTOT: string,
    airspaceAll: AirspaceAll[],
  ): Promise<DelayedPlane> {
    const increaseFreq = 5;

    let newTakeOffTime = tempTTOT;
    const previousTakeOffTime = newTakeOffTime;

    let isOverloaded = true;
    const myairspaces: AirspaceComplete[] = plane.airspaces;
    const airspaceToFix: AirspaceCounter = {
      airspaceName: '',
      airspaceCapacity: null,
      counter: 0,
    };

    while (isOverloaded) {
      await new Promise((resolve) => setImmediate(resolve));
      const counterArray: AirspaceCounter[] = [];

      for (const myairspace of myairspaces) {
        /*console.log(
            `${plane.callsign} - Airspace ${myairspace.airspace} -> ENTRY: ${myairspace.entryTime}, EXIT: ${myairspace.exitTime}`,
          );*/
        let counter = 0;

        for (const au of airspaceAll) {
          for (const airspace of au.airspaces) {
            if (airspace.airspace === myairspace.airspace) {
              const entryTime1 = myairspace.entryTime;
              const exitTime1 = myairspace.exitTime;
              const entryTime2 = airspace.entryTime;
              const exitTime2 = airspace.exitTime;

              if (
                this.isBetweenEntryAndExit(
                  entryTime1,
                  exitTime1,
                  entryTime2,
                  exitTime2,
                )
              ) {
                /*console.log(
                    `${plane.callsign} - Conflicts in ${airspace.airspace} with entry: ${entryTime2} and exit ${exitTime2} (counter: ${counter + 1} )`,
                  );*/
                counter++;
              }
            }
          }
        }

        const counterObj: AirspaceCounter = {
          airspaceName: myairspace.airspace,
          airspaceCapacity: myairspace.capacity,
          counter,
        };
        counterArray.push(counterObj);
      }

      airspaceToFix.counter = 0;

      for (const airspaceCounter of counterArray) {
        if (airspaceCounter.counter > airspaceCounter.airspaceCapacity) {
          if (
            airspaceCounter.counter - airspaceCounter.airspaceCapacity >
            airspaceToFix.counter
          ) {
            airspaceToFix.counter =
              airspaceCounter.counter - airspaceCounter.airspaceCapacity;
            airspaceToFix.airspaceName = airspaceCounter.airspaceName;
          }
        }
      }

      if (airspaceToFix.counter > 0) {
        isOverloaded = true;
        /*console.log(
          `${plane.callsign} - Detected ${airspaceToFix.counter} planes over ${airspaceToFix.airspaceName}`,
        );*/
        newTakeOffTime = this.helperService.addMinutesToTime(
          newTakeOffTime,
          increaseFreq,
        );
        for (let z = 0; z < plane.airspaces.length; z++) {
          plane.airspaces[z].entryTime = this.helperService.addMinutesToTime(
            plane.airspaces[z].entryTime,
            increaseFreq,
          );
          plane.airspaces[z].exitTime = this.helperService.addMinutesToTime(
            plane.airspaces[z].exitTime,
            increaseFreq,
          );
        }
        console.log(
          `${plane.callsign} - New CTOT ${newTakeOffTime} re-calculating...`,
        );
      } else {
        isOverloaded = false;

        if (previousTakeOffTime !== newTakeOffTime) {
          plane = this.modifyPlaneData(plane, newTakeOffTime, airspaceToFix);
          /*console.log(
            `${plane.callsign} - Is regulated over ${plane.mostPenalizingAirspace}, new CTOT ${plane.ctot}`,
          );*/
        } else {
          plane = this.modifyPlaneData(plane, newTakeOffTime, null);
          //console.log(`${plane.callsign} - Is not regulated regulated`);
        }
      }
    }
    return plane;
  }

  async delayPlanes(planes: DelayedPlane[]): Promise<DelayedPlane[]> {
    const delayedPlanes: DelayedPlane[] = [];
    const airspaceAll: AirspaceAll[] = [];

    console.log(`Calculating ${planes.length} planes`);

    let counter = 1;
    for (let plane of planes) {
      await new Promise((resolve) => setImmediate(resolve));
      //console.log(`${plane.callsign} - (${counter}/${planes.length})`);
      counter = counter + 1;

      if (plane.isAirbone) {
        //console.log(`Skipping ${plane.callsign} is already airborne`);
        airspaceAll.push({
          airspaces: plane.airspaces,
        });
      } else {
        let tempTTOT = this.helperService.addMinutesToTime(
          plane.eobt,
          plane.taxi,
        );
        if (plane.tsat != '') {
          tempTTOT = this.helperService.addMinutesToTime(
            plane.tsat,
            plane.taxi,
          );
        }
        if (plane.ctot != '') {
          const diff = this.helperService.getTimeDifferenceInMinutes(
            tempTTOT,
            plane.ctot,
          );
          if (diff !== 0) {
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
        }

        plane = await this.calculatePlane(plane, tempTTOT, airspaceAll);

        const airspaceAllElement: AirspaceAll = {
          airspaces: plane.airspaces,
        };

        airspaceAll.push(airspaceAllElement);

        /*console.log(
        `----------------- Finished processing ${plane.callsign} -----------------`,
      );*/
      }
    }

    try {
      await this.delayedPlaneService.saveDelayedPlane(planes);
      console.log(`Calculation data saved to DB`);
    } catch (error) {
      console.log(`ERROR saving to DB`, error);
    }

    return delayedPlanes;
  }

  async moveTimesOfAirspace(
    airspaces: AirspaceComplete[],
    actualTTOT: string,
    previousTTOT: string,
  ): Promise<AirspaceComplete[]> {
    const diff = this.helperService.getTimeDifferenceInMinutes(
      previousTTOT,
      actualTTOT,
    );

    if (this.helperService.isTime1GreaterThanTime2(actualTTOT, previousTTOT)) {
      for (let z = 0; z < airspaces.length; z++) {
        airspaces[z].entryTime = this.helperService.addMinutesToTime(
          airspaces[z].entryTime,
          diff,
        );
        airspaces[z].exitTime = this.helperService.addMinutesToTime(
          airspaces[z].exitTime,
          diff,
        );
      }
    } else if (diff != 0) {
      for (let z = 0; z < airspaces.length; z++) {
        airspaces[z].entryTime = this.helperService.removeMinutesFromTime(
          airspaces[z].entryTime,
          diff,
        );
        airspaces[z].exitTime = this.helperService.removeMinutesFromTime(
          airspaces[z].exitTime,
          diff,
        );
      }
    }
    return airspaces;
  }

  private modifyPlaneData(
    plane: DelayedPlane,
    newdeptime: string,
    airspaceToFix: AirspaceCounter,
  ): DelayedPlane {
    if (airspaceToFix === null) {
      plane.ctot = '';
      plane.delayTime = 0;
      plane.mostPenalizingAirspace = '';
      plane.reason = '';
    } else {
      plane.ctot = newdeptime;
      plane.delayTime = this.getDifCTOTandEOBT(
        newdeptime,
        this.helperService.addMinutesToTime(plane.eobt, plane.taxi),
      );
      plane.mostPenalizingAirspace = airspaceToFix.airspaceName;
      plane.reason = `${plane.mostPenalizingAirspace} capacity`;
    }
    return plane;
  }

  private getDifCTOTandEOBT(ctot: string, eobt: string): number {
    const ctotHours = parseInt(ctot.substring(0, 2));
    const ctotMinutes = parseInt(ctot.substring(2));
    const eobtHours = parseInt(eobt.substring(0, 2));
    const eobtMinutes = parseInt(eobt.substring(2));

    const ctotTotalMinutes = ctotHours * 60 + ctotMinutes;
    const eobtTotalMinutes = eobtHours * 60 + eobtMinutes;

    return ctotTotalMinutes - eobtTotalMinutes;
  }

  private isBetweenEntryAndExit(
    entryTime1: string,
    exitTime1: string,
    entryTime2: string,
    exitTime2: string,
  ): boolean {
    const entryTime1Minutes = this.getMinutes(entryTime1);
    const exitTime1Minutes = this.getMinutes(exitTime1);
    const entryTime2Minutes = this.getMinutes(entryTime2);
    const exitTime2Minutes = this.getMinutes(exitTime2);
    return (
      entryTime2Minutes >= entryTime1Minutes &&
      exitTime2Minutes <= exitTime1Minutes
    );
  }

  private getMinutes(time: string): number {
    const hours = parseInt(time.substring(0, 2));
    const minutes = parseInt(time.substring(2, 4));
    return hours * 60 + minutes;
  }
}
