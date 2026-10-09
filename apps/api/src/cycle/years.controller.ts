import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  financialYearCreateSchema,
  financialYearDiscardSchema,
  financialYearOpenSchema,
  financialYearUpdateSchema,
  type ClosedYearResults,
  type FinancialYear,
  type FinancialYearCreate,
  type FinancialYearDiscard,
  type FinancialYearOpen,
  type FinancialYears,
  type FinancialYearUpdate,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { invalidSettings } from './settings.service';
import { YearsService } from './years.service';

/**
 * Financial years (HP2-100): administrators plan and open them; everyone can look back at a
 * closed year's published results within their own scope.
 */
@Controller('financial-years')
export class YearsController {
  constructor(private readonly years: YearsService) {}

  @Get()
  @Roles('administrator')
  list(): Promise<FinancialYears> {
    return this.years.list();
  }

  @Get('closed')
  closed(): Promise<FinancialYear[]> {
    return this.years.closed();
  }

  @Get(':yearId/results')
  closedResults(
    @CurrentUser() user: User,
    @Param('yearId') id: string,
  ): Promise<ClosedYearResults> {
    return this.years.closedResults(user, id);
  }

  @Post()
  @Roles('administrator')
  plan(
    @CurrentUser() user: User,
    @Body(new SchemaValidationPipe(financialYearCreateSchema, invalidSettings))
    input: FinancialYearCreate,
  ): Promise<FinancialYears> {
    return this.years.plan(user, input);
  }

  @Put(':yearId')
  @Roles('administrator')
  update(
    @CurrentUser() user: User,
    @Param('yearId') id: string,
    @Body(new SchemaValidationPipe(financialYearUpdateSchema, invalidSettings))
    input: FinancialYearUpdate,
  ): Promise<FinancialYears> {
    return this.years.update(user, id, input);
  }

  @Post(':yearId/discard')
  @Roles('administrator')
  discard(
    @CurrentUser() user: User,
    @Param('yearId') id: string,
    @Body(new SchemaValidationPipe(financialYearDiscardSchema, invalidSettings))
    input: FinancialYearDiscard,
  ): Promise<FinancialYears> {
    return this.years.discard(user, id, input.reason);
  }

  @Post(':yearId/open')
  @Roles('administrator')
  open(
    @CurrentUser() user: User,
    @Param('yearId') id: string,
    @Body(new SchemaValidationPipe(financialYearOpenSchema, invalidSettings))
    input: FinancialYearOpen,
  ): Promise<FinancialYears> {
    return this.years.open(user, id, input);
  }
}
