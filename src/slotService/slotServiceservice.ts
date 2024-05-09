import { Injectable } from '@nestjs/common';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { AirspaceBase } from './interface/airspace-base.interface';
import { AirspaceAll } from './interface/airspaces-all.interface';
import { AirspaceCounter } from './interface/airspace-counter.interface';
import { AirspaceComplete } from './interface/airspace-complete.interface';
import { DelayedPlane } from './delayedPlanes/delayedPlane.model';

@Injectable()
export class SlotService {
  constructor(private readonly delayedPlaneService: DelayedPlaneService) {}

  async delayPlanes(planes: any[]): Promise<DelayedPlane[]> {
    const delayedPlanes: DelayedPlane[] = [];
    const airspaceAll: AirspaceAll[] = [];

    for (const plane of planes) {
      const { callsign, flight_plan } = plane;
      const delayedPlane = new DelayedPlane();

      console.log(`---------- This is the start of the log for ${callsign} ----------`);

      if (flight_plan == null || flight_plan.flight_rules == 'V') {
        console.log(`Flightplan not available or VFR Flightplan, skipping`);
        console.log(`----------------- Finshed processing ${callsign} -----------------`);
        continue;
      }

      let newdeptime = flight_plan.deptime;
      let isOverloaded = true;
      let myairspaces: AirspaceComplete[];
      const airspaceToFix: AirspaceCounter = {
        airspaceName: '',
        counter: 0,
      };

      while (isOverloaded) {
        const counterArray: AirspaceCounter[] = [];
        myairspaces = this.extractRouteObjectsFromRemarks(flight_plan.remarks, newdeptime);

        for (const myairspace of myairspaces) {
          console.log(`${callsign} - Airspace ${myairspace.airspace} -> ENTRY: ${myairspace.entryTime}, EXIT: ${myairspace.exitTime}`);
          let counter = 0;

          for (const au of airspaceAll) {
            for (const airspace of au.airspaces) {
              if (airspace.airspace == myairspace.airspace) {
                const entryTime1 = myairspace.entryTime;
                const exitTime1 = myairspace.exitTime;
                const entryTime2 = airspace.entryTime;
                const exitTime2 = airspace.exitTime;

                if (this.isBetweenEntryAndExit(entryTime1, exitTime1, entryTime2, exitTime2)) {
                  console.log(`${callsign} - Conflicts in ${airspace.airspace} with entry: ${entryTime2} and exit ${exitTime2} (counter: ${counter + 1} )`);
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
          const maxValue = 5;

          if (airspaceCounter.counter > maxValue) {
            if (airspaceCounter.counter - maxValue > airspaceToFix.counter) {
              airspaceToFix.counter = airspaceCounter.counter - maxValue;
              airspaceToFix.airspaceName = airspaceCounter.airspaceName;
            }
          }
        }

        if (airspaceToFix.counter > 0) {
            const now = new Date();
            const fifteenMinutes = 15 * 60 * 1000;
            const timedep = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(flight_plan.deptime.substring(0, 2)), parseInt(flight_plan.deptime.substring(2)));
            const fifteenMinutesFromNow = new Date(now.getTime() + fifteenMinutes);

            if (timedep.getTime() > fifteenMinutesFromNow.getTime()) {
            isOverloaded = false;
            console.log(`${callsign} - Skipping depTime ${timedep} is in the past`);
          } else {
            isOverloaded = true;
            console.log(`${callsign} - Detected ${airspaceToFix.counter} planes over ${airspaceToFix.airspaceName}`);
            newdeptime = this.addMinutesToTime(newdeptime, 1);
            console.log(`${callsign} - New CTOT ${newdeptime} re-calculating...`);
          }
        } else {
          isOverloaded = false;

          if (newdeptime != flight_plan.deptime) {
            delayedPlane.callsign = callsign;
            delayedPlane.departure = flight_plan.departure;
            delayedPlane.arrival = flight_plan.arrival;
            delayedPlane.eobt = flight_plan.deptime;
            delayedPlane.ctot = newdeptime;
            delayedPlane.delayTime = this.getDifCTOTandEOBT(newdeptime, flight_plan.deptime);
            delayedPlane.mostPenalizingAirspace = airspaceToFix.airspaceName;
            delayedPlane.reason = `${delayedPlane.mostPenalizingAirspace} capacity`;

            console.log(`${callsign} - Is regulated over ${delayedPlane.mostPenalizingAirspace}, new CTOT ${delayedPlane.ctot}`);

            await this.delayedPlaneService.saveDelayedPlane(delayedPlane);

            delayedPlanes.push(delayedPlane);

            try {
              await this.delayedPlaneService.saveDelayedPlane(delayedPlane);
              console.log(`${callsign} - saved to DB`);
            } catch (error) {
              console.log(`${callsign} - ERROR saving to DB`, error);
            }
          } else {
            console.log(`${callsign} - Is not regulated regulated`);
          }
        }
      }

      const airspaceAllElement: AirspaceAll = {
        airspaces: myairspaces,
      };

      airspaceAll.push(airspaceAllElement);

      console.log(`----------------- Finshed processing ${callsign} -----------------`);
    }

    delayedPlanes.sort((a, b) => a.mostPenalizingAirspace.localeCompare(b.mostPenalizingAirspace));

    return delayedPlanes;
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

    let previousExitTime = deptime;

    for (let i = 0; i < airportCodes.length; i++) {
      const code = airportCodes[i];
      const airspace = code.substring(0, 4);
      const entryTime = this.calculateEntryExitTime(
        code.substring(4),
        deptime,
      );

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

      previousExitTime = exitTime;
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
