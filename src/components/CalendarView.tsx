import { useMemo, useState } from 'react'
import type { Clip } from '../types'

// カレンダー表示コンポーネントのプロパティ
interface CalendarViewProps {
  // 表示対象のクリップ一覧
  clips: Clip[]
}

// カレンダー上に表示するクリップイベント
interface CalendarEvent {
  // クリップID
  id: number
  // タイトル
  title: string
  // 開始日（YYYY-MM-DD形式）
  startDate: string
  // 終了日（YYYY-MM-DD形式、開始日のみの場合は開始日と同じ）
  endDate: string
}

// 日付を YYYY-MM-DD 形式の文字列に変換する
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

// カレンダー表示コンポーネント
// eventStartDate または eventEndDate が設定されたクリップを月カレンダー上に期間表示する
export function CalendarView({ clips }: CalendarViewProps) {
  // 表示中の年月（初期値は今月）
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1)
  // 選択中のクリップID
  const [selectedClipId, setSelectedClipId] = useState<number | null>(null)

  // イベント情報を持つクリップを抽出し、カレンダーイベントに変換する
  const events = useMemo<CalendarEvent[]>(() => {
    return clips
      .filter((clip) => clip.eventStartDate || clip.eventEndDate)
      .map((clip) => {
        const start = clip.eventStartDate || clip.eventEndDate
        const end = clip.eventEndDate || clip.eventStartDate
        return {
          id: clip.id,
          title: clip.title,
          startDate: start!,
          endDate: end!,
        }
      })
  }, [clips])

  // カレンダー表示用の日付配列
  const calendarDays = useMemo(() => {
    return getCalendarDays(currentYear, currentMonth)
  }, [currentYear, currentMonth])

  // 前月へ移動する
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((prev) => prev - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth((prev) => prev - 1)
    }
  }

  // 翌月へ移動する
  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((prev) => prev + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth((prev) => prev + 1)
    }
  }

  // 当月に戻る
  const handleToday = () => {
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
      return event.startDate <= dayKey && dayKey <= event.endDate
    })
  }

  // イベントが期間の開始日かどうか
  const isEventStart = (event: CalendarEvent, day: Date): boolean => {
    return event.startDate === formatDateKey(day)
  }

  // イベントが期間の終了日かどうか
  const isEventEnd = (event: CalendarEvent, day: Date): boolean => {
    return event.endDate === formatDateKey(day)
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

      {events.length === 0 ? (
        <p className="empty-message">日時が登録されているクリップはありません。</p>
      ) : (
        <>
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
              const dayEvents = getEventsForDay(day)
              const isCurrentMonth = day.getMonth() + 1 === currentMonth
              const isToday = formatDateKey(day) === formatDateKey(new Date())

              return (
                <div
                  key={day.toISOString()}
                  className={`calendar-day ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}`}
                >
                  <div className="calendar-day-number">{day.getDate()}</div>
                  <div className="calendar-day-events">
                    {dayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={`calendar-event ${isEventStart(event, day) ? 'event-start' : ''} ${isEventEnd(event, day) ? 'event-end' : ''}`}
                        onClick={() => setSelectedClipId(event.id)}
                        title={event.title}
                      >
                        {isEventStart(event, day) && (
                          <span className="calendar-event-title">{event.title}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* 選択中のクリップ詳細 */}
      {selectedClip && (
        <div className="calendar-detail">
          <h3 className="calendar-detail-title">
            <a
              href={selectedClip.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {selectedClip.title}
            </a>
          </h3>
          <p className="calendar-detail-meta">
            期間: {selectedClip.eventStartDate} 〜 {selectedClip.eventEndDate || '未設定'}
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
