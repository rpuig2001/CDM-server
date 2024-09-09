import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { DelayedPlaneService } from './delayedPlanes/delayedPlane.service';
import { CadAirportService } from './cadAirport/cadAirport.service';
import { RouteService } from './route/route.service';
import { DelayedPlane } from './delayedPlanes/delayedPlane.model';
import { AirspaceAll } from './airspace/interface/airspaces-all.interface';
import { AirspaceCounter } from './airspace/interface/airspace-counter.interface';
import { AirspaceComplete } from './airspace/interface/airspace-complete.interface';
import { HelperService } from './helper/helper.service';
import { RestrictionService } from './restriction/restriction.service';
import { cadAirport } from './cadAirport/interface/cadAirport.interface';

@Injectable()
export class SlotService {
  constructor(
    @Inject(forwardRef(() => DelayedPlaneService))
    private readonly delayedPlaneService: DelayedPlaneService,
    private readonly routeService: RouteService,
    private readonly helperService: HelperService,
    private readonly cadAirportService: CadAirportService,
    private readonly restrictionService: RestrictionService,
  ) {}

  async processPlanes(planes: any[]): Promise<DelayedPlane[]> {
    console.log(`Processing ${planes.length} planes`);
    const delayedPlanes: DelayedPlane[] = [];
    let [waypoints, airways, airspaces, existingPlanes, restrictions] =
      await Promise.all([
        await this.routeService.getWaypoints(),
        await this.routeService.getAirways(),
        await this.routeService.getAirspaces(),
        await this.delayedPlaneService.getAllDelayedPlanes(),
        await this.restrictionService.getRestrictions(),
      ]);

    //Check Schengen DEP or DEST
    // eslint-disable-next-line prettier/prettier
    const schengenArea = ['BI','EB','ED','EE','EF','EH','EK','EL','EN','EP','ES','ET','EV','EY','GC','LE','LF','LG','LC','LH','LI','LJ','LK','LM','LO','LP','LS','LZ','LD','LT','DA','DC','GM',];
    let isSchengen = null;
    let isAirborne = false;
    let existingPlane = null;
    let myairspaces: AirspaceComplete[] = null;
    let myAtot = '';
    let previousTTOT = '';
    let actualTTOT = '';

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
      isSchengen = schengenArea.find((countryCode) => {
        return (
          countryCode === flight_plan.departure.substring(0, 2) ||
          countryCode === flight_plan.arrival.substring(0, 2)
        );
      });
      if (!isSchengen) {
        //console.log(`Flightplan does not depart/land in schengen area, skipping`);
        continue;
      }

      isAirborne = plane.groundspeed > 80;

      existingPlane = null;
      existingPlane = existingPlanes.find((existingPlane) => {
        return existingPlane.callsign === plane.callsign;
      });

      if (existingPlane) {
        const modifiedPlaneFound = existingPlanes.find((existingPlane) => {
          return (
            existingPlane.callsign === plane.callsign &&
            existingPlane.departure === flight_plan.departure &&
            existingPlane.arrival === flight_plan.arrival &&
            existingPlane.route === flight_plan.route
          );
        });

        if (!modifiedPlaneFound) {
          await this.delayedPlaneService.deletePlane(existingPlane.callsign);
          existingPlane = null;
        }
      }

      if (existingPlane) {
        if (isAirborne == true && existingPlane.atot == '') {
          //Set automatically airbone
          //console.log(`${existingPlane.callsign} just departed, updating`);
          existingPlane.atot = this.helperService.getCurrentUTCTime();
          existingPlane.cdmSts = '';
          existingPlane.modify = true;

          /* Recalculate Airspaces Start */
          previousTTOT = this.helperService.addMinutesToTime(
            existingPlane.eobt,
            existingPlane.taxi,
          );

          if (existingPlane.ctot != '') {
            previousTTOT = existingPlane.ctot;
          }

          actualTTOT = this.helperService.getCurrentUTCTime();
          existingPlane.airspaces = await this.moveTimesOfAirspace(
            existingPlane.airspaces,
            actualTTOT,
            previousTTOT,
          );
          /* Recalculate Airspaces End */

          delayedPlanes.push(existingPlane);
          continue;
        } else if (existingPlane.tsat != '') {
          //console.log(`Plane controlled by CDM, skipping`);
          existingPlane.modify = false;
          delayedPlanes.push(existingPlane);
          continue;
        } else {
          //Check if new EOBT sent by the pilot
          if (
            isAirborne == false &&
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

      myairspaces = await this.routeService.calculateEntryExitTimes(
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

      myAtot = '';
      if (isAirborne) {
        myAtot = this.helperService.getCurrentUTCTime();
      }

      for (const a of myairspaces) {
        for (const r of restrictions) {
          if (a.airspace == r.airspace) {
            a.capacity = r.capacity;
            a.reason = r.reason;
          }
        }
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
        airspaces: myairspaces,
        route: flight_plan.route,
        modify: true,
        cdmSts: '',
      });
    }

    try {
      await this.delayedPlaneService.updatePlanes(delayedPlanes);
      console.log(`Processed data saved to DB`);
    } catch (error) {
      console.log(`ERROR saving to DB`, error);
    }

    planes = null;
    waypoints = null;
    airways = null;
    airspaces = null;
    existingPlanes = null;
    restrictions = null;

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
    planes: DelayedPlane[],
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

    let counterArray: AirspaceCounter[] = [];
    let counter = 0;
    let entryTime1 = '';
    let exitTime1 = '';
    let entryTime2 = '';
    let exitTime2 = '';

    while (isOverloaded) {
      await new Promise((resolve) => setImmediate(resolve));
      counterArray = [];

      for (const myairspace of myairspaces) {
        /*console.log(
            `${plane.callsign} - Airspace ${myairspace.airspace} -> ENTRY: ${myairspace.entryTime}, EXIT: ${myairspace.exitTime}`,
          );*/
        counter = 0;

        for (const p of planes) {
          if (p.callsign != plane.callsign && p.cdmSts != 'I') {
            for (const airspace of p.airspaces) {
              if (airspace.airspace === myairspace.airspace) {
                entryTime1 = myairspace.entryTime;
                exitTime1 = myairspace.exitTime;
                entryTime2 = airspace.entryTime;
                exitTime2 = airspace.exitTime;

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
        /*console.log(
          `${plane.callsign} - New CTOT ${newTakeOffTime} due to ${airspaceToFix.airspaceName} re-calculating...`,
        );*/
        if (
          this.helperService.getTimeDifferenceInMinutes(
            previousTakeOffTime,
            newTakeOffTime,
          ) > 120
        ) {
          /*console.log(
            `${plane.callsign} - CTOT is more than 2h, stopping re-calculation.`,
          );*/
          isOverloaded = false;
        }
      } else {
        isOverloaded = false;
      }

      if (!isOverloaded) {
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

    planes = null;

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
        checked = true;
        for (const p of planes) {
          if (p.airspaces.length > 0) {
            if (p.callsign != calcPlane.callsign && p.cdmSts != 'I') {
              if (p.arrival == calcPlane.arrival) {
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
        /*console.log(
          `${calcPlane.callsign} new CTOT ${calcPlane.ctot} due to arrival airport (${calcPlane.arrival})`,
        );*/
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
      /*console.log(
        `${calcPlane.callsign} new CTOT due to arrival airport (${calcPlane.arrival}) - ${calcPlane.ctot}`,
      );*/
    }
    return calcPlane;
  }

  async delayPlanes(planes: DelayedPlane[]): Promise<DelayedPlane[]> {
    const restrictions = await this.restrictionService.getRestrictions();
    const delayedPlanes: DelayedPlane[] = [];
    const cadAirports: cadAirport[] =
      await this.cadAirportService.getAirports(restrictions);

    console.log(`Calculating ${planes.length} planes`);

    let planeCopy = null;
    let planesCopy = null;
    let initialPlane = null;
    let calcPlane = null;
    let tempTTOT = '';
    let mainPlane = null;

    let counter = 1;
    for (let i = 0; i < planes.length; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      //console.log(`${plane.callsign} - (${counter}/${planes.length})`);
      counter = counter + 1;

      //Check if auto-set cdmSTS to I
      if (planes[i].cdmSts != 'I' && planes[i].atot == '') {
        planes[i] = await this.autoSetInvalidCdmSts(planes[i]);
      }

      if (planes[i].atot != '') {
        //console.log(`Skipping ${plane.callsign} is already airborne`);
      } else if (planes[i].cdmSts == 'I') {
        //console.log(`Skipping ${plane.callsign} as cdm status is INVALID`);
      } else {
        mainPlane = JSON.parse(JSON.stringify(planes[i]));
        tempTTOT = this.helperService.addMinutesToTime(
          mainPlane.eobt,
          mainPlane.taxi,
        );
        if (mainPlane.tsat != '') {
          tempTTOT = this.helperService.addMinutesToTime(
            mainPlane.tsat,
            mainPlane.taxi,
          );
        }
        if (mainPlane.ctot != '') {
          //Update airspace times
          mainPlane.airspaces = await this.moveTimesOfAirspace(
            mainPlane.airspaces,
            tempTTOT,
            mainPlane.ctot,
          );
        }

        planeCopy = JSON.parse(JSON.stringify(mainPlane));
        planesCopy = JSON.parse(JSON.stringify(planes));
        calcPlane = await this.calculatePlane(planeCopy, tempTTOT, planesCopy);

        planeCopy = JSON.parse(JSON.stringify(mainPlane));
        initialPlane = await this.makeCTOTvalid(calcPlane, planeCopy, 1, false);

        planeCopy = JSON.parse(JSON.stringify(mainPlane));
        planesCopy = JSON.parse(JSON.stringify(planes));
        calcPlane = await this.calculatePlaneDestination(
          planeCopy,
          planesCopy,
          cadAirports,
          calcPlane,
          tempTTOT,
        );

        planes[i] = await this.makeCTOTvalid(calcPlane, initialPlane, 2, false);

        /*console.log(
        `----------------- Finished processing ${plane.callsign} -----------------`,
      );*/
      }
    }

    planeCopy = null;
    planesCopy = null;
    mainPlane = null;

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
    trigger: number,
    canBeWorst: boolean,
  ): Promise<DelayedPlane> {
    /*Making CTOT valid if:
        1. existing ctot > new ctot (only if CTOT exists already) - Only when canBeWorst == false
        2. (new CTOT - taxiTime) > (timeNow + 5min)
        3. If calcPlaneCTOT = '', then onny remove CTOT if eobt/tsat+taxi > now+5min
        */
    if (calcPlane.ctot != '' && plane.ctot != '') {
      if (plane.ctot == calcPlane.ctot) {
        /*console.log(
          `${plane.callsign} - Validated same CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}] (Previous CTOT -> [${plane.ctot}-${plane.mostPenalizingAirspace}])`,
        );*/
        return calcPlane;
      } else if (
        // eslint-disable-next-line prettier/prettier
        (this.helperService.isTime1GreaterThanTime2(plane.ctot,calcPlane.ctot,) || plane.tsat != calcPlane.tsat) || canBeWorst
      ) {
        if (
          this.helperService.isTime1GreaterThanTime2(
            calcPlane.ctot,
            this.helperService.addMinutesToTime(
              this.helperService.getCurrentUTCTime(),
              5,
            ),
          )
        ) {
          /*console.log(
            `${plane.callsign} - Validated CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}] (Previous CTOT -> [${plane.ctot}-${plane.mostPenalizingAirspace}])`,
          );*/
          return calcPlane;
        } else {
          /*console.log(
            `${plane.callsign} - Not Validated CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}}] (Reason: (New CTOT [${calcPlane.ctot}] - Taxi time [${calcPlane.taxi}]) is earlier than now+5, using CTOT [[${plane.ctot}-${plane.mostPenalizingAirspace}]])`,
          );*/
          return plane;
        }
      } else {
        /*console.log(
          `${plane.callsign} - Not Validate CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}] (Reason: New CTOT [${calcPlane.ctot}] > Previous CTOT [${plane.ctot}-${plane.mostPenalizingAirspace}])`,
        );*/
        return plane;
      }
    } else if (calcPlane.ctot != '') {
      if (
        this.helperService.isTime1GreaterThanTime2(
          this.helperService.removeMinutesFromTime(
            calcPlane.ctot,
            calcPlane.taxi,
          ),
          this.helperService.addMinutesToTime(
            this.helperService.getCurrentUTCTime(),
            5,
          ),
        )
      ) {
        /*console.log(
          `${plane.callsign} - Validated CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}] (Previous CTOT -> [${plane.ctot}-${plane.mostPenalizingAirspace}])`,
        );*/
        return calcPlane;
      } else {
        /*console.log(
          `${plane.callsign} - Not Validated CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}] (Reason: (New CTOT [${calcPlane.ctot}] - Taxi time [${calcPlane.taxi}]) is earlier than now+5, using CTOT [[${plane.ctot}-${plane.mostPenalizingAirspace}]])`,
        );*/
        return plane;
      }
    } else if (calcPlane.ctot == '' && plane.ctot != '' && trigger == 2) {
      let tempTTOT = '';
      if (calcPlane.tsat != '') {
        tempTTOT = this.helperService.addMinutesToTime(
          calcPlane.tsat,
          calcPlane.taxi,
        );
      } else {
        tempTTOT = this.helperService.addMinutesToTime(
          calcPlane.eobt,
          calcPlane.taxi,
        );
      }

      if (
        this.helperService.isTime1GreaterThanTime2(
          tempTTOT,
          this.helperService.addMinutesToTime(
            this.helperService.getCurrentUTCTime(),
            5,
          ),
        )
      ) {
        /*console.log(
          `${plane.callsign} - Validated to remove CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}] (Previous CTOT -> [${plane.ctot}-${plane.mostPenalizingAirspace}])`,
        );*/
        return calcPlane;
      } else {
        /*console.log(
          `${plane.callsign} - Not Validated to remove CTOT [${calcPlane.ctot}-${calcPlane.mostPenalizingAirspace}] (Previous CTOT -> [${plane.ctot}-${plane.mostPenalizingAirspace}])`,
        );*/
        return plane;
      }
    }
    return plane;
  }

  async autoSetInvalidCdmSts(plane: DelayedPlane): Promise<DelayedPlane> {
    if (plane.ctot == '') {
      if (
        this.helperService.isTime1GreaterThanTime2(
          this.helperService.getCurrentUTCTime(),
          this.helperService.addMinutesToTime(
            this.helperService.addMinutesToTime(plane.eobt, plane.taxi),
            5,
          ),
        )
      ) {
        plane.cdmSts = 'I';
      }
    } else if (
      this.helperService.isTime1GreaterThanTime2(
        this.helperService.getCurrentUTCTime(),
        this.helperService.addMinutesToTime(plane.ctot, 5),
      )
    ) {
      plane.cdmSts = 'I';
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
    } else {
      plane.ctot = newdeptime;
      plane.mostPenalizingAirspace = airspaceToFix.airspaceName;
    }
    return plane;
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
