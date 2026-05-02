/**
 * GET /api/favorites/workflow-status — checks whether the most recent
 * scrape-lots GH Actions run is still running, completed, or failed.
 *
 * The "Refresh favorites" button on /favorites polls this every 5s
 * after triggering /api/favorites/refresh, so it can show a spinner
 * and apply fresh listings as soon as the workflow finishes.
 */
import { NextResponse } from "next/server";

const GITHUB_REPO   = "Pickor/nimbridge";
const WORKFLOW_FILE = "feed-lots.yml";

interface WorkflowRun {
  status: string;         // "queued" | "in_progress" | "completed"
  conclusion: string | null; // "success" | "failure" | "cancelled" | null
  created_at: string;
}

// GET /api/favorites/workflow-status?since=<unix_ms>
// Returns the status of the most recent scrape-lots workflow run triggered
// after the given timestamp. Used by the favorites refresh button to know
// when the GitHub Actions job finishes without waiting for data to change.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const since = Number(searchParams.get("since") ?? "0");

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ status: "unknown", error: "not configured" });
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`,
    {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github+json",
      },
      // Don't cache — we need real-time status
      cache: "no-store",
    },
  );

  if (!res.ok) {
    console.error("[workflow-status] GitHub API error:", res.status);
    return NextResponse.json({ status: "unknown" });
  }

  const json = await res.json() as { workflow_runs?: WorkflowRun[] };
  const runs = json.workflow_runs ?? [];

  // Find the most recent run created at or after the dispatch time.
  // Allow 60s of slack to account for GitHub's clock skew / queue delay.
  const sinceMs = since - 60_000;
  const run = runs.find((r) => new Date(r.created_at).getTime() >= sinceMs);

  if (!run) {
    // Workflow not picked up by GitHub yet — still queued
    return NextResponse.json({ status: "queued" });
  }

  return NextResponse.json({
    status: run.status,         // "queued" | "in_progress" | "completed"
    conclusion: run.conclusion, // "success" | "failure" | null
  });
}
