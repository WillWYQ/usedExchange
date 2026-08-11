// Server-side helper for fetching public GitHub releases.
// Called from page.tsx at build time so the timeline is baked into the static
// export. If the API is unreachable we return an empty array rather than fail
// the build.

export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string | null;
}

interface RawGitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string | null;
  draft: boolean;
}

const RELEASES_API_URL =
  "https://api.github.com/repos/WillWYQ/usedExchange/releases";
const FETCH_TIMEOUT_MS = 10_000;

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function buildRequestInit(): RequestInit {
  // In GitHub Actions, GITHUB_TOKEN is available and raises the API rate limit
  // from 60/hour (unauthenticated) to 5,000/hour. For local builds and other
  // environments the endpoint is still public without a token.
  const token = process.env.GITHUB_TOKEN;
  return {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: createTimeoutSignal(FETCH_TIMEOUT_MS),
  };
}

export async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  try {
    const response = await fetch(RELEASES_API_URL, buildRequestInit());

    if (!response.ok) {
      console.warn(
        `GitHub releases fetch failed: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const releases = (await response.json()) as RawGitHubRelease[];

    return releases
      .filter((release) => !release.draft)
      .map((release) => ({
        tag_name: release.tag_name,
        name: release.name,
        published_at: release.published_at,
        html_url: release.html_url,
        body: release.body,
      }))
      .sort(
        (a, b) =>
          new Date(b.published_at).getTime() -
          new Date(a.published_at).getTime(),
      );
  } catch (error) {
    console.warn(
      "Unable to fetch GitHub releases:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

export function formatReleaseDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
