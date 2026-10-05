/** Compatibility for declarations omitted from resty-client 0.0.5's published tarball. */
declare module 'resty-client' {
  export type RestyResponse<T> = import('axios').AxiosResponse<T>
  export type RequestOptions = import('axios').AxiosRequestConfig & { rest?: Record<string, unknown> }
}
