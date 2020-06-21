/// <reference path="./packages/mirai-ts/index.d.ts" />

declare namespace Config {
  interface Listen {
    friend?: number[];
    group?: number[];
  }

  interface Target {
    friend?: number[];
    group?: number[];
  }
}

export {
  Config
};
