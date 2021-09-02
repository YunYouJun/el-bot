import { isDev } from "./misc";

/**
 * 通用的异常处理
 * @param e
 * @param logger
 */
export function handleError(
  e: any | Error,
  logger?: {
    error: (...args: any[]) => void;
  }
) {
  if (!e) return;

  if (isDev) {
    console.error(e);
  }

  if (e.message) {
    if (logger) {
      logger.error(e.message);
    } else {
      console.error(e.message);
    }
  }
}
