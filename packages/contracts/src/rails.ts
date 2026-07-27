export type RailsMigrationStatus = 'up' | 'down';

export interface RailsMigrationEntry {
  version: string;
  name: string;
  status: RailsMigrationStatus;
}

export interface RailsMigrationsOverview {
  supported: boolean;
  database?: string;
  migrations: RailsMigrationEntry[];
}

export interface RailsRouteEntry {
  name?: string;
  verb: string;
  path: string;
  controllerAction: string;
}

export interface RailsRoutesOverview {
  supported: boolean;
  routes: RailsRouteEntry[];
}
