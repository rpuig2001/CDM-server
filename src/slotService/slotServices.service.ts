import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { CadAirportService } from './cadAirport/cadAirport.service';
import { RouteService } from './route/route.service';
import { DelayedPlane } from './delayedPlanes/delayedPlane.model';
import { AirspaceAll } from './airspace/interface/airspaces-all.interface';
import { AirspaceCounter } from './airspace/interface/airspace-counter.interface';
import { AirspaceComplete } from './airspace/interface/airspace-complete.interface';
import { HelperService } from './helper/helper.service';
import { cadAirport } from './cadAirport/interface/cadAirport.interface';

@Injectable()
export class SlotService {
  constructor(
    @Inject(forwardRef(() => DelayedPlaneService))
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly routeService: RouteService,
    private readonly helperService: HelperService,
    private readonly cadAirportService: CadAirportService,
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

      const isAirborne = plane.groundspeed > 80;

      const existingPlane = existingPlanes.find((existingPlane) => {
        return (
          existingPlane.callsign === plane.callsign &&
          existingPlane.departure === flight_plan.departure &&
          existingPlane.arrival === flight_plan.arrival &&
          existingPlane.route === flight_plan.route
        );
      });

      if (existingPlane) {
        if (isAirborne == true && existingPlane.atot == '') {
          //Set automatically airbone
          //console.log(`${existingPlane.callsign} just departed, updating`);
          existingPlane.atot = this.helperService.getCurrentUTCTime();
          existingPlane.modify = true;

          let recalculateAirspaces = false;
          /* Recalculate Airspaces only if CTOT exists and diff between timeNow and CTOT > 15 */
          if (existingPlane.ctot != '') {
            if (
              this.helperService.getTimeDifferenceInMinutes(
                this.helperService.getCurrentUTCTime(),
                existingPlane.ctot,
              ) > 15
            ) {
              recalculateAirspaces = true;
            }
          } else {
            recalculateAirspaces = true;
          }

          if (recalculateAirspaces) {
            let previousTTOT = this.helperService.addMinutesToTime(
              existingPlane.eobt,
              existingPlane.taxi,
            );

            if (existingPlane.ctot != '') {
              previousTTOT = existingPlane.ctot;
            }

            const actualTTOT = this.helperService.getCurrentUTCTime();
            existingPlane.airspaces = await this.moveTimesOfAirspace(
              existingPlane.airspaces,
              actualTTOT,
              previousTTOT,
            );
          }

          delayedPlanes.push(existingPlane);
          continue;
        } else {
          if (existingPlane.cdm) {
            //console.log(`Plane controlled by CDM, skipping`);
            existingPlane.modify = false;
            delayedPlanes.push(existingPlane);
            continue;
          } else {
            //Check if new EOBT sent by the pilot
            if (
              isAirborne == false &&
              existingPlane.cdm == false &&
              existingPlane.eobt != flight_plan.deptime
            ) {
              //console.log(`Plane already fetched, updating EOBT as filed (${existingPlane.eobt} - ${plane.eobt})`);
              existingPlane.modify = true;
              existingPlane.eobt = flight_plan.deptime;
            } else {
              //console.log(`Plane already fetched, skipping`);
              existingPlane.modify = false;
            }
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

      // Sorting function
      myairspaces.sort((a, b) => {
        if (
          this.helperService.isTime1GreaterThanTime2(a.entryTime, b.entryTime)
        ) {
          return 1;
        } else if (
          this.helperService.isTime1GreaterThanTime2(b.entryTime, a.entryTime)
        ) {
          return -1;
        } else {
          return 0;
        }
      });

      let myAtot = '';
      if (isAirborne) {
        myAtot = this.helperService.getCurrentUTCTime();
      }

      delayedPlanes.push({
        callsign: plane.callsign,
        departure: flight_plan.departure,
        arrival: flight_plan.arrival,
        eobt: flight_plan.deptime,
        tsat: '',
        ctot: '',
        atot: myAtot,
        taxi: 15,
        mostPenalizingAirspace: '',
        reason: '',
        airspaces: myairspaces,
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
      if (foundPlane.callsign == callsign) {
        return airspaceAll;
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

  async getAirportRate(airport: string, airports: cadAirport[]) {
    for (const apt of airports) {
      if (apt.icao == airport) {
        return apt.rate;
      }
    }
    return 30;
  }

  async calculatePlaneDestination(
    initialPlane: DelayedPlane,
    planes: DelayedPlane[],
    cadAirports: cadAirport[],
    calcPlane: DelayedPlane,
    tempTTOT: string,
  ): Promise<DelayedPlane> {
    let delayTime = 0;
    if (initialPlane.airspaces.length > 0) {
      const initialArrivalTime =
        initialPlane.airspaces[initialPlane.airspaces.length - 1].exitTime;
      const rate = await this.getAirportRate(calcPlane.arrival, cadAirports);

      let arrivalTime = initialArrivalTime;
      let checked = false;

      while (!checked) {
        let doNotCheckMore = false;
        checked = true;
        for (const p of planes) {
          if (p.airspaces.length > 0) {
            if (p.callsign == calcPlane.callsign) {
              doNotCheckMore = true;
            }

            if (p.arrival == calcPlane.arrival && !doNotCheckMore) {
              const otherArrivalTime =
                p.airspaces[p.airspaces.length - 1].exitTime;

              if (
                this.helperService.getTimeDifferenceInMinutes(
                  arrivalTime,
                  otherArrivalTime,
                ) < Math.floor(60 / rate)
              ) {
                arrivalTime = this.helperService.addMinutesToTime(
                  otherArrivalTime,
                  Math.floor(60 / rate),
                );
                /*console.log(
                  `${calcPlane.callsign} using arrivalTime: ${initialArrivalTime} / new arrivalTime ${arrivalTime}`,
                );*/
                /*console.log(
                  `${calcPlane.callsign} conflicts with ${p.callsign} which lands at ${otherArrivalTime} (Rate ${rate})`,
                );*/
                checked = false;
              }
            }
          }
        }
      }

      delayTime = this.helperService.getTimeDifferenceInMinutes(
        initialArrivalTime,
        arrivalTime,
      );
    }

    const possibleCTOTdueArrival = this.helperService.addMinutesToTime(
      tempTTOT,
      delayTime,
    );

    if (calcPlane.ctot != '' && delayTime > 0) {
      if (
        this.helperService.isTime1GreaterThanTime2(
          possibleCTOTdueArrival,
          calcPlane.ctot,
        )
      ) {
        calcPlane.airspaces = await this.moveTimesOfAirspace(
          initialPlane.airspaces,
          possibleCTOTdueArrival,
          tempTTOT,
        );
        calcPlane.ctot = possibleCTOTdueArrival;
        calcPlane.mostPenalizingAirspace = calcPlane.arrival;
        calcPlane.reason = calcPlane.arrival + ' Aerodrome Capacity';
        console.log(
          `${calcPlane.callsign} new CTOT ${calcPlane.ctot} due to arrival airport (${calcPlane.arrival})`,
        );
      }
    } else if (delayTime > 0) {
      //Recalculate airspaces and make diffDueToArrival a CTOT valid
      calcPlane.airspaces = await this.moveTimesOfAirspace(
        initialPlane.airspaces,
        possibleCTOTdueArrival,
        tempTTOT,
      );
      calcPlane.ctot = possibleCTOTdueArrival;
      calcPlane.mostPenalizingAirspace = calcPlane.arrival;
      calcPlane.reason = calcPlane.arrival + ' Aerodrome Capacity';
      console.log(
        `${calcPlane.callsign} new CTOT due to arrival airport (${calcPlane.arrival}) - ${calcPlane.ctot}`,
      );
    }
    return calcPlane;
  }

  async delayPlanes(planes: DelayedPlane[]): Promise<DelayedPlane[]> {
    const delayedPlanes: DelayedPlane[] = [];
    const airspaceAll: AirspaceAll[] = [];
    const cadAirports: cadAirport[] =
      await this.cadAirportService.getAirports();

    console.log(`Calculating ${planes.length} planes`);

    let counter = 1;
    for (let plane of planes) {
      await new Promise((resolve) => setImmediate(resolve));
      //console.log(`${plane.callsign} - (${counter}/${planes.length})`);
      counter = counter + 1;

      if (plane.atot != '') {
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

        let calcPlane = await this.calculatePlane(plane, tempTTOT, airspaceAll);

        calcPlane = await this.calculatePlaneDestination(
          plane,
          planes,
          cadAirports,
          calcPlane,
          tempTTOT,
        );

        plane = await this.makeCTOTvalid(calcPlane, plane);

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

  async makeCTOTvalid(
    calcPlane: DelayedPlane,
    plane: DelayedPlane,
  ): Promise<DelayedPlane> {
    /*Making CTOT valid if:
        1. existing ctot > new ctot (only if CTOT exists already).
        2. (new CTOT - taxiTime) > timeNow.
        3. (newCTOT - taxiTime) and timeNow diff is > 5.
        */
    if (calcPlane.ctot != '' && plane.ctot != '') {
      if (
        this.helperService.isTime1GreaterThanTime2(plane.ctot, calcPlane.ctot)
      ) {
        if (
          this.helperService.isTime1GreaterThanTime2(
            calcPlane.ctot,
            this.helperService.getCurrentUTCTime(),
          ) &&
          this.helperService.getTimeDifferenceInMinutes(
            this.helperService.getCurrentUTCTime(),
            calcPlane.ctot,
          ) > 5
        ) {
          plane = calcPlane;
        }
      }
    } else if (calcPlane.ctot != '') {
      if (
        this.helperService.isTime1GreaterThanTime2(
          this.helperService.removeMinutesFromTime(
            calcPlane.ctot,
            calcPlane.taxi,
          ),
          this.helperService.getCurrentUTCTime(),
        ) &&
        this.helperService.getTimeDifferenceInMinutes(
          this.helperService.getCurrentUTCTime(),
          this.helperService.removeMinutesFromTime(
            calcPlane.ctot,
            calcPlane.taxi,
          ),
        ) > 5
      ) {
        plane = calcPlane;
      }
    }
    return plane;
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
      plane.mostPenalizingAirspace = '';
      plane.reason = '';
    } else {
      plane.ctot = newdeptime;
      plane.mostPenalizingAirspace = airspaceToFix.airspaceName;
      plane.reason = `${plane.mostPenalizingAirspace} Airspace Capacity`;
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
