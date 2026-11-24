import { useId } from "react";
import Button from "./Button";
import InputField from "./InputField";

type Props = {
  fileName: string | null;
  hasGeometry: boolean;
  busy: boolean;
  name: string;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
  onNameChange: (name: string) => void;
  onAnalyze: () => void;
};

export default function BoundaryControls({
  fileName,
  hasGeometry,
  busy,
  name,
  onFile,
  onClear,
  onNameChange,
  onAnalyze,
}: Props) {
  const fileInputId = useId();
  return (
    <>
      <section className="px-6 py-[22px] print:hidden">
        <h2 className="mb-3 text-[1rem] font-bold tracking-[.07em] uppercase">
          Define boundary
        </h2>
        <p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">
          Use the polygon tool on the map or upload a boundary.
        </p>
        <div className="flex space-x-2">
          <label
            htmlFor={fileInputId}
            className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3
            rounded-md border border-[#CBD5CC]
            bg-[#F7F9F6] p-2
            text-sm text-[#34443B]
            shadow-sm
            transition-all duration-200
            hover:border-[#477A59]
            hover:bg-[#F0F5F0]
            focus-within:border-[#477A59]
            focus-within:ring-2
            focus-within:ring-[#477A59]/20"
           >
            <input
              id={fileInputId}
              className="sr-only"
              aria-label="Upload boundary"
              type="file"
              accept=".geojson,.json,.zip"
              onChange={(event) => {
                onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <span className="shrink-0 font-semibold">{ fileName ? "Selected" : "Choose"}</span>
            <span className="truncate font-bold" title={fileName ?? undefined}>
              {fileName ?? "No file chosen"}
            </span>
          </label>
          <Button variant="secondary" onClick={onClear} className="">
            Clear
          </Button>
        </div>

        {/* <p className="mt-2 mb-3 text-[.78rem] leading-[1.5] font-bold text-[#71858b] [overflow-wrap:anywhere]">
          {fileName
            ? `Boundary selected: ${fileName}`
            : hasGeometry ? "Boundary selected" : "No boundary selected"}
        </p> */}
      </section>

      <section className="border-b border-[#dce5e8] px-6  print:hidden">
        {/* <h2 className="mb-3 text-[1rem] font-bold tracking-[.07em] uppercase">
          Run analysis
        </h2> */}
        <InputField
          placeholder="Report name (optional)"
          maxLength={200}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
        <Button
          disabled={busy || (!hasGeometry && !fileName)}
          onClick={onAnalyze}
        >
          {busy ? "Analyzing…" : "Analyze watershed"}
        </Button>
      </section>
    </>
  );
}
