import { useMemo, useRef, useState } from "react";
import "./App.css";
import Slides from "./Slides.jsx";

const API_URL = "http://127.0.0.1:8000/api/dataset/profile";
const NAV = [
  { name: "Overview", icon: "◫", group: "WORKSPACE" },
  { name: "Dataset profiler", icon: "▤" },
  { name: "Privacy analysis", icon: "◈" },
  { name: "Differential privacy", icon: "⟡" },
  { name: "Reports", icon: "▧" },
];

const formatNumber = (value) => Number(value ?? 0).toLocaleString();
const formatMetric = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "—";

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}

function Icon({ children, className = "" }) { return <span className={`icon ${className}`} aria-hidden="true">{children}</span>; }

function App() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [file, setFile] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiConnected, setApiConnected] = useState(false);
  const [reportRows, setReportRows] = useState([]);
  const [audit, setAudit] = useState(null);
  const [reportName, setReportName] = useState("");
  const [reportError, setReportError] = useState("");
  const [dragging, setDragging] = useState(false);
  const heroRef = useRef(null);

  // Update CSS variables directly so pointer movement does not trigger React renders.
  function handleHeroPointerMove(event) {
    if (!heroRef.current || event.pointerType === "touch") return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    heroRef.current.style.setProperty("--pointer-x", `${(x - 0.5) * 2}`);
    heroRef.current.style.setProperty("--pointer-y", `${(y - 0.5) * 2}`);
    heroRef.current.style.setProperty("--pointer-glow-x", `${x * 100}%`);
    heroRef.current.style.setProperty("--pointer-glow-y", `${y * 100}%`);
  }

  function resetHeroPointer() {
    if (!heroRef.current) return;
    heroRef.current.style.setProperty("--pointer-x", "0");
    heroRef.current.style.setProperty("--pointer-y", "0");
    heroRef.current.style.setProperty("--pointer-glow-x", "76%");
    heroRef.current.style.setProperty("--pointer-glow-y", "44%");
  }

  async function analyzeFile(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) { setError("Choose a .csv file to profile."); return; }
    setFile(selectedFile); setDataset(null); setError(""); setLoading(true); setApiConnected(false);
    try {
      const formData = new FormData(); formData.append("file", selectedFile);
      const response = await fetch(API_URL, { method: "POST", body: formData });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`API returned ${response.status}: ${detail.slice(0, 160)}`);
      }
      const data = await response.json();
      console.log("Dataset API response:", data);
      console.log("Column count:", data.columns_count);

      setDataset(data); 
      setApiConnected(true);
    } catch (err) {
      setError(`${err.message || "Unable to reach the API."} Make sure FastAPI is running on port 8000.`);
    } finally { setLoading(false); }
  }

  async function importReport(selectedFile) {
    if (!selectedFile) return;
    setReportError("");
    try {
      const content = await selectedFile.text();
      if (selectedFile.name.toLowerCase().endsWith(".csv")) {
        const parsed = parseCSV(content);
        if (!parsed.length) throw new Error("This CSV appears to be empty or has no data rows.");
        setReportRows(parsed); setReportName(selectedFile.name);
      } else if (selectedFile.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(content);
        setAudit(parsed); setReportName(selectedFile.name);
      } else throw new Error("Select a comparison .csv or audit .json file.");
    } catch (err) { setReportError(err.message || "Could not read this report."); }
  }

  const missingColumns = useMemo(() => [...(dataset?.missing ?? [])]
    .sort((a, b) => Number(b.missing_count ?? 0) - Number(a.missing_count ?? 0)).slice(0, 6), [dataset]);
  const totalMissing = useMemo(
  () =>
    (dataset?.columns ?? []).reduce(
      (sum, col) => sum + Number(col.missing_count ?? 0),
      0
    ),
  [dataset]
);
  const metrics = [
    { label: "Records analysed", value: dataset ? formatNumber(dataset.rows) : "—", note: dataset ? "Rows in uploaded dataset" : "Upload a dataset to begin", icon: "▤", tone: "violet" },
    { label: "Features detected", value: dataset ? formatNumber(dataset.columns_count ?? dataset.columns?.length ?? 0) : "—", note: dataset ? "Columns identified" : "Schema discovery", icon: "⌘", tone: "blue" },
    { label: "Missing cells", value: dataset ? formatNumber(totalMissing) : "—", note: dataset ? "Across all columns" : "Data quality indicator", icon: "◌", tone: "amber" },
    { label: "Privacy modules", value: "03", note: "Available in this workspace", icon: "◈", tone: "mint" },
  ];

  const title = activeNav === "Overview" ? "Your privacy workspace" : activeNav;
  const description = {
    Overview: "A clear view of data quality, privacy methods, and experiment results.",
    "Dataset profiler": "Understand the shape, completeness, and structure of your data.",
    "Privacy analysis": "Compare privacy transformations against predictive utility.",
    "Differential privacy": "Explore the utility impact of privacy budgets and randomized response.",
    Reports: "Import experiment outputs and audit evidence from your local research runs.",
  }[activeNav];

  const comparisonRows = reportRows.filter((row) => Object.keys(row).length > 0);
  const metricColumns = comparisonRows.length ? Object.keys(comparisonRows[0]).filter((key) => /accuracy|balanced_accuracy|precision|recall|f1|roc.?auc|pr.?auc|epsilon|method|experiment|privacy|utility|model/i.test(key)) : [];
  const findColumn = (patterns) => metricColumns.find((key) => patterns.some((pattern) => pattern.test(key)));
  const methodCol = findColumn([/^method$/i, /experiment/i, /variant/i, /condition/i, /privacy.*method/i, /name/i]) || Object.keys(comparisonRows[0] || {})[0];
  const primaryMetric = findColumn([/pr.?auc/i]) || findColumn([/f1/i]) || findColumn([/roc.?auc/i]) || findColumn([/accuracy/i]);
  const numericMetric = (row, col) => Number(String(row?.[col] ?? "").replace(/%/g, ""));
  const maxMetric = primaryMetric ? Math.max(...comparisonRows.map((row) => numericMetric(row, primaryMetric)).filter(Number.isFinite), 0) : 0;

  function goTo(name) { setActiveNav(name); setError(""); }
  function handleDrop(event) { event.preventDefault(); setDragging(false); analyzeFile(event.dataTransfer.files?.[0]); }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => goTo("Overview")} aria-label="PrivacyBench Studio home">
          <span className="brand-mark"><span>P</span><i /></span>
          <span className="brand-copy">PrivacyBench <b>Studio</b><small>RESEARCH ENVIRONMENT</small></span>
        </button>
        <div className="workspace-switcher"><div className="workspace-avatar">H</div><div><span>Workspace</span><strong>Healthcare Research</strong></div><span className="chevron">⌄</span></div>
        {NAV.map((item, index) => <div key={item.name}>
          {(index === 0 || item.group) && <div className="nav-heading">{item.group || "ANALYSIS TOOLS"}</div>}
          <button className={`nav-item ${activeNav === item.name ? "active" : ""}`} onClick={() => goTo(item.name)}>
            <Icon>{item.icon}</Icon><span>{item.name}</span>{item.name === "Privacy analysis" && <span className="nav-count">3</span>}
            {activeNav === item.name && <span className="active-rail" />}
          </button>
        </div>)}
        <div className="sidebar-spacer" />
        <div className="privacy-callout"><div className="callout-icon"><Icon>⌁</Icon></div><strong>Privacy by design</strong><p>Research files stay in your local workflow. API processing status is shown when a request succeeds.</p><span><i /> Local workspace</span></div>
        <div className="profile-row"><div className="profile-avatar">PB</div><div><strong>Research workspace</strong><span>Personal environment</span></div><button aria-label="Workspace options" onClick={() => goTo("Reports")}>•••</button></div>
      </aside>

      <main className={`main-content ${activeNav === "Overview" ? "slides-mode" : ""}`}>
        <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><span>P</span><i /></span> PrivacyBench <b>Studio</b></div><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{activeNav}</strong></div><div className="topbar-actions"><span className={`connection-pill ${apiConnected ? "connected" : ""}`}><i />{apiConnected ? "API connected" : "API not verified"}</span><button className="icon-button" title="Open reports" onClick={() => goTo("Reports")}>↗</button><div className="topbar-avatar">PB</div></div></header>

        <section className="page-content">
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-mark">✦</span> PRIVACY ENGINEERING / HEALTHCARE</div><h1>{title}<span className="heading-period">.</span></h1><p>{description}</p></div><div className="heading-actions"><span className="local-badge"><i /> LOCAL PROJECT</span><button className="button button-secondary" onClick={() => goTo("Reports")}><Icon>▧</Icon> View reports</button></div></div>

          {activeNav === "Overview" && <Slides>{(go) => [
            <div className="s-hero" key="hero">
              <div className="hero-aura" aria-hidden="true" />
              <div className="s-hero-copy">
                <h2>Measure privacy.<br />Understand the trade-offs.</h2>
                <p>Explore data quality and benchmark how privacy-preserving methods affect downstream model utility.</p>
                <div className="hero-actions"><button className="button button-primary" onClick={() => go(2)}>Profile a dataset</button><button className="button button-ghost" onClick={() => goTo("Privacy analysis")}>Explore benchmarks</button></div>
              </div>
              <span className="scroll-hint">Scroll to continue</span>
            </div>,
            <div className="s-modules" key="modules">
              <div className="s-head"><h2>Privacy modules</h2><p>Three methods you can measure against model utility.</p></div>
              <div className="deck-grid">{[["K-anonymity", "Equivalence classes and suppression", "Privacy analysis"], ["L-diversity", "Sensitive attribute diversity checks", "Privacy analysis"], ["Differential privacy", "Privacy budget and utility trade-offs", "Differential privacy"]].map(([name, desc, page], i) => <button className="deck-card" key={name} onClick={() => goTo(page)}><span className="well" data-anchor={i} /><strong>{name}</strong><small>{desc}</small><span className="deck-open">Open module</span></button>)}</div>
            </div>,
            <div className="s-data" key="data">
              <div className="s-head"><h2>Profile your dataset</h2><p>Upload a CSV to inspect its schema and missing values.</p></div>
              <label className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}><input type="file" accept=".csv,text/csv" onChange={(e) => analyzeFile(e.target.files?.[0])} /><span className="upload-icon"><Icon>↑</Icon></span><strong>{file ? file.name : "Drop your CSV file here"}</strong><span>{file ? "Select another file to replace this one" : "or click to browse your computer"}</span></label>
              {loading && <div className="inline-status"><span className="spinner" /> Profiling dataset…</div>}
              {error && <div className="error-box">{error}</div>}
              <div className="metrics-grid">{metrics.map((metric) => <div className="metric-card" key={metric.label}><div className="metric-top"><span>{metric.label}</span><span className={`metric-icon ${metric.tone}`}><Icon>{metric.icon}</Icon></span></div><div className="metric-value">{metric.value}</div><div className="metric-note"><span className="note-dot" />{metric.note}</div></div>)}</div>
            </div>,
            <div className="s-cta" key="cta">
              <div className="s-head"><h2>Compare your experiment results</h2><p>Import <code>privacy_utility_comparison.csv</code> and <code>privacy_utility_audit.json</code> from your results folder.</p></div>
              <div className="hero-actions"><button className="button button-primary" onClick={() => goTo("Reports")}>Import results</button><button className="button button-ghost" onClick={() => goTo("Dataset profiler")}>Open dataset profiler</button></div>
            </div>,
          ]}</Slides>}
          {activeNav === "Dataset profiler" && <>
            <div className="metrics-grid compact-metrics">{metrics.slice(0, 3).map((metric) => <div className="metric-card" key={metric.label}><div className="metric-top"><span>{metric.label}</span><span className={`metric-icon ${metric.tone}`}><Icon>{metric.icon}</Icon></span></div><div className="metric-value">{metric.value}</div><div className="metric-note">{metric.note}</div></div>)}</div>
            <section className="panel profiler-upload"><div className="panel-heading"><div><span className="panel-overline">DATA INGESTION</span><h3>Dataset profile</h3><p>Choose a CSV to request a profile from your FastAPI backend.</p></div></div><label className="file-picker"><span className="file-picker-icon">↑</span><span><strong>{file ? file.name : "Choose a CSV file"}</strong><small>CSV format · processed by your local API</small></span><input type="file" accept=".csv,text/csv" onChange={(e) => analyzeFile(e.target.files?.[0])}/><span className="button button-primary">Browse files</span></label>{loading && <div className="inline-status"><span className="spinner"/> Analysing file…</div>}{error && <div className="error-box">{error}</div>}</section>
            
{dataset ? (
  <>
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-overline">SCHEMA OVERVIEW</span>
          <h3>Dataset summary</h3>
          <p>
            Returned by <code>/api/dataset/profile</code>.
          </p>
        </div>
        <span className="success-pill">
          <i /> PROFILED
        </span>
      </div>

      <div className="summary-strip">
        <div>
          <span>Rows</span>
          <strong>
            {formatNumber(dataset.rows ?? dataset.row_count ?? 0)}
          </strong>
        </div>

        <div>
          <span>Columns</span>
          <strong>
            {formatNumber(
              dataset.columns_count ??
              (Array.isArray(dataset.columns)
                ? dataset.columns.length
                : 0)
            )}
          </strong>
        </div>

        <div>
          <span>Missing cells</span>
          <strong>{formatNumber(totalMissing)}</strong>
        </div>
      </div>

      {Array.isArray(dataset.preview) && dataset.preview.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {Object.keys(dataset.preview[0] || {}).map((key) => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {dataset.preview.slice(0, 8).map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((value, j) => (
                    <td key={j}>{String(value ?? "—")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">No preview rows available.</p>
      )}
    </section>

    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-overline">DATA QUALITY</span>
          <h3>Columns with the most missing values</h3>
        </div>
      </div>

      {Array.isArray(dataset.columns) &&
      dataset.columns.some(
        (col) => Number(col.missing_count ?? 0) > 0
      ) ? (
        <div className="missing-list">
          {[...dataset.columns]
            .filter((col) => Number(col.missing_count ?? 0) > 0)
            .sort(
              (a, b) =>
                Number(b.missing_count ?? 0) -
                Number(a.missing_count ?? 0)
            )
            .slice(0, 10)
            .map((col) => {
              const count = Number(col.missing_count ?? 0);
              const rows = Number(dataset.rows ?? dataset.row_count ?? 0);
              const pct = rows
                ? Math.min(100, (count / rows) * 100)
                : 0;

              return (
                <div
                  className="missing-row"
                  key={col.name ?? col.column}
                >
                  <div className="missing-name">
                    <strong>{col.name ?? col.column}</strong>
                    <span>
                      {formatNumber(count)} missing · {pct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="bar-track">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <p className="empty-state">
          No missing-value information is available.
        </p>
      )}
    </section>
  </>
) : (
  <div className="empty-large">
    <div className="empty-symbol">▤</div>
    <h3>Your dataset profile will appear here</h3>
    <p>
      Upload a CSV above to see schema, preview rows,
      and missing-value statistics.
    </p>
  </div>
)}

          </>}

          {activeNav === "Privacy analysis" && <>
            <div className="research-banner"><div className="banner-symbol">◈</div><div><span className="panel-overline">PRIVACY / UTILITY BENCHMARK</span><h2>Compare privacy transformations</h2><p>Load the results produced by your experiment script to visualise model utility and inspect the audit evidence.</p></div><button className="button button-primary" onClick={() => goTo("Reports")}>Load experiment data <span>→</span></button></div>
            {comparisonRows.length ? <ComparisonView rows={comparisonRows} methodCol={methodCol} metricColumns={metricColumns} primaryMetric={primaryMetric} maxMetric={maxMetric} numericMetric={numericMetric}/> : <div className="empty-large"><div className="empty-symbol">◈</div><h3>No comparison report loaded yet</h3><p>Import <code>results/privacy_utility_comparison.csv</code> in Reports. The comparison will render from your actual experiment output—not placeholder numbers.</p><button className="button button-primary" onClick={() => goTo("Reports")}>Open report importer <span>→</span></button></div>}
            <div className="note-panel"><span className="note-symbol">i</span><div><strong>Interpret privacy claims carefully</strong><p>Your current k-anonymity implementation is a prototype based on selected quasi-identifiers. The randomized-response experiment perturbs training labels only; it should not be described as full-record differential privacy.</p></div></div>
          </>}

          {activeNav === "Differential privacy" && <>
            <div className="research-banner dp-banner"><div className="banner-symbol">⟡</div><div><span className="panel-overline">PRIVACY BUDGET EXPLORER</span><h2>Explore ε and model utility</h2><p>Lower epsilon generally means stronger randomization and a larger potential utility cost. Import your measured results to plot the actual trade-off.</p></div><button className="button button-primary" onClick={() => goTo("Reports")}>Import results <span>→</span></button></div>
            {comparisonRows.length ? <ComparisonView rows={comparisonRows.filter((row) => /random|rr|epsilon|ε|differential/i.test(String(row[methodCol] ?? "")) || Object.keys(row).some((key) => /epsilon/i.test(key)))} methodCol={methodCol} metricColumns={metricColumns} primaryMetric={primaryMetric} maxMetric={maxMetric} numericMetric={numericMetric}/> : <div className="dp-grid"><div className="panel dp-info"><span className="metric-icon mint"><Icon>⟡</Icon></span><h3>Privacy budget (ε)</h3><p>Epsilon controls the randomization strength in many differential privacy mechanisms. Its interpretation depends on the mechanism and composition.</p><div className="concept-line"><span>Smaller ε</span><div><i/><i/><i/><i/></div><span>Stronger privacy</span></div></div><div className="panel dp-info"><span className="metric-icon blue"><Icon>↗</Icon></span><h3>Utility impact</h3><p>Track precision, recall, F1, ROC-AUC, and PR-AUC across privacy settings rather than relying on accuracy alone for imbalanced readmission labels.</p><div className="metric-tags"><span>PR-AUC</span><span>Recall</span><span>Macro-F1</span></div></div><div className="panel dp-import"><div className="panel-overline">DATA-DRIVEN VIEW</div><h3>Bring in your measurements</h3><p>Charts activate when you import the CSV generated by your local experiment.</p><button className="button button-primary" onClick={() => goTo("Reports")}>Open Reports <span>→</span></button></div></div>}
            <div className="note-panel"><span className="note-symbol">!</span><div><strong>Scope of current experiment</strong><p>The current randomized-response experiment adds noise to training labels. It is not a guarantee of differential privacy for the complete healthcare dataset or all features.</p></div></div>
          </>}

          {activeNav === "Reports" && <>
            <div className="report-import-grid"><section className="panel report-import"><div className="panel-heading"><div><span className="panel-overline">EXPERIMENT OUTPUT</span><h3>Import comparison report</h3><p>Load the CSV written by your privacy–utility experiment.</p></div><span className="file-type csv">CSV</span></div><label className="report-drop"><input type="file" accept=".csv,text/csv" onChange={(e) => importReport(e.target.files?.[0])}/><span className="report-drop-icon">↑</span><strong>Choose comparison CSV</strong><small>results/privacy_utility_comparison.csv</small><span className="button button-secondary">Browse CSV</span></label></section><section className="panel report-import"><div className="panel-heading"><div><span className="panel-overline">AUDIT EVIDENCE</span><h3>Import audit metadata</h3><p>Load row counts, split details, and privacy-check notes.</p></div><span className="file-type json">JSON</span></div><label className="report-drop"><input type="file" accept=".json,application/json" onChange={(e) => importReport(e.target.files?.[0])}/><span className="report-drop-icon json-icon">{"{}"}</span><strong>Choose audit JSON</strong><small>results/privacy_utility_audit.json</small><span className="button button-secondary">Browse JSON</span></label></section></div>
            {reportError && <div className="error-box">{reportError}</div>}
            <section className="panel report-status"><div className="panel-heading"><div><span className="panel-overline">REPORT LIBRARY</span><h3>Imported artifacts</h3><p>Files are parsed in the browser and used only for this dashboard session.</p></div><span className="tiny-count">{(reportRows.length ? 1 : 0) + (audit ? 1 : 0)} / 2</span></div><div className="artifact-list"><div className="artifact-row"><span className="artifact-icon csv">CSV</span><div><strong>Privacy–utility comparison</strong><small>{reportRows.length ? `${reportRows.length.toLocaleString()} rows · ${reportName || "CSV imported"}` : "Not imported yet · comparison metrics and experiment variants"}</small></div><span className={`artifact-state ${reportRows.length ? "ready" : "pending"}`}>{reportRows.length ? "IMPORTED" : "WAITING"}</span></div><div className="artifact-row"><span className="artifact-icon json">JSON</span><div><strong>Privacy–utility audit</strong><small>{audit ? `${Object.keys(audit).length} top-level fields · ${reportName || "JSON imported"}` : "Not imported yet · split method, suppression, and audit context"}</small></div><span className={`artifact-state ${audit ? "ready" : "pending"}`}>{audit ? "IMPORTED" : "WAITING"}</span></div></div></section>
            {comparisonRows.length > 0 && <><div className="section-title-row"><div><h2>Experiment comparison</h2><p>Values below are parsed from the imported CSV.</p></div><span className="success-pill"><i/> {comparisonRows.length} VARIANTS</span></div><ComparisonView rows={comparisonRows} methodCol={methodCol} metricColumns={metricColumns} primaryMetric={primaryMetric} maxMetric={maxMetric} numericMetric={numericMetric}/></>}
            {audit && <section className="panel audit-panel"><div className="panel-heading"><div><span className="panel-overline">AUDIT METADATA</span><h3>Experiment context</h3><p>Values from the imported JSON audit file.</p></div><span className="success-pill"><i/> LOADED</span></div><div className="audit-grid">{Object.entries(audit).map(([key, value]) => <div className="audit-item" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{typeof value === "object" ? JSON.stringify(value) : String(value)}</strong></div>)}</div></section>}
            <div className="note-panel"><span className="note-symbol">i</span><div><strong>Reproducibility note</strong><p>Import the CSV and JSON from the same run so the plotted metrics and audit details describe the same experiment configuration.</p></div></div>
          </>}
          <footer className="footer"><span>PrivacyBench Studio <b>·</b> Research dashboard</span><span>Built for transparent privacy–utility evaluation <span className="footer-star">✦</span></span></footer>
        </section>
      </main>
    </div>
  );
}

function ComparisonView({ rows, methodCol, metricColumns, primaryMetric, maxMetric, numericMetric }) {
  if (!rows.length) return <div className="empty-large compact-empty"><div className="empty-symbol">⌁</div><h3>No matching rows in this report</h3><p>Try the full comparison view in Privacy analysis, or check that the CSV includes experiment variants.</p></div>;
  const displayMetrics = metricColumns.filter((key) => /accuracy|balanced_accuracy|precision|recall|f1|roc.?auc|pr.?auc|epsilon/i.test(key)).slice(0, 7);
  return <section className="panel comparison-panel"><div className="panel-heading"><div><span className="panel-overline">MEASURED RESULTS</span><h3>Privacy–utility comparison</h3><p>Each value is read from the imported experiment output.</p></div>{primaryMetric && <span className="metric-chip">PRIMARY METRIC · {primaryMetric.replaceAll("_", " ")}</span>}</div>{primaryMetric && <div className="chart-area"><div className="chart-axis"><span>{formatMetric(maxMetric)}</span><span>{formatMetric(maxMetric * .75)}</span><span>{formatMetric(maxMetric * .5)}</span><span>0</span></div><div className="bar-chart">{rows.map((row, i) => { const value = numericMetric(row, primaryMetric); const width = maxMetric > 0 && Number.isFinite(value) ? Math.max(1, Math.min(100, value / maxMetric * 100)) : 0; return <div className="chart-row" key={`${String(row[methodCol] ?? "variant")}-${i}`}><div className="chart-label" title={String(row[methodCol] ?? `Variant ${i + 1}`)}>{String(row[methodCol] ?? `Variant ${i + 1}`).replaceAll("_", " ")}</div><div className="chart-bar-track"><span className={`chart-bar bar-${i % 5}`} style={{ width: `${width}%` }}/></div><strong className="chart-value">{Number.isFinite(value) ? formatMetric(value) : "—"}</strong></div>; })}</div></div>}
    <div className="table-scroll"><table><thead><tr><th>Experiment</th>{displayMetrics.map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}><td className="experiment-name">{String(row[methodCol] ?? `Variant ${i + 1}`).replaceAll("_", " ")}</td>{displayMetrics.map((key) => <td key={key}>{row[key] === undefined || row[key] === "" ? "—" : row[key]}</td>)}</tr>)}</tbody></table></div>
    <div className="table-foot"><span><i/> Imported data · no values fabricated</span><span>{rows.length} experiment variants</span></div>
  </section>;
}

export default App;
