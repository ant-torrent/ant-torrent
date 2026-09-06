/**
 * antd 图标库未内置 RSS 图形，这里内联 SVG 提供
 * （1em / currentColor，与 @ant-design/icons 风格一致，可当作 icon 属性使用）。
 * className 必须透传：antd Menu 注入 ant-menu-item-icon 类，丢弃会导致图标贴住菜单文字。
 */
export function RssIcon({
  style,
  spin,
  className,
}: {
  style?: React.CSSProperties
  spin?: boolean
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 1024 1024"
      fill="currentColor"
      width="1em"
      height="1em"
      aria-hidden
      style={{
        verticalAlign: '-0.125em',
        animation: spin ? 'antSpin 1s infinite linear' : undefined,
        ...style,
      }}
    >
      <path d="M256 768a64 64 0 1 0 128 0 64 64 0 1 0-128 0zm-64-448v96c160 0 288 128 288 288h96c0-212-172-384-384-384zm0-224v96c282.8 0 512 229.2 512 512h96c0-335.3-272.7-608-608-608z" />
    </svg>
  )
}
