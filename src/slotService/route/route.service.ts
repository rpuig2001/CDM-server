import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { AirspaceComplete } from '../interface/airspace-complete.interface';
import { Airway } from './interface/airway.interface';
import { Airspace } from './interface/airspace.interface';
import { Waypoint } from './interface/waypoint.interface';

@Injectable()
export class RouteService {
  private readonly AIRSPACE_BOUNDARIES = {};

  async calculateEntryExitTimes(
    route: string,
    depTime: string,
    speed: number,
    waypoints: Waypoint[],
    airways: Airway[],
    airspaces: Airspace[],
  ): Promise<AirspaceComplete[]> {
    const overflyAirspaces: AirspaceComplete[] = [];
    if (speed != 0) {
      const waypointsRoute = await this.fetchWaypoints(
        route,
        waypoints,
        airways,
      );

      const airspacePlaneData = this.calculateAirspaceIntersection(
        airspaces,
        waypointsRoute,
        speed,
        depTime,
      );

      for (const planedata of airspacePlaneData) {
        overflyAirspaces.push({
          airspace: planedata.airspace,
          entryTime: planedata.entryTime,
          exitTime: planedata.exitTime,
        });
      }
    }

    return overflyAirspaces;
  }

  async fetchWaypoints(
    routeString: string,
    waypoints: Waypoint[],
    airways: Airway[],
  ): Promise<Waypoint[]> {
    const routeWaypoints: Waypoint[] = [];
    const routeStringItems = await this.fixRouteString(routeString);
    const waypointMap = new Map(
      waypoints.map((waypoint) => [waypoint.name, waypoint]),
    );

    for (let i = 0; i < routeStringItems.length; i++) {
      const routeItem = routeStringItems[i];
      const waypoint = waypointMap.get(routeItem);

      if (waypoint) {
        routeWaypoints.push(waypoint);
      } else {
        if (i > 0 && i < routeStringItems.length - 1) {
          const airway = airways.find(
            (airway) => airway.nameAirway === routeItem,
          );

          if (airway) {
            const index1 = airway.waypointsForAirway.findIndex(
              (item) => item.name === routeStringItems[i - 1],
            );
            const index2 = airway.waypointsForAirway.findIndex(
              (item) => item.name === routeStringItems[i + 1],
            );

            if (index1 !== -1 && index2 !== -1) {
              const start = Math.min(index1, index2);
              const end = Math.max(index1, index2);
              routeWaypoints.push(
                ...airway.waypointsForAirway.slice(start + 1, end),
              );
            } else {
              console.log(`Waypoints of airway ${routeItem} not found`);
            }
          } else {
            console.log(`Airway ${routeItem} not found`);
          }
        }
      }
    }
    return routeWaypoints;
  }

  async fixRouteString(routeString: string): Promise<string[]> {
    let routeStringItems = routeString.split(' ');
    //Remove DCTs
    routeStringItems = routeStringItems.filter(
      (item) => item.toUpperCase() !== 'DCT',
    );
    //Remove step climbs/descents
    routeStringItems = routeStringItems.map((str) => {
      const index = str.indexOf('/');
      return index !== -1 ? str.substring(0, index) : str;
    });

    return routeStringItems;
  }

  async getWaypoints(): Promise<Waypoint[]> {
    const waypoints: Waypoint[] = [];
    //Get Waypoints
    let src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/Waypoints.txt',
    );
    const linesWaypoints = src.split('\n');
    linesWaypoints.forEach((line) => {
      const data = line.split(',');
      const name = data[0];
      const lat = parseFloat(data[1]);
      const lon = parseFloat(data[2]);
      waypoints.push({ name, lat, lon });
    });

    //Get navaids
    src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/Navaids.txt',
    );
    const linesNavaids = src.split('\n');
    linesNavaids.forEach((line) => {
      const data = line.split(',');
      const name = data[0];
      const lat = parseFloat(data[6]);
      const lon = parseFloat(data[7]);
      waypoints.push({ name, lat, lon });
    });

    //Get airports
    src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/Airports.txt',
    );
    const linesAirports = src.split('\n');
    linesAirports.forEach((line) => {
      const data = line.split(',');
      const name = data[0];
      const lat = parseFloat(data[1]);
      const lon = parseFloat(data[2]);
      waypoints.push({ name, lat, lon });
    });

    return waypoints;
  }

  async getAirways(): Promise<Airway[]> {
    const routes: Airway[] = [];
    //Get Routes
    const src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/ATS.txt',
    );
    const waypointsForAirway: Waypoint[] = [];
    const linesRoutes = src.split('\n');
    let nameAirway = '';
    linesRoutes.forEach((line) => {
      const data = line.split(',');
      const type = data[0];
      if (type == 'A') {
        const index = routes.findIndex(
          (item) => item.nameAirway === nameAirway,
        );

        //
        if (index != -1) {
          const waypointsForCurrentAirway = [...waypointsForAirway];
          routes[index].waypointsForAirway = waypointsForCurrentAirway;
        } else {
          routes.push({
            nameAirway,
            waypointsForAirway: [...waypointsForAirway],
          });
        }
        waypointsForAirway.length = 0;
        nameAirway = data[1];
      }
      if (type == 'S') {
        //Setting "from" only when starting to complete the list
        if (waypointsForAirway.length == 0) {
          const name = data[1];
          const lat = parseFloat(data[2]);
          const lon = parseFloat(data[3]);
          waypointsForAirway.push({ name, lat, lon });
        }
        //Setting "to"
        const name = data[4];
        const lat = parseFloat(data[5]);
        const lon = parseFloat(data[6]);
        waypointsForAirway.push({ name, lat, lon });
      }
    });
    return routes;
  }

  async getAirspaces(): Promise<Airspace[]> {
    //Get Airspaces
    const geoJSONData = await this.fetchGeoJSONFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/airspaces.json',
    );
    return geoJSONData.features.map((feature: any) => {
      const boundaries = this.convertCoordinatesToWaypoints(
        feature.geometry.coordinates,
      );
      return {
        name: feature.properties.id,
        boundaries: boundaries,
      };
    });
  }

  convertCoordinatesToWaypoints(coordinates: number[][][]): Waypoint[] {
    const waypoints: Waypoint[] = [];
    coordinates.forEach((polygon) => {
      polygon.forEach((lineString) => {
        lineString.forEach((coord) => {
          waypoints.push({
            name: '',
            lat: coord[1],
            lon: coord[0],
          });
        });
      });
    });
    return waypoints;
  }

  async fetchGeoJSONFromUrl(url: string): Promise<any> {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching GeoJSON data:', error);
      throw error;
    }
  }

  async readFileFromUrl(url: string): Promise<string> {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      throw new Error(`Error reading file from URL: ${error.message}`);
    }
  }

  isWaypointInsideAirspace(waypoint: Waypoint, airspace: Airspace): boolean {
    // Check if the airspace and its boundaries are defined
    if (!airspace || !airspace.boundaries || airspace.boundaries.length < 3) {
      console.error(
        `Airspace ${airspace.name} has invalid boundaries: ${airspace?.boundaries}`,
      );
      return false; // Invalid airspace or boundaries
    }

    const x = waypoint.lon;
    const y = waypoint.lat;

    // Iterate through each boundary point of the airspace
    let inside = false;
    for (
      let i = 0, j = airspace.boundaries.length - 1;
      i < airspace.boundaries.length;
      j = i++
    ) {
      const xi = airspace.boundaries[i].lon;
      const yi = airspace.boundaries[i].lat;
      const xj = airspace.boundaries[j].lon;
      const yj = airspace.boundaries[j].lat;

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  calculateAirspaceIntersection(
    airspaces: Airspace[],
    waypoints: Waypoint[],
    speedKnots: number,
    depTime: string,
  ): AirspaceComplete[] {
    //Create a temporary point during the route every minute
    const flightPath = this.simulateFlight(waypoints, depTime, speedKnots);

    const intersections: AirspaceComplete[] = [];

    for (const airspace of airspaces) {
      let entry = '';
      let exit = '';
      const index = intersections.findIndex(
        (item) => item.airspace === airspace.name,
      );
      if (index == -1) {
        for (const point of flightPath) {
          if (this.isWaypointInsideAirspace(point, airspace)) {
            if (entry == '') {
              entry = point.name;
            }
          } else if (entry != '') {
            exit = point.name;
            break;
          }
        }
        if (exit != '') {
          intersections.push({
            airspace: airspace.name,
            entryTime: entry,
            exitTime: exit,
          });
        } else if (entry != '' && flightPath.length > 1) {
          intersections.push({
            airspace: airspace.name,
            entryTime: entry,
            exitTime: flightPath[flightPath.length - 2].name,
          });
        }
      }
    }

    return intersections;
  }

  calculateDistanceRouteParser(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  }

  simulateFlight(
    route: Waypoint[],
    departureTime: string,
    speed: number,
  ): Waypoint[] {
    const flightCoordinates: Waypoint[] = [];
    let time = departureTime;

    for (let i = 0; i < route.length - 1; i++) {
      const currentWaypoint = route[i];
      const nextWaypoint = route[i + 1];

      const distanceToNextWaypoint = this.calculateDistanceRouteParser(
        currentWaypoint.lat,
        currentWaypoint.lon,
        nextWaypoint.lat,
        nextWaypoint.lon,
      );

      // Calculate the time it takes to reach the next waypoint based on speed
      const timeToNextWaypoint = distanceToNextWaypoint / (speed * 0.514444); // Convert speed from knots to m/s

      // Generate coordinates at one-minute intervals along the route
      const numberOfSteps = Math.ceil(timeToNextWaypoint / 60); // Convert time to minutes
      const latStep = (nextWaypoint.lat - currentWaypoint.lat) / numberOfSteps;
      const lonStep = (nextWaypoint.lon - currentWaypoint.lon) / numberOfSteps;

      for (let j = 0; j < numberOfSteps; j++) {
        const lat = currentWaypoint.lat + latStep * j;
        const lon = currentWaypoint.lon + lonStep * j;
        flightCoordinates.push({
          name: time,
          lat,
          lon,
        });
        time = this.addOneMinute(time);
      }
    }

    // Add the last waypoint
    if (route.length > 0) {
      flightCoordinates.push({
        name: '',
        lat: route[route.length - 1].lat,
        lon: route[route.length - 1].lon,
      });
    }

    return flightCoordinates;
  }

  addOneMinute(timeString: string) {
    // Extract hours and minutes from the time string
    const hours = parseInt(timeString.substring(0, 2));
    const minutes = parseInt(timeString.substring(2, 4));

    // Add one minute
    let newMinutes = minutes + 1;
    let newHours = hours;

    // Adjust hours and minutes if necessary
    if (newMinutes >= 60) {
      newMinutes = 0;
      newHours++;
      if (newHours >= 24) {
        newHours = 0; // Wrap around if exceeding 23:59
      }
    }

    // Format the new time
    const formattedHours = ('0' + newHours).slice(-2);
    const formattedMinutes = ('0' + newMinutes).slice(-2);

    return formattedHours + formattedMinutes;
  }

  calculateDistanceWaypoints(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  }

  findClosestWaypoint(
    location: { lat: number; lon: number },
    waypoints: Waypoint[],
  ): Waypoint | null {
    if (waypoints.length === 0) return null;

    let closestWaypoint = waypoints[0];
    let minDistance = this.calculateDistanceWaypoints(
      location.lat,
      location.lon,
      closestWaypoint.lat,
      closestWaypoint.lon,
    );

    for (let i = 1; i < waypoints.length; i++) {
      const distance = this.calculateDistanceWaypoints(
        location.lat,
        location.lon,
        waypoints[i].lat,
        waypoints[i].lon,
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestWaypoint = waypoints[i];
      }
    }

    return closestWaypoint;
  }
}
