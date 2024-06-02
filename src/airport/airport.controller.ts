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
    return this.airportService.findAll();
  }

  @Post('setMaster')
  setQueryToSetMaster(
    @Query('airport') airport: string,
    @Query('position') position: string,
  ) {
    if (!this.airportService.getIsMaster(airport)) {
      return false;
    }
    return this.airportService.setMasterAirport(airport, position);
  }

  @Post('removeMaster')
  setQueryToRemoveMaster(
    @Query('airport') airport: string,
    @Query('position') position: string,
  ) {
    if (this.airportService.getIsMaster(airport)) {
      return this.airportService.removeMasterAirport(airport, position);
    }
    return false;
  }

  @Post('removeAllMasterByPosition')
  setQueryToRemoveAllMasterByPosition(@Query('position') position: string) {
    console.log(`Removed all entries for ${position}`);
    this.airportService.removeByPosition(position);
  }

  @Post('removeAllMasterByAirport')
  setQueryToRemoveAllMasterByAirport(@Query('airport') airport: string) {
    console.log(`Removed all entries for ${airport}`);
    this.airportService.removeByAirport(airport);
  }

  @Post('removedUnusedMasters')
  setQueryToRemoveUnusedMasters() {
    this.airportService.removeUnused();
  }
}
