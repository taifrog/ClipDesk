import { useEffect, useMemo, useState } from 'react'
import type { Clip } from '../types'

// カレンダー表示コンポーネントのプロパティ
interface CalendarViewProps {
  // 表示対象のクリップ一覧
  clips: Clip[]
}

// カレンダー上に表示するクリップイベント（日付キー正規化済み）
interface CalendarEvent {
  // クリップID
  id: number
  // タイトル
  title: string
  // 開始日キー（YYYY-MM-DD）
  startKey: string
  // 終了日キー（YYYY-MM-DD）
  endKey: string
  // タイトル表示日キー（当月1日強制クランプ済み）
  labelKey: string
}

// 日付を YYYY-MM-DD 形式の文字列に変換する
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ISO日時または YYYY-MM-DD を YYYY-MM-DD（ローカル日付）に正規化する
// 不正な入力の場合は null を返す
function toDateKey(input: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input
  const date = new Date(input)
  if (isNaN(date.getTime())) return null
  return formatDateKey(date)
}

// ISO日時を日本語の日時表示（JST前提）に整形する
function formatJP(isoString: string | null | undefined): string {
  if (!isoString) return '未設定'
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) {
    const [y, m, d] = isoString.split('-')
    return `${y}/${m}/${d}`
  }
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 指定した年月のカレンダーに必要な日付配列を生成する
// 前後の月の日付も含めて週の単位で揃える
function getCalendarDays(year: number, month: number): Date[] {
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const lastDayOfMonth = new Date(year, month, 0)

  // 月初めの曜日（0=日曜日）
  const startDayOfWeek = firstDayOfMonth.getDay()

  const days: Date[] = []

  // 前月の日付を追加
  const prevMonthLastDate = new Date(year, month - 1, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month - 2, prevMonthLastDate - i))
  }

  // 当月の日付を追加
  for (let date = 1; date <= lastDayOfMonth.getDate(); date++) {
    days.push(new Date(year, month - 1, date))
  }

  // 翌月の日付を追加（6週間分になるように）
  const remainingDays = 42 - days.length
  for (let date = 1; date <= remainingDays; date++) {
    days.push(new Date(year, month, date))
  }

  return days
}

// スマホ幅（768px以下）かどうかを返すフック
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

// カレンダー表示コンポーネント
// eventStartDate または eventEndDate が設定されたクリップを月カレンダー上に期間表示する
export function CalendarView({ clips }: CalendarViewProps) {
  // 表示中の年月（初期値は今月）
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1)
  // 選択中のクリップID
  const [selectedClipId, setSelectedClipId] = useState<number | null>(null)
  // +n件で開いている日のキー（YYYY-MM-DD）
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  // スマホ幅かどうか
  const isMobile = useIsMobile()
  // 1日あたりの最大表示件数（PC: 5、モバイル: 3）
  const maxPerDay = isMobile ? 3 : 5

  // 当月の初日・末日キー
  const monthFirstKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
  const monthLastKey = formatDateKey(new Date(currentYear, currentMonth, 0))

  // イベント情報を持つクリップを抽出し、日付キー正規化済みのカレンダーイベントに変換する
  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = []
    for (const clip of clips) {
      const rawStart = clip.eventStartDate || clip.eventEndDate
      const rawEnd = clip.eventEndDate || clip.eventStartDate
      if (!rawStart || !rawEnd) continue
      const parsedStart = toDateKey(rawStart)
      const parsedEnd = toDateKey(rawEnd)
      if (!parsedStart || !parsedEnd) continue
      // 開始＞終了の逆転時は単日扱いにする
      const startKey = parsedStart
      const endKey = parsedEnd < parsedStart ? parsedStart : parsedEnd
      // タイトル表示日は当月にクランプ（先月からの継続は当月1日に強制）
      const labelKey =
        startKey < monthFirstKey ? monthFirstKey : startKey > monthLastKey ? monthLastKey : startKey
      list.push({ id: clip.id, title: clip.title, startKey, endKey, labelKey })
    }
    // 開始日順→ID順に並べる
    list.sort((a, b) =>
      a.startKey < b.startKey ? -1 : a.startKey > b.startKey ? 1 : a.id - b.id,
    )
    return list
  }, [clips, monthFirstKey, monthLastKey])

  // カレンダー表示用の日付配列
  const calendarDays = useMemo(() => {
    return getCalendarDays(currentYear, currentMonth)
  }, [currentYear, currentMonth])

  // 前月へ移動する
  const handlePrevMonth = () => {
    setSelectedDayKey(null)
    if (currentMonth === 1) {
      setCurrentYear((prev) => prev - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth((prev) => prev - 1)
    }
  }

  // 翌月へ移動する
  const handleNextMonth = () => {
    setSelectedDayKey(null)
    if (currentMonth === 12) {
      setCurrentYear((prev) => prev + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth((prev) => prev + 1)
    }
  }

  // 当月に戻る
  const handleToday = () => {
    setSelectedDayKey(null)
    const today = new Date()
    setCurrentYear(today.getFullYear())
    setCurrentMonth(today.getMonth() + 1)
  }

  // 選択中のクリップ詳細
  const selectedClip = useMemo(() => {
    if (selectedClipId === null) return null
    return clips.find((clip) => clip.id === selectedClipId) || null
  }, [selectedClipId, clips])

  // その日に該当するイベントを取得する
  const getEventsForDay = (day: Date): CalendarEvent[] => {
    const dayKey = formatDateKey(day)
    return events.filter((event) => {
      return event.startKey <= dayKey && dayKey <= event.endKey
    })
  }

  // 選択中の日のイベント一覧
  const selectedDayEvents = useMemo(() => {
    if (!selectedDayKey) return []
    return events.filter((event) => event.startKey <= selectedDayKey && selectedDayKey <= event.endKey)
  }, [events, selectedDayKey])

  // イベントが期間の開始日かどうか
  const isEventStart = (event: CalendarEvent, day: Date): boolean => {
    return event.startKey === formatDateKey(day)
  }

  // イベントが期間の終了日かどうか
  const isEventEnd = (event: CalendarEvent, day: Date): boolean => {
    return event.endKey === formatDateKey(day)
  }

  // イベントのタイトルを表示すべき日かどうか（開始日 or 当月1日強制）
  const isLabelDay = (event: CalendarEvent, day: Date): boolean => {
    return event.labelKey === formatDateKey(day)
  }

  // 曜日ラベル
  const weekDays = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <div className="calendar-view">
      {/* カレンダーヘッダー */}
      <div className="calendar-header">
        <h2 className="calendar-title">
          {currentYear}年 {currentMonth}月
        </h2>
        <div className="calendar-nav-buttons">
          <button type="button" className="button-secondary" onClick={handlePrevMonth}>
            ← 前月
          </button>
          <button type="button" className="button-secondary" onClick={handleToday}>
            今月
          </button>
          <button type="button" className="button-secondary" onClick={handleNextMonth}>
            翌月 →
          </button>
        </div>
      </div>

      {events.length === 0 && (
        <p className="empty-message">日時が登録されているクリップはありません。</p>
      )}

      {/* 曜日ヘッダー */}
      <div className="calendar-weekdays">
        {weekDays.map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="calendar-grid">
        {calendarDays.map((day) => {
          const dayKey = formatDateKey(day)
          const dayEvents = getEventsForDay(day)
          const visibleEvents = dayEvents.slice(0, maxPerDay)
          const overflowCount = dayEvents.length - visibleEvents.length
          const isCurrentMonth = day.getMonth() + 1 === currentMonth
          const isToday = dayKey === formatDateKey(new Date())

          return (
            <div
              key={day.toISOString()}
              className={`calendar-day ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${selectedDayKey === dayKey ? 'calendar-day-selected' : ''}`}
            >
              <div className="calendar-day-number">{day.getDate()}</div>
              <div className="calendar-day-events">
                {visibleEvents.map((event) => {
                  const showLabel = isLabelDay(event, day)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`calendar-event ${isEventStart(event, day) ? 'event-start' : ''} ${isEventEnd(event, day) ? 'event-end' : ''} ${showLabel ? '' : 'continuation'}`}
                      onClick={() => setSelectedClipId(event.id)}
                      title={event.title}
                    >
                      {showLabel && <span className="calendar-event-title">{event.title}</span>}
                    </button>
                  )
                })}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    className="calendar-more"
                    onClick={() => setSelectedDayKey(dayKey)}
                  >
                    +{overflowCount}件
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* +n件で開いた日の予定リスト */}
      {selectedDayKey && (
        <div className="calendar-day-list">
          <h3 className="calendar-day-list-title">{formatJP(selectedDayKey)} の予定（{selectedDayEvents.length}件）</h3>
          {selectedDayEvents.length === 0 ? (
            <p className="calendar-detail-meta">この日の予定はありません。</p>
          ) : (
            <ul>
              {selectedDayEvents.map((event) => (
                <li key={event.id}>
                  <button type="button" onClick={() => setSelectedClipId(event.id)}>
                    {event.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 選択中のクリップ詳細 */}
      {selectedClip && (
        <div className="calendar-detail">
          <h3 className="calendar-detail-title">
            <a href={selectedClip.url} target="_blank" rel="noopener noreferrer">
              {selectedClip.title}
            </a>
          </h3>
          <p className="calendar-detail-meta">
            期間: {formatJP(selectedClip.eventStartDate)}
            {selectedClip.eventEndDate && selectedClip.eventEndDate !== selectedClip.eventStartDate
              ? ` 〜 ${formatJP(selectedClip.eventEndDate)}`
              : ''}
          </p>
          {selectedClip.location && (
            <p className="calendar-detail-meta">場所: {selectedClip.location}</p>
          )}
          {selectedClip.summary && (
            <p className="calendar-detail-summary">{selectedClip.summary}</p>
          )}
        </div>
      )}
    </div>
  )
}
