import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card } from '@rundesk/ui'
import { MapPin, Minus, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'

type MapData = {
  fields: Array<{ id: string; name: string }>
  fieldId: string | null
  geocoder: boolean
  tiles: string | null
  markers: Array<{ taskId: string; title: string; address: string; lat: number; lng: number }>
  unplaced: Array<{ taskId: string; title: string; address: string | null }>
}

const TILE = 256
const WIDTH = 760
const HEIGHT = 440
const MIN_Z = 1
const MAX_Z = 17

/** Web Mercator: a point's place on the world drawn at zoom z, in pixels. */
export function project(lat: number, lng: number, z: number): { x: number; y: number } {
  const size = TILE * 2 ** z
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180)
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size }
}

/** The zoom and centre that hold every point, with a margin, in the frame. */
function fit(points: Array<{ lat: number; lng: number }>): { z: number; cx: number; cy: number } {
  if (points.length === 0) return { z: 2, cx: (TILE * 4) / 2, cy: (TILE * 4) / 2 }
  for (let z = Math.min(MAX_Z, 14); z >= MIN_Z; z--) {
    const xy = points.map((p) => project(p.lat, p.lng, z))
    const xs = xy.map((p) => p.x)
    const ys = xy.map((p) => p.y)
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    if (w <= WIDTH - 80 && h <= HEIGHT - 80) {
      return { z, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 }
    }
  }
  const xy = points.map((p) => project(p.lat, p.lng, MIN_Z))
  return { z: MIN_Z, cx: xy.reduce((a, p) => a + p.x, 0) / xy.length, cy: xy.reduce((a, p) => a + p.y, 0) / xy.length }
}

/**
 * A LIST'S MAP VIEW (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 *
 * ClickUp's Map plots the location's tasks by a chosen Location field, whose
 * addresses are searched as they are typed, and lists the tasks without a
 * location in its sidebar. The places are the server's — found when the
 * address was saved (`GET /lists/:listId/map`) — and the map is drawn from the
 * tile server the workspace's operator set, one 256-pixel square at a time:
 * no map library, the projection is the few lines above. With no geocoder set
 * the view says so; with no tile server it says that, and asks for no tiles.
 */
export function MapView({
  listId,
  stamp,
  onOpenTask,
}: {
  listId: string
  stamp: number
  onOpenTask: (id: string) => void
}) {
  const { t } = useTranslation()
  const [fieldId, setFieldId] = useState<string | null>(null)
  const map = useQuery({
    queryKey: ['list-map', listId, fieldId, stamp],
    queryFn: () => api<MapData>(`/lists/${listId}/map${fieldId ? `?fieldId=${fieldId}` : ''}`),
    placeholderData: (prev: MapData | undefined) => prev,
    retry: false,
  })
  const data = map.data
  const markers = data?.markers ?? []

  // The view's frame: refitted when the set of places changes, then the reader's to move.
  const placesKey = markers.map((m) => `${m.taskId}:${m.lat},${m.lng}`).join('|')
  const [view, setView] = useState(() => fit([]))
  useEffect(() => {
    setView(fit(markers))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey])

  const zoom = (dz: number) =>
    setView((v) => {
      const z = Math.max(MIN_Z, Math.min(MAX_Z, v.z + dz))
      const k = 2 ** (z - v.z)
      return { z, cx: v.cx * k, cy: v.cy * k }
    })

  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const left = view.cx - WIDTH / 2
  const top = view.cy - HEIGHT / 2
  const n = 2 ** view.z

  const tiles = useMemo(() => {
    if (!data?.tiles) return []
    const out: Array<{ key: string; src: string; x: number; y: number }> = []
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + WIDTH) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + HEIGHT) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue
        const wx = ((tx % n) + n) % n
        const src = data.tiles.replace('{z}', String(view.z)).replace('{x}', String(wx)).replace('{y}', String(ty)).replace('{s}', 'a')
        out.push({ key: `${view.z}/${tx}/${ty}`, src, x: tx * TILE - left, y: ty * TILE - top })
      }
    }
    return out
  }, [data?.tiles, left, top, n, view.z])

  if (map.isError) {
    return (
      <Card className="p-4 text-sm text-destructive" data-testid="map-view-failed">
        {t('list.map.failed')}
      </Card>
    )
  }
  if (!data) return <Card className="p-4" data-testid="map-view-loading" aria-busy />

  return (
    <Card className="p-0" data-testid="map-view" data-field-id={data.fieldId ?? ''} data-geocoder={data.geocoder} data-tiles={!!data.tiles}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        {data.fields.length > 0 ? (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            {t('list.map.field')}
            <select
              data-testid="map-field"
              value={data.fieldId ?? ''}
              onChange={(e) => setFieldId(e.target.value || null)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              {data.fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-sm text-muted-foreground" data-testid="map-no-field">
            {t('list.map.noField')}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" data-testid="map-zoom-out" aria-label={t('list.map.zoomOut')} onClick={() => zoom(-1)}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" data-testid="map-zoom-in" aria-label={t('list.map.zoomIn')} onClick={() => zoom(1)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      {!data.geocoder && (
        <p className="border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid="map-no-geocoder">
          {t('list.map.noGeocoder')}
        </p>
      )}
      <div className="flex">
        <div className="min-w-0 flex-1 overflow-hidden p-3">
          <div
            data-testid="map-canvas"
            data-zoom={view.z}
            className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-md border border-border bg-[#eef4ea] dark:bg-[#1c2420]"
            style={{ width: WIDTH, height: HEIGHT, maxWidth: '100%' }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('[data-testid="map-marker"]')) return
              drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }
              // Followed on the window, so a pan that leaves the frame still ends.
              const move = (ev: PointerEvent) => {
                const d = drag.current
                if (!d) return
                setView((v) => ({ ...v, cx: d.cx - (ev.clientX - d.x), cy: d.cy - (ev.clientY - d.y) }))
              }
              const up = () => {
                drag.current = null
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
            }}
          >
            {!data.tiles && (
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground" data-testid="map-no-tiles">
                {t('list.map.noTiles')}
              </p>
            )}
            {tiles.map((tile) => (
              <img
                key={tile.key}
                data-testid="map-tile"
                src={tile.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute select-none"
                style={{ left: tile.x, top: tile.y, width: TILE, height: TILE }}
              />
            ))}
            {markers.map((m) => {
              const p = project(m.lat, m.lng, view.z)
              return (
                <button
                  key={m.taskId}
                  type="button"
                  data-testid="map-marker"
                  data-task-id={m.taskId}
                  data-lat={m.lat}
                  data-lng={m.lng}
                  title={`${m.title} — ${m.address}`}
                  onClick={() => onOpenTask(m.taskId)}
                  className="absolute -translate-x-1/2 -translate-y-full text-brand-600 drop-shadow hover:text-brand-800"
                  style={{ left: p.x - left, top: p.y - top }}
                >
                  <MapPin className="h-7 w-7 fill-current stroke-white" />
                  <span className="sr-only">{m.title}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground" data-testid="map-count" data-placed={markers.length}>
            {t('list.map.placed', { count: markers.length })}
          </p>
        </div>
        <aside className="w-60 shrink-0 border-l border-border p-3" data-testid="map-unplaced" data-count={data.unplaced.length}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('list.map.noLocation')} <span className="tabular-nums">{data.unplaced.length}</span>
          </h4>
          <ul className="space-y-1">
            {data.unplaced.map((u) => (
              <li key={u.taskId}>
                <button
                  type="button"
                  data-testid="map-unplaced-item"
                  data-task-id={u.taskId}
                  data-address={u.address ?? ''}
                  className="w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-muted"
                  onClick={() => onOpenTask(u.taskId)}
                >
                  <span className="block truncate">{u.title}</span>
                  {u.address && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {t('list.map.notFound', { address: u.address })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Card>
  )
}
