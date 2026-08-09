// ヘッダーコンポーネント
// メインエリア上部に表示されるタイトル、検索、ビュー切り替え、並び替えを提供する

interface HeaderProps {
  title: string
  count: number
  searchQuery: string
  onSearchChange: (query: string) => void
}

// 小さなアイコンを SVG で定義
function SmallIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    search:
      'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    grid: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z',
    list: 'M3 5h18v2H3V5zm0 6h18v2H3v-11zm0 6h18v2H3v-2z',
    chevron: 'M7 10l5 5 5-5H7z',
  }

  return (
    <svg className="header-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] || paths.search} />
    </svg>
  )
}

export function Header({ title, count, searchQuery, onSearchChange }: HeaderProps) {
  return (
    <header className="main-header">
      <div className="header-title-area">
        <h2 className="header-title">{title}</h2>
        <span className="header-count">{count}件のクリップ</span>
      </div>

      <div className="header-actions">
        {/* 検索欄 */}
        <div className="search-box">
          <SmallIcon name="search" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="クリップを検索..."
            aria-label="クリップを検索"
          />
        </div>

        {/* ビュー切り替え */}
        <div className="view-toggle">
          <button type="button" className="view-button active" aria-label="グリッド表示">
            <SmallIcon name="grid" />
          </button>
          <button type="button" className="view-button" aria-label="リスト表示">
            <SmallIcon name="list" />
          </button>
        </div>

        {/* 並び替え */}
        <div className="sort-dropdown">
          <span>新しい順</span>
          <SmallIcon name="chevron" />
        </div>
      </div>
    </header>
  )
}
