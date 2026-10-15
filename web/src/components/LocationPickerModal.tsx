'use client';

import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { LocateFixed, MapPin, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { googleMapsApiKey } from '@/lib/env';
import { useLocale, useT } from '@/lib/i18n/locale-context';
import {
  FALLBACK_COORDS,
  coordsOrFallback,
  requestPermissionAndGetCoordinates,
} from '@/lib/userLocation';

export type PickedLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

type Props = {
  open: boolean;
  initial?: Partial<PickedLocation> | null;
  onClose: () => void;
  onConfirm: (picked: PickedLocation) => void;
};

type Prediction = {
  placeId: string;
  description: string;
  mainText: string;
};

const MAP_HEIGHT = 280;

type SharedState = {
  label: string;
  setLabel: (v: string) => void;
  coords: { latitude: number; longitude: number };
  setCoords: (v: { latitude: number; longitude: number }) => void;
  query: string;
  setQuery: (v: string) => void;
  predictions: Prediction[];
  setPredictions: (v: Prediction[]) => void;
  searching: boolean;
  setSearching: (v: boolean) => void;
  resolving: boolean;
  setResolving: (v: boolean) => void;
  skipReverseRef: React.MutableRefObject<boolean>;
  searchSeq: React.MutableRefObject<number>;
  initialCoords: { latitude: number; longitude: number };
  initialLabel: string;
  onClose: () => void;
  onConfirm: (picked: PickedLocation) => void;
};

function MapIdleTracker({
  onIdle,
}: {
  onIdle: (coords: { lat: number; lng: number }) => void;
}) {
  const map = useMap();
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('idle', () => {
      const center = map.getCenter();
      if (!center) return;
      onIdleRef.current({ lat: center.lat(), lng: center.lng() });
    });
    return () => listener.remove();
  }, [map]);

  return null;
}

function MapController({
  target,
  zoom,
}: {
  target: { lat: number; lng: number } | null;
  zoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    if (typeof zoom === 'number') map.setZoom(zoom);
  }, [map, target, zoom]);
  return null;
}

function LocationPickerInner({ state }: { state: SharedState }) {
  const t = useT();
  const { locale } = useLocale();
  const places = useMapsLibrary('places');
  const geocodeLib = useMapsLibrary('geocoding');
  const placesAttrRef = useRef<HTMLDivElement>(null);
  const [panTarget, setPanTarget] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [panZoom, setPanZoom] = useState<number | undefined>(undefined);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!geocodeLib) return '';
      try {
        const geocoder = new geocodeLib.Geocoder();
        const response = await geocoder.geocode({
          location: { lat, lng },
          language: locale === 'en' ? 'en' : 'ja',
        });
        const result = response.results?.[0];
        if (!result) return '';
        const premise = result.address_components?.find((c) =>
          c.types.some((type) =>
            [
              'establishment',
              'point_of_interest',
              'premise',
              'park',
              'route',
            ].includes(type),
          ),
        )?.long_name;
        const address = result.formatted_address?.trim() || '';
        if (premise && address && !address.startsWith(premise)) {
          return `${premise} · ${address}`;
        }
        return premise || address;
      } catch {
        return '';
      }
    },
    [geocodeLib, locale],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (state.initialLabel.trim()) return;
      const result = await requestPermissionAndGetCoordinates();
      const current = result.coords;
      if (cancelled || !current) return;
      state.setCoords(current);
      setPanTarget({ lat: current.latitude, lng: current.longitude });
      setPanZoom(15);
      const resolved = await reverseGeocode(
        current.latitude,
        current.longitude,
      );
      if (!cancelled && resolved) state.setLabel(resolved);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per open
  }, []);

  useEffect(() => {
    const trimmed = state.query.trim();
    if (!places || trimmed.length < 2) {
      state.setPredictions([]);
      state.setSearching(false);
      return;
    }
    const seq = ++state.searchSeq.current;
    state.setSearching(true);
    const service = new places.AutocompleteService();
    service.getPlacePredictions(
      {
        input: trimmed,
        language: locale === 'en' ? 'en' : 'ja',
        componentRestrictions: { country: 'jp' },
        locationBias: {
          center: {
            lat: state.coords.latitude,
            lng: state.coords.longitude,
          },
          radius: 30000,
        },
      },
      (results, status) => {
        if (seq !== state.searchSeq.current) return;
        state.setSearching(false);
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !results?.length
        ) {
          state.setPredictions([]);
          return;
        }
        state.setPredictions(
          results.slice(0, 6).map((item) => ({
            placeId: item.place_id,
            description: item.description,
            mainText:
              item.structured_formatting?.main_text || item.description,
          })),
        );
      },
    );
  }, [
    state.query,
    places,
    locale,
    state.coords.latitude,
    state.coords.longitude,
    state,
  ]);

  const onMapIdle = useCallback(
    async (next: { lat: number; lng: number }) => {
      state.setCoords({ latitude: next.lat, longitude: next.lng });
      if (state.skipReverseRef.current) {
        state.skipReverseRef.current = false;
        return;
      }
      state.setResolving(true);
      const resolved = await reverseGeocode(next.lat, next.lng);
      state.setResolving(false);
      if (resolved) state.setLabel(resolved);
    },
    [reverseGeocode, state],
  );

  function selectPrediction(prediction: Prediction) {
    if (!places || !placesAttrRef.current) return;
    state.setQuery('');
    state.setPredictions([]);
    const service = new places.PlacesService(placesAttrRef.current);
    service.getDetails(
      {
        placeId: prediction.placeId,
        fields: ['geometry', 'name', 'formatted_address'],
        language: locale === 'en' ? 'en' : 'ja',
      },
      (place, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          return;
        }
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const nextLabel = [place.name, place.formatted_address]
          .filter((part): part is string => Boolean(part?.trim()))
          .slice(0, 2)
          .join(' · ');
        state.skipReverseRef.current = true;
        state.setCoords({ latitude: lat, longitude: lng });
        state.setLabel(nextLabel || prediction.mainText);
        setPanTarget({ lat, lng });
        setPanZoom(16);
      },
    );
  }

  async function goCurrentLocation() {
    const result = await requestPermissionAndGetCoordinates();
    const current = result.coords;
    if (!current) return;
    state.skipReverseRef.current = false;
    state.setCoords(current);
    setPanTarget({ lat: current.latitude, lng: current.longitude });
    setPanZoom(16);
  }

  function confirm() {
    const trimmed = state.label.trim();
    if (!trimmed) return;
    state.onConfirm({
      latitude: state.coords.latitude,
      longitude: state.coords.longitude,
      label: trimmed,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={placesAttrRef} className="hidden" aria-hidden />
      <div className="relative shrink-0 space-y-2 border-b border-[#E4EBEE] px-4 py-3">
        <div className="relative">
          <input
            className="h-11 w-full rounded-full border border-[#E4EBEE] bg-[#F4F7F8] px-4 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35"
            value={state.query}
            onChange={(e) => state.setQuery(e.target.value)}
            placeholder={t('createEvent.locationSearchPlaceholder')}
            autoComplete="off"
          />
          {state.predictions.length > 0 ? (
            <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-48 overflow-y-auto rounded-2xl bg-white py-1 shadow-lg ring-1 ring-[#E4EBEE]">
              {state.predictions.map((item) => (
                <li key={item.placeId}>
                  <button
                    type="button"
                    className="block w-full px-3.5 py-2.5 text-left text-sm font-bold text-[#12202A] hover:bg-[#E5F9FC]"
                    onClick={() => selectPrediction(item)}
                  >
                    {item.description}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="text-[11px] font-bold leading-relaxed text-[#8A9199]">
          {t('createEvent.locationMapHint')}
        </p>
      </div>

      <div
        className="relative shrink-0 overflow-hidden bg-[#E5F9FC]"
        style={{ height: MAP_HEIGHT }}
      >
        <Map
          defaultCenter={{
            lat: state.initialCoords.latitude,
            lng: state.initialCoords.longitude,
          }}
          defaultZoom={15}
          gestureHandling="greedy"
          disableDefaultUI
          style={{ width: '100%', height: MAP_HEIGHT }}
        >
          <MapIdleTracker onIdle={(c) => void onMapIdle(c)} />
          <MapController target={panTarget} zoom={panZoom} />
        </Map>
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 grid h-10 w-10 -translate-x-1/2 -translate-y-[90%] place-items-center rounded-full bg-[#12B8D0] text-white shadow-md ring-2 ring-white"
          aria-hidden
        >
          <MapPin size={18} strokeWidth={2.6} />
        </span>
        <button
          type="button"
          onClick={() => void goCurrentLocation()}
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#12202A] shadow-md ring-1 ring-[#E4EBEE]"
        >
          <LocateFixed size={14} />
          {t('createEvent.currentLocation')}
        </button>
        {state.resolving ? (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#5B6B75] shadow-sm">
            {t('common.loading')}
          </span>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 px-4 py-3">
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">
            {t('createEvent.placeName')}
          </span>
          <input
            className="mt-1.5 h-11 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35"
            value={state.label}
            onChange={(e) => state.setLabel(e.target.value)}
            placeholder={t('createEvent.placePlaceholder')}
          />
        </label>
      </div>

      <div className="mt-auto shrink-0 space-y-2 border-t border-[#E4EBEE] px-4 py-3">
        <button
          type="button"
          disabled={!state.label.trim()}
          onClick={confirm}
          className="flex h-12 w-full items-center justify-center rounded-full bg-[#12202A] text-sm font-extrabold text-white disabled:opacity-50"
        >
          {t('createEvent.confirmLocation')}
        </button>
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={state.onClose}
            className="text-sm font-extrabold text-[#5B6B75]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!state.label.trim()}
            onClick={confirm}
            className="text-sm font-extrabold text-[#12B8D0] disabled:opacity-50"
          >
            {t('createEvent.decide')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LocationPickerModal({
  open,
  initial,
  onClose,
  onConfirm,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const apiKey = googleMapsApiKey();

  const initialCoords = coordsOrFallback({
    latitude: initial?.latitude ?? FALLBACK_COORDS.latitude,
    longitude: initial?.longitude ?? FALLBACK_COORDS.longitude,
  });
  const initialLabel = initial?.label?.trim() || '';

  const [label, setLabel] = useState(initialLabel);
  const [coords, setCoords] = useState(initialCoords);
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const skipReverseRef = useRef(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setLabel(initialLabel);
    setCoords(initialCoords);
    setQuery('');
    setPredictions([]);
    setSearching(false);
    setResolving(false);
    skipReverseRef.current = false;
  }, [open, initialLabel, initialCoords.latitude, initialCoords.longitude]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const state: SharedState = {
    label,
    setLabel,
    coords,
    setCoords,
    query,
    setQuery,
    predictions,
    setPredictions,
    searching,
    setSearching,
    resolving,
    setResolving,
    skipReverseRef,
    searchSeq,
    initialCoords,
    initialLabel,
    onClose,
    onConfirm,
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-[#0B1A22]/5 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 flex h-[min(94dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4EBEE] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-[#5B6B75] hover:bg-[#F4F7F8]"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
          <h2 className="text-base font-extrabold text-[#12202A]">
            {t('createEvent.pinLocationTitle')}
          </h2>
          <span className="w-9" />
        </div>

        {apiKey ? (
          <APIProvider
            apiKey={apiKey}
            language={locale === 'en' ? 'en' : 'ja'}
            region="JP"
          >
            <LocationPickerInner state={state} />
          </APIProvider>
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm font-bold text-[#5B6B75]">
            {t('map.missingKey')}
          </div>
        )}
      </div>
    </div>
  );
}
