import { Link } from "@tanstack/react-router";

/**
 * Workspace standard footer: part of the honest.money ecosystem +
 * Terms / Privacy / Manifesto links.
 */
export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background/60 px-5 py-6 text-center text-xs text-muted-foreground">
      <p>{"\n"}</p>
      <ul className="mt-2 flex items-center justify-center gap-4">
        <li><Link to="/manifesto" className="hover:text-foreground">Manifesto</Link></li>
        <li aria-hidden>·</li>
        <li><Link to="/terms" className="hover:text-foreground">Terms</Link></li>
        <li aria-hidden>·</li>
        <li><Link to="/privacy" className="hover:text-foreground">Privacy</Link></li>
      </ul>
    </footer>
  );
}
