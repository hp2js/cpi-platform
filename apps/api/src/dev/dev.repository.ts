import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../database/db';
import { systemState } from '../database/schema';

@Injectable()
export class DevRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async emailFailureMode(): Promise<boolean> {
    const [state] = await this.db
      .select({ enabled: systemState.emailFailureMode })
      .from(systemState);
    return state?.enabled ?? false;
  }

  async setEmailFailureMode(enabled: boolean): Promise<void> {
    await this.db.update(systemState).set({ emailFailureMode: enabled });
  }
}
