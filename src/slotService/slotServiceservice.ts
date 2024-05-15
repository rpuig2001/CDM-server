import { Injectable } from '@nestjs/common';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { AirspaceAll } from './interface/airspaces-all.interface';
import { AirspaceCounter } from './interface/airspace-counter.interface';
import { AirspaceComplete } from './interface/airspace-complete.interface';
import { DelayedPlane } from './delayedPlanes/delayedPlane.model';
import { AirspaceCapacity } from './airspaceCapacity/airspaceCapacity.model';
import { RouteService } from './route/route.service';

@Injectable()
export class SlotService {
  constructor(
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly routeService: RouteService,
  ) {}

  async processPlanes(planes: any[]): Promise<DelayedPlane[]> {
    const delayedPlanes: DelayedPlane[] = [];
    const waypoints = await this.routeService.getWaypoints();
    const airways = await this.routeService.getAirways();
    const airspaces = await this.routeService.getAirspaces();

    for (const plane of planes) {
      const { flight_plan } = plane;

      if (flight_plan == null || flight_plan.flight_rules == 'V') {
        console.log(`Flightplan not available or VFR Flightplan, skipping`);
        continue;
      }
      console.log(`Calculating route for ${plane.callsign}`);
      let myairspaces: AirspaceComplete[] = [];
      myairspaces = await this.routeService.calculateEntryExitTimes(
        flight_plan.departure +
          ' ' +
          flight_plan.route +
          ' ' +
          flight_plan.arrival,
        flight_plan.deptime,
        flight_plan.cruise_tas,
        waypoints,
        airways,
        airspaces,
      );
      console.log(`Finished calculation`);

      let isAirbone = false;
      if (plane.groundspeed > 80) {
        isAirbone = true;
      }

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
        isAirbone: isAirbone,
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

    const airspacesCapacity: AirspaceCapacity[] = [
      { name: 'LECB', value: 10 },
      { name: 'LECM', value: 10 },
      { name: 'LECB-N', value: 4 },
    ];

    for (let plane of planes) {
      console.log(
        `---------- This is the start of the log for ${plane.callsign} ----------`,
      );

      if (plane.ttot != '') {
        const diff =
          this.getTimeDifferenceInMinutes(plane.eobt, plane.ttot) - 15;
        //Recalculate airspaces times
        if (diff != 0) {
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
        counter: 0,
      };

      while (isOverloaded) {
        const counterArray: AirspaceCounter[] = [];

        for (const myairspace of myairspaces) {
          console.log(
            `${plane.callsign} - Airspace ${myairspace.airspace} -> ENTRY: ${myairspace.entryTime}, EXIT: ${myairspace.exitTime}`,
          );
          let counter = 0;

          for (const au of airspaceAll) {
            for (const airspace of au.airspaces) {
              if (airspace.airspace == myairspace.airspace) {
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
                  console.log(
                    `${plane.callsign} - Conflicts in ${airspace.airspace} with entry: ${entryTime2} and exit ${exitTime2} (counter: ${counter + 1} )`,
                  );
                  counter++;
                }
              }
            }
          }

          const counterObj: AirspaceCounter = {
            airspaceName: myairspace.airspace,
            counter: counter,
          };
          counterArray.push(counterObj);
        }

        airspaceToFix.counter = 0;

        for (const airspaceCounter of counterArray) {
          const airspaceCapacity = airspacesCapacity.find(
            (airspace) => airspace.name === airspaceCounter.airspaceName,
          );

          //Defining maxValue defining to default value
          let maxValue = 10;

          if (airspaceCapacity) {
            maxValue = airspaceCapacity.value;
          }

          if (airspaceCounter.counter > maxValue) {
            if (airspaceCounter.counter - maxValue > airspaceToFix.counter) {
              airspaceToFix.counter = airspaceCounter.counter - maxValue;
              airspaceToFix.airspaceName = airspaceCounter.airspaceName;
            }
          }
        }

        if (airspaceToFix.counter > 0) {
          if (plane.isAirbone) {
            console.log(`Skipping ${plane.callsign} is already airbone`);
            isOverloaded = false;
          } else {
            isOverloaded = true;
            console.log(
              `${plane.callsign} - Detected ${airspaceToFix.counter} planes over ${airspaceToFix.airspaceName}`,
            );
            plane.ttot = this.addMinutesToTime(plane.ttot, 1);
            for (let z = 0; z < plane.airspaces.length; z++) {
              plane.airspaces[z].entryTime = this.addMinutesToTime(
                plane.airspaces[z].entryTime,
                1,
              );
              plane.airspaces[z].exitTime = this.addMinutesToTime(
                plane.airspaces[z].exitTime,
                1,
              );
            }
            console.log(
              `${plane.callsign} - New CTOT ${plane.ttot} re-calculating...`,
            );
          }
        } else {
          isOverloaded = false;

          if (previousTTOT != plane.ttot) {
            plane = this.modifyPlaneData(plane, plane.ttot, airspaceToFix);
            console.log(
              `${plane.callsign} - Is regulated over ${plane.mostPenalizingAirspace}, new CTOT ${plane.ctot}`,
            );
            delayedPlanes.push(plane);
          } else {
            console.log(`${plane.callsign} - Is not regulated regulated`);
          }
        }
      }

      const airspaceAllElement: AirspaceAll = {
        airspaces: myairspaces,
      };

      airspaceAll.push(airspaceAllElement);

      console.log(
        `----------------- Finshed processing ${plane.callsign} -----------------`,
      );
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
    plane.ctot = newdeptime;
    plane.delayTime = this.getDifCTOTandEOBT(newdeptime, plane.eobt);
    plane.mostPenalizingAirspace = airspaceToFix.airspaceName;
    plane.reason = `${plane.mostPenalizingAirspace} capacity`;
    return plane;
  }

  private getDifCTOTandEOBT(ctot: string, eobt: string): number {
    // Extract hours and minutes from the strings
    const ctotHours = parseInt(ctot.substring(0, 2));
    const ctotMinutes = parseInt(ctot.substring(2));
    const eobtHours = parseInt(eobt.substring(0, 2));
    const eobtMinutes = parseInt(eobt.substring(2));

    // Convert times to minutes
    const ctotTotalMinutes = ctotHours * 60 + ctotMinutes;
    const eobtTotalMinutes = eobtHours * 60 + eobtMinutes;

    // Calculate the difference in minutes
    const diffMinutes = ctotTotalMinutes - eobtTotalMinutes;

    return diffMinutes;
  }

  private extractRouteObjectsFromRemarks(
    remarks: string,
    deptime: string,
  ): AirspaceComplete[] {
    const eetIndex: number = remarks.indexOf('EET/');
    const routePart: string = remarks.substring(eetIndex + 4);
    const parts: string[] = routePart.split(' ');
    const airportCodes: string[] = parts.filter((elem) =>
      /^[A-Z]{4}\d{4}$/.test(elem),
    );

    const objects: AirspaceComplete[] = [];

    for (let i = 0; i < airportCodes.length; i++) {
      const code = airportCodes[i];
      const airspace = code.substring(0, 4);
      const entryTime = this.calculateEntryExitTime(code.substring(4), deptime);

      let exitTime = deptime;

      if (i < airportCodes.length - 1) {
        exitTime = this.calculateEntryExitTime(
          airportCodes[i + 1].substring(4),
          deptime,
        );
      } else {
        exitTime = this.addMinutesToTime(entryTime, 10);
      }

      objects.push({
        airspace,
        entryTime,
        exitTime,
      });
    }

    return objects;
  }

  private calculateEntryExitTime(
    givenArrTime: string,
    timeDep: string,
  ): string {
    const givenHours = parseInt(givenArrTime.substring(0, 2));
    const givenMinutes = parseInt(givenArrTime.substring(2, 4));
    const depHours = parseInt(timeDep.substring(0, 2));
    const depMinutes = parseInt(timeDep.substring(2, 4));
    let totalHours = givenHours + depHours;
    let totalMinutes = givenMinutes + depMinutes;
    if (totalMinutes >= 60) {
      totalHours += Math.floor(totalMinutes / 60);
      totalMinutes = totalMinutes % 60;
    }
    totalHours = totalHours % 24;
    const formattedHours = totalHours < 10 ? '0' + totalHours : totalHours;
    const formattedMinutes =
      totalMinutes < 10 ? '0' + totalMinutes : totalMinutes;
    return `${formattedHours}${formattedMinutes}`;
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    let hours = parseInt(time.substring(0, 2));
    let minutes = parseInt(time.substring(2, 4));
    minutes += minutesToAdd;
    if (minutes >= 60) {
      hours += Math.floor(minutes / 60);
      minutes = minutes % 60;
    }
    hours = hours % 24;
    const newEntryHours = hours < 10 ? '0' + hours : hours;
    const newEntryMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${newEntryHours}${newEntryMinutes}`;
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
    const newEntryHours = hours < 10 ? '0' + hours : hours;
    const newEntryMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${newEntryHours}${newEntryMinutes}`;
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
