/**
 * className 必须透传——antd Menu 会注入 ant-menu-item-icon，其相邻选择器规则
 * 给菜单标题 10px 间距
 */
export function QbIcon({ style, className }: { style?: React.CSSProperties; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-4 -4 56 56"
      fill="none"
      stroke="currentColor"
      // 原文件 stroke-width=1(48 画布)在 16px 菜单尺寸下发虚,加粗对齐 antd 线性图标观感
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden
      style={{ verticalAlign: '-0.125em', ...style }}
    >
      <circle cx="24" cy="24" r="21.5" />
      {/* b */}
      <path d="m26.6511 22.3638c0-2.7805 2.254-5.0345 5.0345-5.0345h0c2.7805 0 5.0345 2.254 5.0345 5.0345v3.2724c0 2.7805-2.254 5.0345-5.0345 5.0345h0c-2.7805 0-5.0345-2.254-5.0345-5.0345" />
      <line x1="26.6511" y1="30.6707" x2="26.6511" y2="10.5327" />
      {/* q */}
      <path d="m21.3489 25.6362c0 2.7805-2.254 5.0345-5.0345 5.0345h0c-2.7805 0-5.0345-2.254-5.0345-5.0345v-3.2724c0-2.7805 2.254-5.0345 5.0345-5.0345h0c2.7805 0 5.0345 2.254 5.0345 5.0345" />
      <line x1="21.3489" y1="17.3293" x2="21.3489" y2="37.4673" />
    </svg>
  )
}
