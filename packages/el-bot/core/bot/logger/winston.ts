import chalk from 'chalk'
import dayjs from 'dayjs'
import winston from 'winston'

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
 */
export function createLogger() {
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
      winston.format((info) => {
        info.level = info.level.toUpperCase()
        return info
      })(),
      winston.format.padLevels({
        levels: customLevels.levels,
      }),
      winston.format.colorize({
        colors: customLevels.colors,
      }),
      winston.format.timestamp(),
      winston.format.printf(({ level, message, label, timestamp, plugin }) => {
        const namespace = `${chalk.cyan(`${label}`)}`
        const pluginPrefix = plugin ? chalk.magenta(`[${plugin}] `) : ''
        const printedMessage = message instanceof Object ? JSON.stringify(message, null, 2) : message
        const content = [
          namespace,
          chalk.yellow(`[${dayjs(String(timestamp)).format('HH:mm:ss')}]`),
          `${pluginPrefix}[${level}]${printedMessage}`,
        ]
        return content.join(' ')
      }),
    ),
  })
  return logger as Logger
}
