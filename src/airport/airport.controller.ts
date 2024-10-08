import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CreateAirportDto } from './dto/create-airport.dto';
import { AirportService } from './airport.service';
import { Airport } from './interfaces/airport.interface';

@Controller('airport')
export class AirportController {
  constructor(private readonly airportService: AirportService) {}

  @Post()
  async create(@Body() createAirportDto: CreateAirportDto) {
    return this.airportService.create(createAirportDto);
  }

  @Get()
  async findAll(): Promise<Airport[]> {
    return await this.airportService.findAll();
  }

  @Post('setMaster')
  async setQueryToSetMaster(
    @Query('airport') airport: string,
    @Query('position') position: string,
  ) {
    const isAirportMaster = await this.airportService.getIsMaster(airport);
    if (isAirportMaster) {
      return false;
    }
    return await this.airportService.setMasterAirport(airport, position);
  }

  @Post('removeMaster')
  async setQueryToRemoveMaster(
    @Query('airport') airport: string,
    @Query('position') position: string,
  ) {
    const isAirportMaster = await this.airportService.getIsMaster(airport);
    if (isAirportMaster) {
      return await this.airportService.removeMasterAirport(airport, position);
    }
    return false;
  }

  @Post('removeAllMasterByPosition')
  async setQueryToRemoveAllMasterByPosition(
    @Query('position') position: string,
  ) {
    console.log(`Removed all entries for ${position}`);
    await this.airportService.removeByPosition(position);
  }

  @Post('removeAllMasterByAirport')
  async setQueryToRemoveAllMasterByAirport(@Query('airport') airport: string) {
    console.log(`Removed all entries for ${airport}`);
    await this.airportService.removeByAirport(airport);
  }

  @Post('removedUnusedMasters')
  async setQueryToRemoveUnusedMasters() {
    await this.airportService.removeUnused();
  }

  @Get('mastersOnline')
  async areThereMastersOnline() {
    return this.airportService.mastersOnline();
  }
}
