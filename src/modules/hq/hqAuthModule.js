/**
 * 百工天街 · 商号总舵认证与安全模块统一外观（Facade）
 * 内部已按职责拆分为：
 * - ./auth/hqSessionGuard.js  （会话纪元心跳、终端清退、观察期护盘横幅）
 * - ./auth/hqSecurityVault.js （TOTP验证器、恢复码核销、2FA门禁、72小时时间锁、改密）
 * - ./auth/hqStaffAuth.js     （登录门禁、扫码免密、角色视图隔离、四权分立属员管理）
 */

export {
  renderHQSecurityBanner,
  startSessionEpochHeartbeat,
  stopSessionEpochHeartbeat,
  executeGlobalTerminalRevoke
} from './auth/hqSessionGuard.js';

export {
  updateTotpStatusBadge,
  bindSecurityVaultActions
} from './auth/hqSecurityVault.js';

export {
  applyRoleViewExperience,
  checkHQAuthStatus,
  renderSubUsersTable,
  bindLoginAndStaffActions
} from './auth/hqStaffAuth.js';

import { executeGlobalTerminalRevoke } from './auth/hqSessionGuard.js';
import { bindSecurityVaultActions } from './auth/hqSecurityVault.js';
import { bindLoginAndStaffActions } from './auth/hqStaffAuth.js';

export function initAuthBindings() {
  bindLoginAndStaffActions();
  bindSecurityVaultActions();
  window.triggerGlobalDeviceEviction = executeGlobalTerminalRevoke;
  window.revokeOtherTerminals = executeGlobalTerminalRevoke;
}
