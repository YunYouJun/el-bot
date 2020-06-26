/// <reference path="./packages/mirai-ts/index.d.ts" />

export interface Setting {
  authKey: string;
  enableWebsocket?: boolean;
  host?: string;
  port?: number;
}

export interface El {
  pkg: object;
  qq: number;
  /**
   * MiraiAPIHTTP setting.yml
   */
  setting: Setting;
  config: any;
}
