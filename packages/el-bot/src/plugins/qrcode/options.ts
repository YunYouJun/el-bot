export interface QRCodeOptions {
  /**
   * 每次运行时自动清除缓存
   */
  autoClearCache: boolean;
}

const qrcodeOptions: QRCodeOptions = {
  autoClearCache: true,
};

export default qrcodeOptions;
