import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { AirspaceComplete } from '../airspace/interface/airspace-complete.interface';
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

      const airspacePlaneData = await this.calculateAirspaceIntersection(
        airspaces,
        waypointsRoute,
        speed,
        depTime,
      );

      for (const planedata of airspacePlaneData) {
        overflyAirspaces.push({
          airspace: planedata.airspace,
          capacity: planedata.capacity,
          entryTime: planedata.entryTime,
          exitTime: planedata.exitTime,
          reason: '',
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

    for (let i = 0; i < routeStringItems.length; i++) {
      const routeItem = routeStringItems[i];
      const foundWaypoints: Waypoint[] = [];
      for (const w of waypoints) {
        if (w.name === routeItem) {
          foundWaypoints.push(w);
        }
      }

      if (foundWaypoints.length > 1 && routeWaypoints.length > 0) {
        //If more than 1 wpt found, iterate around wpt checking the distance to find the closes one.
        let minDistance = Infinity;
        const prevWpt = routeWaypoints[routeWaypoints.length - 1];
        let finalWpt: Waypoint = null;
        for (const wpt of foundWaypoints) {
          const distanceNow = await this.calculateDistanceWaypoints(
            prevWpt.lat,
            prevWpt.lon,
            wpt.lat,
            wpt.lon,
          );
          if (distanceNow < minDistance) {
            minDistance = distanceNow;
            finalWpt = wpt;
          }
        }
        if (finalWpt != null) {
          routeWaypoints.push(finalWpt);
        }
      } else if (foundWaypoints.length === 1) {
        //If only 1 wpt was found, then simply use this.
        routeWaypoints.push(foundWaypoints[0]);
      } else if (i > 0 && i < routeStringItems.length - 1) {
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
            //console.log(`Waypoints of airway ${routeItem} not found`);
          }
        } else {
          //console.log(`Airway ${routeItem} not found`);
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
    let lines = null;
    let data = null;
    let name = null;
    let lat = null;
    let lon = null;
    //Get Waypoints
    let src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/Waypoints.txt',
    );
    if (src == ""){
      return [];
    }
    lines = src.split('\n');
    lines.forEach((line) => {
      data = line.split(',');
      name = data[0];
      lat = parseFloat(data[1]);
      lon = parseFloat(data[2]);
      waypoints.push({ name, lat, lon });
    });

    lines = null;
    data = null;
    name = null;
    lat = null;
    lon = null;
    src = null;

    //Get navaids
    src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/Navaids.txt',
    );
    if (src == ""){
      return [];
    }
    lines = src.split('\n');
    lines.forEach((line) => {
      data = line.split(',');
      name = data[0];
      lat = parseFloat(data[6]);
      lon = parseFloat(data[7]);
      waypoints.push({ name, lat, lon });
    });

    lines = null;
    data = null;
    name = null;
    lat = null;
    lon = null;
    src = null;

    //Get airports
    src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/Airports.txt',
    );
    if (src == ""){
      return [];
    }
    lines = src.split('\n');
    lines.forEach((line) => {
      data = line.split(',');
      if (data[0] == 'A') {
        name = data[1];
        lat = parseFloat(data[3]);
        lon = parseFloat(data[4]);
        waypoints.push({ name, lat, lon });
      }
    });

    lines = null;
    data = null;
    name = null;
    lat = null;
    lon = null;
    src = null

    return waypoints;
  }

  async getAirways(): Promise<Airway[]> {
    const routes: Airway[] = [];
    let data;
    let type;
    let waypointsForCurrentAirway;
    let name;
    let lat;
    let lon;
    let index;
    //Get Routes
    let src = await this.readFileFromUrl(
      'https://archivos.vatsimspain.es/Operaciones/Plugins/navdata/ATS.txt',
    );
    if (src == ""){
      return [];
    }
    let waypointsForAirway: Waypoint[] = [];
    let linesRoutes = src.split('\n');
    let nameAirway = '';
    linesRoutes.forEach((line) => {
      name = null;
      lat = null;
      lon = null;
      index = null;
      waypointsForCurrentAirway = null;
      data = line.split(',');
      type = data[0];
      if (type == 'A') {
        index = routes.findIndex(
          (item) => item.nameAirway === nameAirway,
        );

        //
        if (index != -1) {
          waypointsForCurrentAirway = [...waypointsForAirway];
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
          name = data[1];
          lat = parseFloat(data[2]);
          lon = parseFloat(data[3]);
          waypointsForAirway.push({ name, lat, lon });
        }
        //Setting "to"
        name = data[4];
        lat = parseFloat(data[5]);
        lon = parseFloat(data[6]);
        waypointsForAirway.push({ name, lat, lon });
      }
    });

    src = null;
    data = null;
    type = null;
    waypointsForCurrentAirway = null;
    name = null;
    lat = null;
    lon = null;
    index = null;
    waypointsForAirway = null;
    linesRoutes = null;
    nameAirway = null;

    return routes;
  }

  async getAirspaces(): Promise<Airspace[]> {
    //Get Airspaces
    const geoJSONData = await this.fetchGeoJSONFromUrl(
      'https://raw.githubusercontent.com/rpuig2001/Capacity-Availability-Document-CDM/main/airspaces.geojson',
    );
    return geoJSONData.features.map((feature: any) => {
      const boundaries = this.convertCoordinatesToWaypoints(
        feature.geometry.coordinates,
      );
      return {
        name: feature.properties.id,
        capacity: feature.properties.capacity,
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
    let response = null;
    try {
      response = await axios.get(url);
      return response.data;
    } catch (error) {
      response = null;
      console.error('Error fetching GeoJSON data:', error);
      return [];
    }
  }

  async readFileFromUrl(url: string): Promise<string> {
    let response = null;
    try {
      response = await axios.get(url);
      return response.data;
    } catch (error) {
      response = null;
      console.error(`Error reading file from URL: ${error.message}`);
      return "";
    }
  }

  async isWaypointInsideAirspace(
    waypoint: Waypoint,
    airspace: Airspace,
  ): Promise<boolean> {
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

  async calculateAirspaceIntersection(
    airspaces: Airspace[],
    waypoints: Waypoint[],
    speedKnots: number,
    depTime: string,
  ): Promise<AirspaceComplete[]> {
    //Create a temporary point during the route every minute
    const flightPath = await this.simulateFlight(
      waypoints,
      depTime,
      speedKnots,
    );

    const intersections: AirspaceComplete[] = [];

    for (const airspace of airspaces) {
      let entry = '';
      let exit = '';
      const index = intersections.findIndex(
        (item) => item.airspace === airspace.name,
      );
      if (index == -1) {
        for (const point of flightPath) {
          if (await this.isWaypointInsideAirspace(point, airspace)) {
            if (entry == '') {
              entry = point.name;
            } else if (flightPath[flightPath.length - 1].name == point.name) {
              exit = point.name;
            }
          } else if (entry != '') {
            exit = point.name;
            break;
          }
        }
        if (exit != '') {
          //console.log(`${airspace.name} has capacity ${airspace.capacity}`);
          intersections.push({
            airspace: airspace.name,
            capacity: airspace.capacity,
            entryTime: entry,
            exitTime: exit,
            reason: '',
          });
        } else if (entry != '' && flightPath.length > 1) {
          intersections.push({
            airspace: airspace.name,
            capacity: airspace.capacity,
            entryTime: entry,
            exitTime: flightPath[flightPath.length - 2].name,
            reason: '',
          });
        }
      }
    }

    return intersections;
  }

  async simulateFlight(
    route: Waypoint[],
    departureTime: string,
    speed: number,
  ): Promise<Waypoint[]> {
    const flightCoordinates: Waypoint[] = [];
    let time = departureTime;
    let distanceToNextWaypoint;
    let timeToNextWaypoint;
    let numberOfSteps;
    let latStep;
    let lonStep;
    let lat;
    let lon;

    for (let i = 0; i < route.length - 1; i++) {
      const currentWaypoint = route[i];
      const nextWaypoint = route[i + 1];

      distanceToNextWaypoint = await this.calculateDistanceWaypoints(
        currentWaypoint.lat,
        currentWaypoint.lon,
        nextWaypoint.lat,
        nextWaypoint.lon,
      );

      distanceToNextWaypoint = distanceToNextWaypoint * 1000;

      // Calculate the time it takes to reach the next waypoint based on speed
      timeToNextWaypoint = distanceToNextWaypoint / (speed * 0.514444); // Convert speed from knots to m/s

      // Generate coordinates at one-minute intervals along the route
      numberOfSteps = Math.ceil(timeToNextWaypoint / 60); // Convert time to minutes
      latStep = (nextWaypoint.lat - currentWaypoint.lat) / numberOfSteps;
      lonStep = (nextWaypoint.lon - currentWaypoint.lon) / numberOfSteps;

      for (let j = 0; j < numberOfSteps; j++) {
        lat = currentWaypoint.lat + latStep * j;
        lon = currentWaypoint.lon + lonStep * j;
        flightCoordinates.push({
          name: time,
          lat,
          lon,
        });
        time = await this.addOneMinute(time);
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

  async addOneMinute(timeString: string) {
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

  async calculateDistanceWaypoints(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const toRadians = (degrees) => (degrees * Math.PI) / 180;

    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in kilometers
    return distance;
  }
}
