import el from "../el";

const config = el.config;

/**
 * 是否是主人
 * @param qq 
 */
export function isMaster(qq: number) {
  return config.master.includes(qq);
}

/**
 * 是否是管理员
 * @param qq 
 */
export function isAdmin(qq: number) {
  return config.admin.includes(qq);
}

/**
 * 是否拥有权限
 * @param qq 
 */
export function isAllowed(qq: number) {
  return isMaster(qq) || isAdmin(qq);
}
