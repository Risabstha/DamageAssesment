import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/Api";
import * as authApi from "../api/AuthApi";
import * as watershedApi from "../api/WatershedApi";
import BoundaryControls from "../components/BoundaryControls";
import ReportResults from "../components/ReportResults";
import ReportLocationMap from "../components/ReportLocationMap";
import SavedReports from "../components/SavedReports";
import WatershedMap from "../components/WatershedMap";
import type { WatershedMapHandle } from "../components/WatershedMap";
import WatershedLayout from "../layouts/WatershedLayout";
import type { Geometry, Report, Results } from "../types/watershed";
import { extractGeometry } from "../utils/geometry";

export default function WatershedPage() {
  const mapRef = useRef<WatershedMapHandle>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [boundaryFileName, setBoundaryFileName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [user, setUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const onDraw = useCallback((value: Geometry) => {
    setGeometry(value);
    setFile(null);
    setBoundaryFileName(null);
    setResults(null);
    setReportId(null);
  }, []);

  async function refresh() {
    const session = await authApi.getSession();
    setUser(session.username);
    if (session.username) setReports(await watershedApi.getReports());
    else setReports([]);
  }

  useEffect(() => {
    let active = true;
    void authApi
      .getSession()
      .then(async (session) => {
        const history = session.username ? await watershedApi.getReports() : [];
        if (active) {
          setUser(session.username);
          setReports(history);
        }
      })
      .catch((error: unknown) => {
        if (active) setMessage(errorMessage(error, "Could not load session."));
      });
    return () => {
      active = false;
    };
  }, []);

  function showGeometry(value: Geometry, fileName: string | null = null) {
    mapRef.current?.showGeometry(value);
    setGeometry(value);
    setFile(null);
    setBoundaryFileName(fileName);
  }

  function clearBoundary() {
    setGeometry(null);
    setFile(null);
    setBoundaryFileName(null);
    setResults(null);
    setReportId(null);
    mapRef.current?.clearGeometry();
  }

  async function selectFile(selected: File | undefined) {
    if (!selected) return;
    setMessage("");
    setResults(null);
    setReportId(null);
    if (selected.size > 20 * 1024 * 1024) {
      setMessage("File too large (maximum 20 MB).");
      return;
    }
    if (selected.name.toLowerCase().endsWith(".zip")) {
      setFile(selected);
      setBoundaryFileName(selected.name);
      setGeometry(null);
      mapRef.current?.clearGeometry();
      return;
    }
    if (!/\.(geojson|json)$/i.test(selected.name)) {
      setMessage("Choose a GeoJSON file or zipped shapefile.");
      return;
    }
    try {
      showGeometry(
        extractGeometry(JSON.parse(await selected.text()) as unknown),
        selected.name,
      );
    } catch (error) {
      setMessage(errorMessage(error, "Could not read the file."));
    }
  }

  async function analyze() {
    if (!geometry && !file) {
      setMessage("Choose a boundary before analyzing.");
      return;
    }
    setBusy(true);
    setMessage("");
    setResults(null);
    try {
      let boundary: { geometry: Geometry; name: string } | FormData;
      if (file) {
        boundary = new FormData();
        boundary.append("file", file);
        boundary.append("name", name);
      } else {
        if (!geometry) throw new Error("Choose a boundary before analyzing.");
        boundary = { geometry, name };
      }
      const data = await watershedApi.analyzeWatershed(boundary);
      showGeometry(data.geometry, boundaryFileName);
      setResults(data.results);
      setReportId(data.report_id);
      if (user) await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "Analysis failed."));
    } finally {
      setBusy(false);
    }
  }

  async function authenticate(
    action: "login" | "register",
    username: string,
    password: string,
  ) {
    setMessage("");
    try {
      await authApi.authenticate(action, username, password);
      await refresh();
      return true;
    } catch (error) {
      setMessage(errorMessage(error, "Authentication failed."));
      return false;
    }
  }

  async function logout() {
    try {
      await authApi.logout();
      clearBoundary();
      setName("");
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "Could not sign out."));
    }
  }

  async function openReport(id: number) {
    try {
      const report = await watershedApi.getReport(id);
      setName(report.name);
      showGeometry(report.geometry);
      setResults(report.results);
      setReportId(report.id);
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error, "Could not open report."));
    }
  }

  async function deleteReport(id: number) {
    if (!window.confirm("Delete this report?")) return;
    try {
      await watershedApi.deleteReport(id);
      if (id === reportId) setReportId(null);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "Could not delete report."));
    }
  }

  async function renameReport(report: Report) {
    const newName = window.prompt("Report name", report.name);
    if (newName === null) return;
    try {
      await watershedApi.renameReport(report.id, newName);
      if (report.id === reportId) setName(newName);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "Could not rename report."));
    }
  }

  return (
    <WatershedLayout
      sidebar={
        <>
          <BoundaryControls
            fileName={boundaryFileName}
            hasGeometry={!!geometry}
            busy={busy}
            name={name}
            onFile={(selected) => void selectFile(selected)}
            onClear={clearBoundary}
            onNameChange={setName}
            onAnalyze={() => void analyze()}
          />
          {message && (
            <p role="alert" className="mt-2 mb-3 rounded-md bg-[#fff1ef] p-[10px] text-[.87rem] leading-[1.5] text-[#a33432] [overflow-wrap:anywhere]">
              {message}
            </p>
          )}
          {results && (
            <ReportResults
              results={results}
              user={user}
              reportId={reportId}
              busy={busy}
              onSave={() => void analyze()}
            />
          )}
          {results && geometry && <ReportLocationMap geometry={geometry} />}
          <SavedReports
            user={user}
            reports={reports}
            onAuthenticate={authenticate}
            onLogout={() => void logout()}
            onOpen={(id) => void openReport(id)}
            onRename={(report) => void renameReport(report)}
            onDelete={(id) => void deleteReport(id)}
          />
        </>
      }
    >
      <WatershedMap
        ref={mapRef}
        onDraw={onDraw}
        overlay={results?.lulc_overlay ?? null}
      />
    </WatershedLayout>
  );
}
