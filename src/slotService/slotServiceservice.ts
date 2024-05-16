import { Injectable } from '@nestjs/common';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { RouteService } from './route/route.service';
import { DelayedPlane } from './delayedPlanes/delayedPlane.model';
import { AirspaceAll } from './interface/airspaces-all.interface';
import { AirspaceCounter } from './interface/airspace-counter.interface';
import { AirspaceComplete } from './interface/airspace-complete.interface';

@Injectable()
export class SlotService {
  constructor(
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly routeService: RouteService,
  ) {}

  async processPlanes(planes: any[]): Promise<DelayedPlane[]> {
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
      console.log(`${plane.callsign} - (${counter}/${planes.length})`);
      counter = counter + 1;

      if (!flight_plan || flight_plan.flight_rules === 'V') {
        console.log(`Flightplan not available or VFR Flightplan, skipping`);
        continue;
      }

      const existingPlane = existingPlanes.find((existingPlane) => {
        return (
          existingPlane.callsign === plane.callsign &&
          existingPlane.departure === flight_plan.departure &&
          existingPlane.arrival === flight_plan.arrival &&
          existingPlane.eobt === flight_plan.deptime &&
          existingPlane.route === flight_plan.route
        );
      });

      if (existingPlane) {
        console.log(`Plane already fetched, skipping`);
        existingPlane.modify = false;
        delayedPlanes.push(existingPlane);
        continue;
      }
      //console.log(`Calculating route for ${plane.callsign}`);
      const myairspaces: AirspaceComplete[] =
        await this.routeService.calculateEntryExitTimes(
          `${flight_plan.departure} ${flight_plan.route} ${flight_plan.arrival}`,
          flight_plan.deptime,
          flight_plan.cruise_tas,
          waypoints,
          airways,
          airspaces,
        );

      const isAirbone = plane.groundspeed > 80;

      delayedPlanes.push({
        callsign: plane.callsign,
        departure: flight_plan.departure,
        arrival: flight_plan.arrival,
        eobt: flight_plan.deptime,
        ttot: '',
        ctot: '',
        delayTime: 0,
        mostPenalizingAirspace: '',
        reason: '',
        airspaces: myairspaces,
        isAirbone,
        route: flight_plan.route,
        modify: true,
      });
    }

    try {
      await this.delayedPlaneService.updatePlanes(delayedPlanes);
      console.log(`Data saved to DB`);
    } catch (error) {
      console.log(`ERROR saving to DB`, error);
    }

    return delayedPlanes;
  }

  async delayPlanes(planes: DelayedPlane[]): Promise<DelayedPlane[]> {
    const delayedPlanes: DelayedPlane[] = [];
    const airspaceAll: AirspaceAll[] = [];
    const increaseFreq = 5;

    let counter = 1;
    for (let plane of planes) {
      await new Promise((resolve) => setImmediate(resolve));
      console.log(`${plane.callsign} - (${counter}/${planes.length})`);
      counter = counter + 1;

      if (plane.ttot) {
        const diff =
          this.getTimeDifferenceInMinutes(plane.eobt, plane.ttot) - 15;
        if (diff !== 0) {
          for (let z = 0; z < plane.airspaces.length; z++) {
            plane.airspaces[z].entryTime = this.removeMinutesFromTime(
              plane.airspaces[z].entryTime,
              diff,
            );
            plane.airspaces[z].exitTime = this.removeMinutesFromTime(
              plane.airspaces[z].exitTime,
              diff,
            );
          }
        }
      }

      plane.ttot = this.addMinutesToTime(plane.eobt, 15);
      const previousTTOT = plane.ttot;

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
          if (plane.isAirbone) {
            console.log(`Skipping ${plane.callsign} is already airborne`);
            isOverloaded = false;
          } else {
            isOverloaded = true;
            console.log(
              `${plane.callsign} - Detected ${airspaceToFix.counter} planes over ${airspaceToFix.airspaceName}`,
            );
            plane.ttot = this.addMinutesToTime(plane.ttot, increaseFreq);
            for (let z = 0; z < plane.airspaces.length; z++) {
              plane.airspaces[z].entryTime = this.addMinutesToTime(
                plane.airspaces[z].entryTime,
                increaseFreq,
              );
              plane.airspaces[z].exitTime = this.addMinutesToTime(
                plane.airspaces[z].exitTime,
                increaseFreq,
              );
            }
            console.log(
              `${plane.callsign} - New CTOT ${plane.ttot} re-calculating...`,
            );
          }
        } else {
          isOverloaded = false;

          if (previousTTOT !== plane.ttot) {
            plane = this.modifyPlaneData(plane, plane.ttot, airspaceToFix);
            console.log(
              `${plane.callsign} - Is regulated over ${plane.mostPenalizingAirspace}, new CTOT ${plane.ctot}`,
            );
            delayedPlanes.push(plane);
          } else {
            plane = this.modifyPlaneData(plane, plane.ttot, null);
            //console.log(`${plane.callsign} - Is not regulated regulated`);
          }
        }
      }

      const airspaceAllElement: AirspaceAll = {
        airspaces: myairspaces,
      };

      airspaceAll.push(airspaceAllElement);

      /*console.log(
        `----------------- Finished processing ${plane.callsign} -----------------`,
      );*/
    }

    try {
      await this.delayedPlaneService.saveDelayedPlane(planes);
      console.log(`Data saved to DB`);
    } catch (error) {
      console.log(`ERROR saving to DB`, error);
    }

    return delayedPlanes;
  }

  private modifyPlaneData(
    plane: DelayedPlane,
    newdeptime: string,
    airspaceToFix: AirspaceCounter,
  ): DelayedPlane {
    plane.ttot = newdeptime;

    if (airspaceToFix === null) {
      plane.ctot = newdeptime;
      plane.delayTime = 0;
      plane.mostPenalizingAirspace = '';
      plane.reason = '';
    } else {
      plane.ctot = newdeptime;
      plane.delayTime = this.getDifCTOTandEOBT(newdeptime, plane.eobt);
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

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    let hours = parseInt(time.substring(0, 2));
    let minutes = parseInt(time.substring(2, 4));
    minutes += minutesToAdd;
    hours += Math.floor(minutes / 60);
    minutes %= 60;
    hours %= 24;
    const newHours = hours < 10 ? '0' + hours : hours.toString();
    const newMinutes = minutes < 10 ? '0' + minutes : minutes.toString();
    return `${newHours}${newMinutes}`;
  }

  private removeMinutesFromTime(time: string, minutesToRemove: number): string {
    let hours = parseInt(time.substring(0, 2));
    let minutes = parseInt(time.substring(2, 4));
    minutes -= minutesToRemove;
    if (minutes < 0) {
      hours -= Math.ceil(Math.abs(minutes) / 60);
      minutes = 60 + (minutes % 60);
    }
    if (hours < 0) {
      hours = 24 + (hours % 24);
    }
    const newHours = hours < 10 ? '0' + hours : hours.toString();
    const newMinutes = minutes < 10 ? '0' + minutes : minutes.toString();
    return `${newHours}${newMinutes}`;
  }

  private getTimeDifferenceInMinutes(time1: string, time2: string): number {
    const hours1 = parseInt(time1.substring(0, 2));
    const minutes1 = parseInt(time1.substring(2, 4));
    const hours2 = parseInt(time2.substring(0, 2));
    const minutes2 = parseInt(time2.substring(2, 4));
    const totalMinutes1 = hours1 * 60 + minutes1;
    const totalMinutes2 = hours2 * 60 + minutes2;
    return Math.abs(totalMinutes1 - totalMinutes2);
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
