import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  financialYearCreateSchema,
  financialYearDiscardSchema,
  financialYearUpdateSchema,
  type FinancialYearCreate,
  type FinancialYearDiscard,
  type FinancialYears,
  type FinancialYearUpdate,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { invalidSettings } from './settings.service';
import { YearsService } from './years.service';

/** Financial years (HP2-100): administrators see them and plan the next one. */
@Controller('financial-years')
@Roles('administrator')
export class YearsController {
  constructor(private readonly years: YearsService) {}

  @Get()
  list(): Promise<FinancialYears> {
    return this.years.list();
  }

  @Post()
  plan(
    @CurrentUser() user: User,
    @Body(new SchemaValidationPipe(financialYearCreateSchema, invalidSettings))
    input: FinancialYearCreate,
  ): Promise<FinancialYears> {
    return this.years.plan(user, input);
  }

  @Put(':yearId')
  update(
    @CurrentUser() user: User,
    @Param('yearId') id: string,
    @Body(new SchemaValidationPipe(financialYearUpdateSchema, invalidSettings))
    input: FinancialYearUpdate,
  ): Promise<FinancialYears> {
    return this.years.update(user, id, input);
  }

  @Post(':yearId/discard')
  discard(
    @CurrentUser() user: User,
    @Param('yearId') id: string,
    @Body(new SchemaValidationPipe(financialYearDiscardSchema, invalidSettings))
    input: FinancialYearDiscard,
  ): Promise<FinancialYears> {
    return this.years.discard(user, id, input.reason);
  }
}
