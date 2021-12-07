import chalk from 'chalk'
import winston from 'winston'
import dayjs from 'dayjs'

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    warning: 1,
    success: 2,
    info: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    warning: 'yellow',
    success: 'green',
    info: 'blue',
    debug: 'cyan',
  },
}

export interface Logger extends winston.Logger {
  success: winston.LeveledLogMethod
}

/**
 * 创建日志工具，基于 winston
 * @param label
 */
export function createLogger(label = 'el-bot') {
  const logger = winston.createLogger({
    levels: customLevels.levels,
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
    ],
    format: winston.format.combine(
      winston.format.colorize({
        colors: customLevels.colors,
      }),
      winston.format.label({
        label,
      }),
      winston.format.timestamp(),
      winston.format.printf(({ level, message, label, timestamp }) => {
        const namespace = `${chalk.cyan(`[${label}]`)}`
        const content = [
          namespace,
          chalk.yellow(`[${dayjs(timestamp).format('HH:mm:ss')}]`),
          `[${level}]`,
          message,
        ]
        return content.join(' ')
      }),
    ),
  })
  return logger as Logger
}
