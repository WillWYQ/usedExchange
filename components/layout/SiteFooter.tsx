import { siteConfig } from "@/content/config";
import { ContactSection } from "@/components/contact/ContactSection";
import { isTemplateConfigured } from "@/lib/utils/templateStatus";

const REPO_URL = "https://github.com/WillWYQ/usedExchange";
const ISSUES_URL = "https://github.com/WillWYQ/usedExchange/issues/new";
const CREATOR_URL = "https://github.com/WillWYQ";

// Build timestamp is computed at static-export time (correct "last updated" value).
export function SiteFooter() {
  const buildDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const configured = isTemplateConfigured();

  return (
    <footer className="mt-16 border-t border-border bg-background/60 px-4 py-10 text-sm text-foreground/50">
      {configured ? (
        /* Configured store — show seller contact */
        <div className="mx-auto mb-6 flex max-w-2xl justify-center">
          <ContactSection preferredPayment={[]} contactNote="" />
        </div>
      ) : (
        /* Template / demo mode — show project links */
        <div className="mx-auto mb-8 max-w-2xl">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-4 py-2 text-xs font-medium text-foreground/60 ring-1 ring-border transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              View on GitHub
            </a>

            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-4 py-2 text-xs font-medium text-foreground/60 ring-1 ring-border transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Open an Issue
            </a>

            <a
              href={`${REPO_URL}/discussions`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-4 py-2 text-xs font-medium text-foreground/60 ring-1 ring-border transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Discussions
            </a>

            <a
              href={`${REPO_URL}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-4 py-2 text-xs font-medium text-foreground/60 ring-1 ring-border transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Releases
            </a>
          </div>

          <p className="text-center text-xs text-foreground/35">
            Built by{" "}
            <a
              href={CREATOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/55 underline-offset-2 hover:underline"
            >
              WillWYQ
            </a>
            {" "}&middot; MIT License &middot; Open source, self-hosted, no vendor lock-in
          </p>
        </div>
      )}

      <p className="text-center text-xs">
        {siteConfig.name} &middot; Last updated {buildDate}
      </p>
      <p className="text-center text-xs text-foreground/35">
        Built with{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground/55 underline-offset-2 hover:underline"
        >
          UsedExchange
        </a>
        {" "}— a free template on GitHub. Statically-generated personal storefront for listing second-hand items. No database, no CMS — content lives entirely in one folder.{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground/55 underline-offset-2 hover:underline"
        >
          Use it today
        </a>
      </p>
    </footer>
  );
}
