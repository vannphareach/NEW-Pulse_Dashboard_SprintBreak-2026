import type { DashboardData, SummaryData, TrendPoint } from "@/types/dashboard";

function emptyDashboard(): DashboardData {
  return {
    cycle: "Not configured",
    generatedDate: new Date().toISOString().slice(0, 10),
    summary: {
      totalResponses: 0,
      highestArea: "",
      lowestArea: "",
      overallStatus: "No live data",
      overallScore: 0,
    },
    areaScores: [],
    trends: [],
    recommendations: [],
    actions: [],
    roleSplit: [],
    responseCounts: [],
    responseMix: [],
  };
}

function normalizeTrendList(raw: unknown): TrendPoint[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => item as Partial<TrendPoint>)
    .map((t) => ({
      ...t,
      cycle: String(t.cycle || "").trim(),
      overallScore: Number(t.overallScore) || 0,
    }))
    .filter((t) => t.cycle.length > 0 && t.overallScore > 0);
}

// Set APPS_SCRIPT_URL in .env.local:
// APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
//
// This function runs server-side only. The Apps Script endpoint reads Google
// Sheets and returns the DashboardData JSON contract defined in types/dashboard.ts.
export async function fetchDashboardData(): Promise<DashboardData> {
  const url = process.env.APPS_SCRIPT_URL;
  const isDev = process.env.NODE_ENV !== "production";

  if (!url) {
    console.error("APPS_SCRIPT_URL is not set; dashboard cannot load live Google Sheets data.");
    return emptyDashboard();
  }

  try {
    const res = await fetch(url, {
      cache: isDev ? "no-store" : "force-cache",
      next: isDev ? undefined : { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`Apps Script fetch failed: ${res.status}`);
      return emptyDashboard();
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const raw = await res.text();

    // Apps Script often returns HTML for permission/login/deployment issues.
    if (!raw.trim().startsWith("{") && !raw.trim().startsWith("[")) {
      console.error(
        "Apps Script did not return JSON. Check deployment access and endpoint URL.",
        { contentType, preview: raw.slice(0, 180) }
      );
      return emptyDashboard();
    }

    const data = JSON.parse(raw) as Partial<DashboardData>;
    const summary: Partial<SummaryData> = data.summary || {};
    const trends = normalizeTrendList(data.trends);
    const latestTrendScore = trends.length > 0 ? Number(trends[trends.length - 1].overallScore) || 0 : 0;
    const rawScore = Number(summary.overallScore);
    const resolvedScore = rawScore > 0 ? rawScore : latestTrendScore;

    const normalized: DashboardData = {
      cycle: String(data.cycle || "").trim() || "Current cycle",
      generatedDate: String(data.generatedDate || "").trim() || new Date().toISOString().slice(0, 10),
      narrativeSummary: data.narrativeSummary,
      summary: {
        totalResponses: Number(summary.totalResponses) || 0,
        teamSize: Number(summary.teamSize) || undefined,
        highestArea: String(summary.highestArea || "").trim(),
        lowestArea: String(summary.lowestArea || "").trim(),
        overallStatus: String(summary.overallStatus || "").trim() || "No status",
        overallScore: resolvedScore,
        scoreDelta: Number.isFinite(Number(summary.scoreDelta)) ? Number(summary.scoreDelta) : undefined,
      },
      areaScores: Array.isArray(data.areaScores) ? data.areaScores : [],
      trends,
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      actions: Array.isArray(data.actions) ? data.actions : [],
      roleSplit: Array.isArray(data.roleSplit) ? data.roleSplit : [],
      responseCounts: Array.isArray(data.responseCounts) ? data.responseCounts : [],
      responseMix: Array.isArray(data.responseMix) ? data.responseMix : [],
    };

    const trendList = normalized.trends;
    const latest = trendList.length > 0 ? Number(trendList[trendList.length - 1].overallScore) : 0;
    if (trendList.length >= 2 && Math.abs(normalized.summary.overallScore - latest) <= 0.3) {
      normalized.summary.scoreDelta = +(
        trendList[trendList.length - 1].overallScore -
        trendList[trendList.length - 2].overallScore
      ).toFixed(1);
    }

    return normalized;
  } catch (err) {
    console.error("fetchDashboardData error:", err);
    return emptyDashboard();
  }
}
