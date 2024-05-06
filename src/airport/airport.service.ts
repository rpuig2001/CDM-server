import { Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { CreateAirportDto } from './dto/create-airport.dto';
import { Airport } from './schemas/airport.schema';

@Injectable()
export class AirportService {
  constructor(
    @Inject('AIRPORT_MODEL') private readonly airportModel: Model<Airport>,
  ) {}

  async create(createAirportDto: CreateAirportDto): Promise<Airport> {
    const createdAirport = this.airportModel.create(createAirportDto);
    return createdAirport;
  }

  async remove(airportId: string): Promise<void> {
    await this.airportModel.deleteOne({ _id: airportId }).exec();
  }

  async findAll(): Promise<Airport[]> {
    return this.airportModel.find().exec();
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
    console.log('Adding airport', airport);
    return true;
  }

  async removeMasterAirport(
    airport: string,
    position: string,
  ): Promise<boolean> {
    const airports = await this.findAll();
    for (const apt of airports) {
      if (apt.icao == airport && apt.position == position) {
        console.log('Removing airport:', apt.icao);
        await this.remove(apt._id);
        return true;
      }
    }
    console.log(position, 'not owning master of airport:', airport);
    return false;
  }
}
