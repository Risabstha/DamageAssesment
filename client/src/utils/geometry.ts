import type { Geometry } from "../types/watershed";

export function extractGeometry(value: unknown): Geometry {
  if (!value || typeof value !== "object") throw new Error("Invalid GeoJSON.");
  const obj = value as Record<string, unknown>;
  if (obj.type === "Feature") return extractGeometry(obj.geometry);
  if (
    obj.type === "FeatureCollection" &&
    Array.isArray(obj.features) &&
    obj.features.length
  )
    return extractGeometry(obj.features[0]);
  if (isGeometry(value)) return value;
  throw new Error("Expected a Polygon or MultiPolygon.");
}

function isGeometry(value: object): value is Geometry {
  return (
    "type" in value &&
    (value.type === "Polygon" || value.type === "MultiPolygon") &&
    "coordinates" in value &&
    Array.isArray(value.coordinates)
  );
}
