import { Injectable } from '@nestjs/common';

@Injectable()
export class HelperService {
  addMinutesToTime(time: string, minutesToAdd: number): string {
    let hours = parseInt(time.substring(0, 2));
    let minutes = parseInt(time.substring(2, 4));
    minutes += minutesToAdd;
    hours += Math.floor(minutes / 60);
    minutes %= 60;
    hours %= 24;
    const newHours = hours < 10 ? '0' + hours : hours.toString();
    const newMinutes = minutes < 10 ? '0' + minutes : minutes.toString();
    return `${newHours}${newMinutes}`;
  }

  removeMinutesFromTime(time: string, minutesToRemove: number): string {
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
    const newHours = hours < 10 ? '0' + hours : hours.toString();
    const newMinutes = minutes < 10 ? '0' + minutes : minutes.toString();
    return `${newHours}${newMinutes}`;
  }

  getTimeDifferenceInMinutes(time1: string, time2: string): number {
    const hours1 = parseInt(time1.substring(0, 2));
    const minutes1 = parseInt(time1.substring(2, 4));
    const hours2 = parseInt(time2.substring(0, 2));
    const minutes2 = parseInt(time2.substring(2, 4));
    const totalMinutes1 = hours1 * 60 + minutes1;
    const totalMinutes2 = hours2 * 60 + minutes2;
    return Math.abs(totalMinutes1 - totalMinutes2);
  }

  isTime1GreaterThanTime2(time1: string, time2: string): boolean {
    // Ensure both times are in the correct format and length
    if (time1.length !== 4 || time2.length !== 4) {
      throw new Error('Times must be in the HHmm format.');
    }

    // Parse the hours and minutes from the times
    const hour1 = parseInt(time1.substring(0, 2));
    const hour2 = parseInt(time2.substring(0, 2));
    const minute1 = parseInt(time1.substring(2, 4));
    const minute2 = parseInt(time2.substring(2, 4));

    if (hour1 >= 24 || hour2 >= 24 || minute1 >= 60 || minute2 >= 60) {
      throw new Error('Invalid time format.');
    }
    const timeDifference = Math.abs(
      hour1 * 60 + minute1 - (hour2 * 60 + minute2),
    );

    if (timeDifference < 180) {
      return hour1 > hour2 || (hour1 === hour2 && minute1 > minute2);
    } else {
      return time1 > time2;
    }
  }
}
