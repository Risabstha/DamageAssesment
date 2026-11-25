import { useId, useState } from "react";
import type { RiverBuffer } from "../api/RiverStreamsApi";
import type { RiverFeature } from "../utils/riverStreamLayer";
import Button from "./Button";
import InputField from "./InputField";

const MIN_BUFFER_METERS = 10;
const MAX_BUFFER_METERS = 1000;

type Props = {
  stream: RiverFeature;
  distance: number;
  buffer: RiverBuffer | null;
  loading: boolean;
  error: string;
  onDistanceChange: (distance: number) => void;
  onUseBoundary: () => void;
  onRetry: () => void;
  onClose: () => void;
};

function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`
    : `${meters} m`;
}

export default function RiverStreamPanel({
  stream,
  distance,
  buffer,
  loading,
  error,
  onDistanceChange,
  onUseBoundary,
  onRetry,
  onClose,
}: Props) {
  const sliderId = useId();
  const [distanceInput, setDistanceInput] = useState<string | null>(null);
  const inputValue = Number(distanceInput);
  const invalidDistance =
    distanceInput !== null &&
    (distanceInput.trim() === "" ||
      !Number.isInteger(inputValue) ||
      inputValue < MIN_BUFFER_METERS ||
      inputValue > MAX_BUFFER_METERS);
  return (
    <section
      className="absolute bottom-10 right-3 z-[1000] flex w-[260px] max-w-[calc(100%-24px)] flex-col gap-[6px] rounded-[6px] bg-white px-3 py-[10px] text-[.8rem] shadow-[0_1px_5px_#0004] print:hidden"
      aria-label="Selected river stream"
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="text-[.9rem] [overflow-wrap:anywhere]">
          {stream.properties.name || "Unnamed stream"}
        </strong>
        <button
          type="button"
          className="cursor-pointer bg-transparent px-[6px] py-0 text-[1.2rem] leading-none text-[#60777d]"
          aria-label="Close selected stream"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-[2px]">
        <dt className="text-[#60777d]">Type</dt>
        <dd>{stream.properties.waterway || "Unknown"}</dd>
        {/* <dt className="text-[#60777d]">ID</dt>
        <dd>{stream.id}</dd> */}
      </dl>
      <label htmlFor={sliderId}>
        Buffer distance: <strong>{formatDistance(distance)}</strong>
      </label>
      <InputField
        id={sliderId}
        type="range"
        min={MIN_BUFFER_METERS}
        max={MAX_BUFFER_METERS}
        step={1}
        value={distance}
        onChange={(event) => {
          setDistanceInput(null);
          onDistanceChange(Number(event.target.value));
        }}
      />
      <div
        className="flex justify-between text-[.7rem] text-[#60777d]"
        aria-hidden="true"
      >
        <span>{formatDistance(MIN_BUFFER_METERS)}</span>
        <span>{formatDistance(MAX_BUFFER_METERS)}</span>
      </div>
      <label htmlFor={`${sliderId}-input`}>Buffer distance (metres)</label>
      <InputField
        id={`${sliderId}-input`}
        type="number"
        min={MIN_BUFFER_METERS}
        max={MAX_BUFFER_METERS}
        step={1}
        value={distanceInput ?? distance}
        aria-invalid={invalidDistance}
        aria-describedby={invalidDistance ? `${sliderId}-error` : undefined}
        onChange={(event) => {
          setDistanceInput(event.target.value);
          if (event.target.value !== "" && event.target.validity.valid) {
            onDistanceChange(event.target.valueAsNumber);
          }
        }}
      />
      {invalidDistance && (
        <span id={`${sliderId}-error`} role="alert" className="text-[.72rem] text-[#a33432]">
          Enter a whole number from {MIN_BUFFER_METERS} to {MAX_BUFFER_METERS} metres.
        </span>
      )}
      {error ? (
        <span role="alert" className="text-[.72rem] text-[#a33432]">
          {error}
        </span>
      ) : (
        <span role="status" className="text-[.72rem] text-[#60777d]">
          {loading
            ? "Creating buffer…"
            : buffer
              ? `Buffer area: ${buffer.properties.area_km2.toLocaleString()} km²`
              : "Move the slider or enter a distance to preview a buffer."}
        </span>
      )}
      <div className="flex justify-end gap-[6px]">
        {error && (
          <Button variant="secondary" size="small" disabled={invalidDistance} onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button
          size="small"
          disabled={!buffer || loading || invalidDistance}
          onClick={onUseBoundary}
        >
          Use as boundary
        </Button>
      </div>
    </section>
  );
}
