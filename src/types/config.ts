export interface BaseListen {
  friend?: number[];
  group?: number[];
}

export type BaseListenType = "all" | "master" | "admin" | "friend" | "group";

/**
 * 监听格式
 */
export type Listen = BaseListen | (BaseListenType | number)[];

export interface Target {
  friend?: number[];
  group?: number[];
}
