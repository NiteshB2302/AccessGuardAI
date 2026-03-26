import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  RadialLinearScale
} from "chart.js";
import { Bar, Doughnut, Line, Radar } from "react-chartjs-2";
import { fetchAnalytics, fetchFilteredAlerts, fetchTimelineAnalytics } from "../../services/dashboardService";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  RadialLinearScale,
  Tooltip,
  Legend
);

const MODELS = [
  { key: "ops", label: "Threat Ops Model" },
  { key: "behavior", label: "Behavior Risk Model" },
  { key: "email", label: "Email Intelligence Model" },
  { key: "exfil", label: "LeakGuard Model" }
];

const CHART_LABEL_COLOR = "#334155";
const CHART_TICK_COLOR = "#475569";
const CHART_GRID_COLOR = "rgba(37, 99, 235, 0.14)";

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "nearest", intersect: false },
  plugins: {
    legend: {
      labels: {
        color: CHART_LABEL_COLOR,
        boxWidth: 12,
        usePointStyle: true,
        pointStyle: "circle"
      }
    },
    tooltip: {
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      titleColor: "#f8fafc",
      bodyColor: "#e2e8f0",
      borderColor: "rgba(148, 163, 184, 0.2)",
      borderWidth: 1,
      padding: 10
    }
  },
  scales: {
    x: {
      ticks: { color: CHART_TICK_COLOR },
      grid: { color: CHART_GRID_COLOR, drawBorder: false }
    },
    y: {
      ticks: { color: CHART_TICK_COLOR },
      grid: { color: CHART_GRID_COLOR, drawBorder: false }
    }
  }
};

function Card({ title, children }) {
  return (
    <div className="chart-shell p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="glass-pill px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyber-accent">
          Live
        </span>
      </div>
      <div className="h-64 sm:h-72 md:h-80">{children}</div>
    </div>
  );
}

function toDayFilter(dateKey) {
  return {
    from: `${dateKey}T00:00:00`,
    to: `${dateKey}T23:59:59`
  };
}

function interactiveOptions(baseOptions, onClick) {
  return {
    ...baseOptions,
    onClick,
    onHover: (event, elements) => {
      const target = event?.native?.target;
      if (target) {
        target.style.cursor = elements.length ? "pointer" : "default";
      }
    }
  };
}

export default function AdminAnalyticsPage() {
  const [model, setModel] = useState("ops");
  const [analytics, setAnalytics] = useState({
    threatDistribution: [],
    employeeRiskScores: [],
    departmentRiskHeatmap: [],
    spamVsSafeEmails: { safe: 0, spam: 0, phishing: 0 },
    exfiltrationStatusMix: []
  });
  const [timeline, setTimeline] = useState({
    labels: [],
    dateKeys: [],
    alertTrend: { total: [], high: [], warning: [], low: [] },
    emailTrend: { safe: [], spam: [], phishing: [] },
    riskBands: { safe: 0, warning: 0, high: 0 }
  });
  const [drilldown, setDrilldown] = useState({
    active: false,
    title: "",
    params: null,
    loading: false,
    alerts: [],
    error: ""
  });

  useEffect(() => {
    Promise.all([fetchAnalytics(), fetchTimelineAnalytics()])
      .then(([analyticData, timelineData]) => {
        setAnalytics(analyticData);
        setTimeline(timelineData);
      })
      .catch(() => {});
  }, []);

  const loadDrilldown = useCallback(async (title, params) => {
    setDrilldown({
      active: true,
      title,
      params,
      loading: true,
      alerts: [],
      error: ""
    });

    try {
      const alerts = await fetchFilteredAlerts(params);
      setDrilldown({
        active: true,
        title,
        params,
        loading: false,
        alerts,
        error: ""
      });
    } catch (error) {
      setDrilldown({
        active: true,
        title,
        params,
        loading: false,
        alerts: [],
        error: error?.response?.data?.message || "Unable to load drill-down alerts."
      });
    }
  }, []);

  const threatDistributionChart = useMemo(
    () => ({
      labels: analytics.threatDistribution.map((item) => item.label),
      datasets: [
        {
          label: "Threat Count",
          data: analytics.threatDistribution.map((item) => item.value),
          backgroundColor: ["#ef476f", "#ffd166", "#24d17f", "#2bc0ff", "#66d9ff"]
        }
      ]
    }),
    [analytics]
  );

  const threatTrendChart = useMemo(
    () => ({
      labels: timeline.labels,
      datasets: [
        {
          label: "Total Alerts",
          data: timeline.alertTrend.total,
          borderColor: "#2bc0ff",
          backgroundColor: "rgba(43, 192, 255, 0.2)",
          fill: true,
          tension: 0.4
        },
        {
          label: "High Severity",
          data: timeline.alertTrend.high,
          borderColor: "#ef476f",
          backgroundColor: "rgba(239, 71, 111, 0.12)",
          fill: false,
          tension: 0.35
        }
      ]
    }),
    [timeline]
  );

  const severityStackChart = useMemo(
    () => ({
      labels: timeline.labels,
      datasets: [
        {
          label: "High",
          data: timeline.alertTrend.high,
          backgroundColor: "rgba(239, 71, 111, 0.72)"
        },
        {
          label: "Warning",
          data: timeline.alertTrend.warning,
          backgroundColor: "rgba(255, 209, 102, 0.72)"
        },
        {
          label: "Low",
          data: timeline.alertTrend.low,
          backgroundColor: "rgba(36, 209, 127, 0.72)"
        }
      ]
    }),
    [timeline]
  );

  const riskRadarChart = useMemo(
    () => ({
      labels: analytics.departmentRiskHeatmap.map((item) => item.department),
      datasets: [
        {
          label: "Department Risk",
          data: analytics.departmentRiskHeatmap.map((item) => item.score),
          borderColor: "#ef476f",
          backgroundColor: "rgba(239, 71, 111, 0.2)"
        }
      ]
    }),
    [analytics]
  );

  const employeeRiskChart = useMemo(
    () => ({
      labels: analytics.employeeRiskScores.map((item) => item.employeeID),
      datasets: [
        {
          label: "Risk Score",
          data: analytics.employeeRiskScores.map((item) => item.score),
          backgroundColor: "rgba(43, 192, 255, 0.7)",
          borderRadius: 6
        }
      ]
    }),
    [analytics]
  );

  const riskBandChart = useMemo(
    () => ({
      labels: ["Safe", "Warning", "High Risk"],
      datasets: [
        {
          data: [timeline.riskBands.safe, timeline.riskBands.warning, timeline.riskBands.high],
          backgroundColor: ["#24d17f", "#ffd166", "#ef476f"]
        }
      ]
    }),
    [timeline]
  );

  const emailTrendChart = useMemo(
    () => ({
      labels: timeline.labels,
      datasets: [
        {
          label: "Safe",
          data: timeline.emailTrend.safe,
          borderColor: "#24d17f",
          backgroundColor: "rgba(36, 209, 127, 0.2)",
          fill: true,
          tension: 0.35
        },
        {
          label: "Spam",
          data: timeline.emailTrend.spam,
          borderColor: "#ffd166",
          backgroundColor: "rgba(255, 209, 102, 0.2)",
          fill: true,
          tension: 0.35
        },
        {
          label: "Phishing",
          data: timeline.emailTrend.phishing,
          borderColor: "#ef476f",
          backgroundColor: "rgba(239, 71, 111, 0.2)",
          fill: true,
          tension: 0.35
        }
      ]
    }),
    [timeline]
  );

  const spamMixChart = useMemo(
    () => ({
      labels: ["Safe", "Spam", "Phishing"],
      datasets: [
        {
          data: [
            analytics.spamVsSafeEmails.safe || 0,
            analytics.spamVsSafeEmails.spam || 0,
            analytics.spamVsSafeEmails.phishing || 0
          ],
          backgroundColor: ["#24d17f", "#ffd166", "#ef476f"]
        }
      ]
    }),
    [analytics]
  );

  const exfilStatusChart = useMemo(
    () => ({
      labels: analytics.exfiltrationStatusMix.map((item) => item.label),
      datasets: [
        {
          data: analytics.exfiltrationStatusMix.map((item) => item.value),
          backgroundColor: [
            "#ef476f",
            "#ffd166",
            "#2bc0ff",
            "#24d17f",
            "#ff7b72",
            "#8be9fd",
            "#f1fa8c"
          ]
        }
      ]
    }),
    [analytics]
  );

  const threatTrendOptions = useMemo(
    () =>
      interactiveOptions(commonOptions, (_, elements) => {
        if (!elements.length) return;
        const point = elements[0];
        const index = point.index;
        const dateKey = timeline.dateKeys[index];
        const label = timeline.labels[index];
        if (!dateKey) return;
        loadDrilldown(`Alerts on ${label}`, toDayFilter(dateKey));
      }),
    [timeline, loadDrilldown]
  );

  const threatDistributionOptions = useMemo(
    () =>
      interactiveOptions({ ...commonOptions, scales: undefined }, (_, elements) => {
        if (!elements.length) return;
        const index = elements[0].index;
        const type = threatDistributionChart.labels[index];
        if (!type) return;
        loadDrilldown(`Alerts by Type: ${type}`, { type });
      }),
    [threatDistributionChart, loadDrilldown]
  );

  const severityStackOptions = useMemo(
    () =>
      interactiveOptions(
        {
          ...commonOptions,
          scales: {
            x: { ...commonOptions.scales.x, stacked: true },
            y: { ...commonOptions.scales.y, stacked: true }
          }
        },
        (_, elements) => {
          if (!elements.length) return;
          const point = elements[0];
          const dayIndex = point.index;
          const datasetIndex = point.datasetIndex;
          const dateKey = timeline.dateKeys[dayIndex];
          const dayLabel = timeline.labels[dayIndex];
          const severityLabel = severityStackChart.datasets[datasetIndex]?.label;
          const severityMap = { High: "high", Warning: "warning", Low: "low" };
          const severity = severityMap[severityLabel];
          if (!dateKey || !severity) return;
          loadDrilldown(`${severityLabel} Alerts on ${dayLabel}`, {
            ...toDayFilter(dateKey),
            severity
          });
        }
      ),
    [timeline, severityStackChart, loadDrilldown]
  );

  const riskBandOptions = useMemo(
    () =>
      interactiveOptions({ ...commonOptions, scales: undefined }, (_, elements) => {
        if (!elements.length) return;
        const index = elements[0].index;
        const severityMap = ["low", "warning", "high"];
        const titleMap = ["Safe", "Warning", "High Risk"];
        const severity = severityMap[index];
        if (!severity) return;
        loadDrilldown(`${titleMap[index]} Severity Alerts`, { severity });
      }),
    [loadDrilldown]
  );

  const emailTrendOptions = useMemo(
    () =>
      interactiveOptions(commonOptions, (_, elements) => {
        if (!elements.length) return;
        const point = elements[0];
        const dayIndex = point.index;
        const datasetIndex = point.datasetIndex;
        const seriesLabel = emailTrendChart.datasets[datasetIndex]?.label;
        if (!seriesLabel || seriesLabel === "Safe") return;

        const dateKey = timeline.dateKeys[dayIndex];
        const dayLabel = timeline.labels[dayIndex];
        if (!dateKey) return;

        const severity = seriesLabel === "Phishing" ? "high" : "warning";
        loadDrilldown(`${seriesLabel} Email Alerts on ${dayLabel}`, {
          ...toDayFilter(dateKey),
          type: "Phishing Email",
          severity
        });
      }),
    [timeline, emailTrendChart, loadDrilldown]
  );

  const spamMixOptions = useMemo(
    () =>
      interactiveOptions({ ...commonOptions, scales: undefined }, (_, elements) => {
        if (!elements.length) return;
        const index = elements[0].index;
        if (index === 0) return;
        const severity = index === 2 ? "high" : "warning";
        const label = index === 2 ? "Phishing" : "Spam";
        loadDrilldown(`${label} Email Alerts`, {
          type: "Phishing Email",
          severity
        });
      }),
    [loadDrilldown]
  );

  const phishingSpamDailyOptions = useMemo(
    () =>
      interactiveOptions(commonOptions, (_, elements) => {
        if (!elements.length) return;
        const point = elements[0];
        const dayIndex = point.index;
        const datasetIndex = point.datasetIndex;
        const seriesLabel = datasetIndex === 0 ? "Phishing" : "Spam";
        const severity = seriesLabel === "Phishing" ? "high" : "warning";
        const dateKey = timeline.dateKeys[dayIndex];
        const dayLabel = timeline.labels[dayIndex];
        if (!dateKey) return;

        loadDrilldown(`${seriesLabel} Email Alerts on ${dayLabel}`, {
          ...toDayFilter(dateKey),
          type: "Phishing Email",
          severity
        });
      }),
    [timeline, loadDrilldown]
  );

  const refreshDrilldown = useCallback(() => {
    if (!drilldown.params) return;
    loadDrilldown(drilldown.title, drilldown.params);
  }, [drilldown, loadDrilldown]);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {MODELS.map((item) => (
          <button
            key={item.key}
            onClick={() => setModel(item.key)}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              model === item.key
                ? "border-cyber-accent/50 bg-cyber-accent/15 text-slate-900 shadow-panel"
                : "border-cyber-accent/20 bg-white/70 text-slate-600 hover:bg-cyber-accent/10 hover:text-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="mb-4 inline-flex rounded-full border border-cyber-accent/20 bg-white/70 px-3 py-1 text-xs text-slate-500">
        Tip: click chart segments or points to drill into filtered alert records.
      </p>

      {model === "ops" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Threat Trend (7 Days)">
            <Line data={threatTrendChart} options={threatTrendOptions} />
          </Card>
          <Card title="Threat Distribution Mix">
            <Doughnut data={threatDistributionChart} options={threatDistributionOptions} />
          </Card>
          <Card title="Severity Load by Day">
            <Bar data={severityStackChart} options={severityStackOptions} />
          </Card>
          <Card title="Top Employee Risk Ranking">
            <Bar
              data={employeeRiskChart}
              options={{ ...commonOptions, indexAxis: "y", plugins: { legend: { display: false } } }}
            />
          </Card>
        </div>
      )}

      {model === "behavior" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Department Behavior Risk Radar">
            <Radar
              data={riskRadarChart}
              options={{
                ...commonOptions,
                scales: {
                  r: {
                    angleLines: { color: CHART_GRID_COLOR },
                    grid: { color: CHART_GRID_COLOR },
                    pointLabels: { color: CHART_LABEL_COLOR },
                    ticks: { color: CHART_TICK_COLOR, backdropColor: "transparent" }
                  }
                }
              }}
            />
          </Card>
          <Card title="Risk Band Distribution">
            <Doughnut data={riskBandChart} options={riskBandOptions} />
          </Card>
          <Card title="Employee Risk Comparison">
            <Bar data={employeeRiskChart} options={{ ...commonOptions, plugins: { legend: { display: false } } }} />
          </Card>
          <Card title="Threat Severity Drift">
            <Line data={threatTrendChart} options={threatTrendOptions} />
          </Card>
        </div>
      )}

      {model === "email" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Email Threat Trend (7 Days)">
            <Line data={emailTrendChart} options={emailTrendOptions} />
          </Card>
          <Card title="Email Classification Mix">
            <Doughnut data={spamMixChart} options={spamMixOptions} />
          </Card>
          <Card title="Phishing/Spam Daily Load">
            <Bar
              data={{
                labels: timeline.labels,
                datasets: [
                  {
                    label: "Phishing",
                    data: timeline.emailTrend.phishing,
                    backgroundColor: "rgba(239, 71, 111, 0.72)"
                  },
                  {
                    label: "Spam",
                    data: timeline.emailTrend.spam,
                    backgroundColor: "rgba(255, 209, 102, 0.72)"
                  }
                ]
              }}
              options={phishingSpamDailyOptions}
            />
          </Card>
          <Card title="Safe Email Baseline">
            <Bar
              data={{
                labels: timeline.labels,
                datasets: [
                  {
                    label: "Safe",
                    data: timeline.emailTrend.safe,
                    backgroundColor: "rgba(36, 209, 127, 0.75)"
                  }
                ]
              }}
              options={{ ...commonOptions, plugins: { legend: { display: false } } }}
            />
          </Card>
        </div>
      )}

      {model === "exfil" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Data Exfiltration Incident Lifecycle">
            <Doughnut data={exfilStatusChart} options={{ ...commonOptions, scales: undefined }} />
          </Card>
          <Card title="Employee Risk Exposure">
            <Bar
              data={employeeRiskChart}
              options={{ ...commonOptions, plugins: { legend: { display: false } }, indexAxis: "y" }}
            />
          </Card>
          <Card title="Threat Drift Related To Exfil Events">
            <Line data={threatTrendChart} options={threatTrendOptions} />
          </Card>
          <Card title="Risk Band Pressure">
            <Doughnut data={riskBandChart} options={riskBandOptions} />
          </Card>
        </div>
      )}

      {drilldown.active && (
        <div className="mt-5 chart-shell p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Drill-Down Alert Table</h3>
              <p className="text-sm text-slate-500">{drilldown.title}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshDrilldown}
                className="rounded-lg border border-cyber-accent/35 bg-cyber-accent/10 px-3 py-1.5 text-xs text-cyber-accent"
              >
                Refresh
              </button>
              <button
                onClick={() => setDrilldown((prev) => ({ ...prev, active: false }))}
                className="rounded-lg border border-slate-300 bg-white/75 px-3 py-1.5 text-xs text-slate-600"
              >
                Close
              </button>
            </div>
          </div>

          {drilldown.loading && <p className="text-sm text-cyber-accent">Loading filtered alerts...</p>}
          {drilldown.error && <p className="text-sm text-cyber-threat">{drilldown.error}</p>}

          {!drilldown.loading && !drilldown.error && (
            <div className="max-h-[350px] overflow-auto rounded-xl border border-cyber-accent/15">
              <table className="cyber-table w-full text-sm">
                <thead className="sticky top-0 bg-cyber-base/95 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldown.alerts.map((alert) => (
                    <tr key={alert._id} className="border-t border-cyber-accent/10">
                      <td className="px-3 py-2 text-xs text-slate-300">
                        {new Date(alert.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-slate-100">{alert.type}</td>
                      <td className="px-3 py-2 text-slate-300">{alert.severity}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{alert.employeeID || "-"}</td>
                      <td className="px-3 py-2 text-slate-300">{alert.status}</td>
                      <td className="px-3 py-2 text-slate-300">{alert.message}</td>
                    </tr>
                  ))}
                  {drilldown.alerts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-sm text-slate-400">
                        No alert records for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
