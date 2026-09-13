'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  /** CSS colour for the marker. */
  color?: string;
}

export interface MapPolyline {
  id: string | number;
  points: [number, number][];
  color?: string;
  label?: string;
}

/**
 * Leaflet map, mounted imperatively.
 *
 * Loaded through a plain dynamic import rather than react-leaflet so the
 * whole Leaflet bundle stays out of the initial page payload — this map
 * only appears on two routes.
 */
export function TrackingMap({
  markers = [],
  polylines = [],
  center,
  zoom = 12,
  className,
  height = 480,
}: {
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  /**
   * Centre on whatever has been plotted; fall back to (0, 0) only when
   * there is genuinely nothing to show.
   *
   * The fallback used to be Dhaka, which meant a tenant anywhere else saw
   * their empty map open over Bangladesh. A null island is at least
   * honestly nowhere, and the empty state covers it anyway.
   */
  const resolvedCenter = useMemo<[number, number]>(() => {
    if (center) return center;
    const all = [...markers.map((m) => [m.lat, m.lng] as [number, number]), ...polylines.flatMap((p) => p.points)];
    if (all.length === 0) return [0, 0];
    const lat = all.reduce((sum, point) => sum + point[0], 0) / all.length;
    const lng = all.reduce((sum, point) => sum + point[1], 0) / all.length;
    return [lat, lng];
  }, [center, markers, polylines]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          center: resolvedCenter,
          zoom,
          scrollWheelZoom: false,
          attributionControl: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors',
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const layer = layerRef.current;
      layer.clearLayers();

      for (const line of polylines) {
        if (line.points.length < 2) continue;
        L.polyline(line.points, {
          color: line.color ?? 'rgb(79,70,229)',
          weight: 3,
          opacity: 0.85,
        })
          .bindTooltip(line.label ?? '', { sticky: true })
          .addTo(layer);
        // Start and end caps make direction readable at a glance.
        L.circleMarker(line.points[0], {
          radius: 5, color: '#ffffff', weight: 2,
          fillColor: 'rgb(12,163,12)', fillOpacity: 1,
        })
          .bindTooltip(`Start — ${line.label ?? ''}`)
          .addTo(layer);
        L.circleMarker(line.points[line.points.length - 1], {
          radius: 5, color: '#ffffff', weight: 2,
          fillColor: 'rgb(208,59,59)', fillOpacity: 1,
        })
          .bindTooltip(`Latest — ${line.label ?? ''}`)
          .addTo(layer);
      }

      for (const marker of markers) {
        L.circleMarker([marker.lat, marker.lng], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: marker.color ?? 'rgb(79,70,229)',
          fillOpacity: 1,
        })
          .bindTooltip(
            `<strong>${escapeHtml(marker.label)}</strong>${
              marker.sublabel ? `<br/>${escapeHtml(marker.sublabel)}` : ''
            }`,
            { direction: 'top' },
          )
          .addTo(layer);
      }

      // Fit to the data when there is any, otherwise keep the default view.
      const bounds: [number, number][] = [
        ...markers.map((m) => [m.lat, m.lng] as [number, number]),
        ...polylines.flatMap((p) => p.points),
      ];
      if (bounds.length > 1) {
        mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
      } else if (bounds.length === 1) {
        mapRef.current.setView(bounds[0], 14);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markers, polylines, resolvedCenter, zoom]);

  // Tear the map down on unmount so a route change cannot leak it.
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className={cn('w-full overflow-hidden rounded-lg border border-line', className)}
      style={{ height }}
      role="application"
      aria-label="Map"
    />
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
