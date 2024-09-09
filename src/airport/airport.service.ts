import { Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { CreateAirportDto } from './dto/create-airport.dto';
import { Airport } from './schemas/airport.schema';
import { Atc } from '../plane/interface/atc.interface';
import axios from 'axios';

@Injectable()
export class AirportService {
  constructor(
    @Inject('AIRPORT_MODEL') private readonly airportModel: Model<Airport>,
  ) {}

  async create(createAirportDto: CreateAirportDto): Promise<Airport> {
    const createdAirport = await this.airportModel.create(createAirportDto);
    return createdAirport;
  }

  async remove(airportId: string): Promise<void> {
    await this.airportModel.deleteOne({ _id: airportId }).exec();
  }

  async removeByPosition(position: string): Promise<void> {
    await this.airportModel.deleteMany({ position: position }).exec();
  }

  async removeByAirport(airport: string): Promise<void> {
    await this.airportModel.deleteMany({ icao: airport }).exec();
  }

  async findAll(): Promise<Airport[]> {
    return await this.airportModel.find().exec();
  }

  async getOnlineAtc(): Promise<Atc[]> {
    try {
      const response = await axios.get(
        'https://api.vatsim.net/v2/atc/online        ',
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );
      return response.data as Atc[];
    } catch (error) {
      console.error('Error fetching pilots:', error);
      throw error;
    }
  }

  async mastersOnline(): Promise<boolean> {
    const masters = await this.findAll();
    if (masters.length > 0) {
      return true;
    }
    return false;
  }

  async removeUnused() {
    const masters = await this.findAll();
    let atcs: Atc[] = [];
    if (masters.length > 0) {
      atcs = await this.getOnlineAtc();
    }
    for (const master of masters) {
      let found = false;
      for (const atc of atcs) {
        if (master.position == atc.callsign) {
          found = true;
        }
      }
      if (!found) {
        console.log(`[AUTO] Removing master airpot ${master.icao}`);
        this.removeByPosition(master.position);
      }
    }
  }

  async getIsMaster(airport: string): Promise<boolean> {
    const airports = await this.findAll();
    for (const apt of airports) {
      if (apt.icao == airport) {
        return true;
      }
    }
    return false;
  }

  async setMasterAirport(airport: string, position: string): Promise<boolean> {
    const airports = await this.findAll();
    for (const apt of airports) {
      if (apt.icao == airport) {
        console.log('Cannot set master, already exists');
        return false;
      }
    }
    const airportDto: CreateAirportDto = {
      icao: airport,
      position: position,
    };
    await this.create(airportDto);
    console.log('Adding master airport', airport);
    return true;
  }

  async removeMasterAirport(
    airport: string,
    position: string,
  ): Promise<boolean> {
    const airports = await this.findAll();
    for (const apt of airports) {
      if (apt.icao == airport && apt.position == position) {
        console.log('Removing master airpot:', apt.icao);
        await this.remove(apt._id);
        return true;
      }
    }
    console.log(position, 'not owning master of airport:', airport);
    return false;
  }
}
