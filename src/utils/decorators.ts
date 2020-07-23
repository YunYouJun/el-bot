import log from 'mirai-ts/dist/utils/log'
export function displayCall(
  target: any,
  propertyName: string,
  propertyDescriptor: PropertyDescriptor
) {
  const method = propertyDescriptor.value

  propertyDescriptor.value = function (...args: any[]) {
    // 将 greet 的参数列表转换为字符串
    const params = args.map((a) => JSON.stringify(a)).join()
    // 调用 greet() 并获取其返回值
    const result = method.apply(this, args)
    // 转换结尾为字符串
    const r = JSON.stringify(result)
    // 在终端显示函数调用细节
    log.info(`Call: ${propertyName}(${params}) => ${r}`)
    // 返回调用函数的结果
    return result
  }

  return propertyDescriptor
}

// 类捕获异常
export function tryCatch(errorHandler?: (error?: Error) => void) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const func = descriptor.value

    return {
      get() {
        return (...args: any[]) => {
          return Promise.resolve(func.apply(this, args)).catch((error) => {
            if (errorHandler) {
              errorHandler(error)
            } else {
              log.error(`调用 ${propertyKey} 出了问题`)
            }
          })
        }
      },
      set(newValue: any) {
        return newValue
      },
    }
  }
}
