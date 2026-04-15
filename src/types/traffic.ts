export type TrafficCheckpoint = 90 | 60 | 30 | 15; // minutes before arrival

export interface RouteRequest {
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  arrivalTime: string; // ISO 8601
  travelMode: 'DRIVE';
  routingPreference: 'TRAFFIC_AWARE' | 'TRAFFIC_UNAWARE';
}

export interface TrafficResult {
  durationSeconds: number;
  staticDurationSeconds: number; // baseline without traffic
  distanceMeters: number;
  polylineEncoded?: string; // Phase 2: map rendering
  fetchedAt: string; // ISO 8601
  checkpoint: TrafficCheckpoint;
  isFailsafe: boolean; // true when result came from fallback logic
}

// Subset of Google Maps Routes API v2 response shape
export interface RoutesApiResponse {
  routes: Array<{
    duration: string; // e.g. "1234s"
    staticDuration: string;
    distanceMeters: number;
    polyline?: { encodedPolyline: string };
  }>;
}

export type WeatherCondition = 'clear' | 'rain' | 'snow' | 'fog'; // Phase 2
