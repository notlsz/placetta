import { Component, type ReactNode } from "react";
import { PageError } from "./Skeleton";

/* One part that throws while drawing must never take the whole app to a white page. Around the bot it shows nothing
   (the chat carries on); around the app and each screen it shows one plain sentence with Retry and Tell Placetta, and the error goes to the console. */
export class Guard extends Component<{ children: ReactNode; quiet?: boolean; fallback?: ReactNode }, { failed: boolean; tries: number }> {
  state = { failed: false, tries: 0 };
  private retry?: ReturnType<typeof setTimeout>;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error("[placetta] a part of the page failed and was set aside", error);
    // a quiet part (the animated bot) comes back by itself: try again shortly, a few times, then stay on the fallback
    if (this.props.quiet && this.state.tries < 3) this.retry = setTimeout(() => this.setState(s => ({ failed: false, tries: s.tries + 1 })), 800);
  }
  componentWillUnmount() { clearTimeout(this.retry); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return this.props.fallback ?? null;
    // one plain sentence, Retry (draws the screen again; a third failure reloads the page) and Tell Placetta
    return <PageError onRetry={() => (this.state.tries >= 2 ? location.reload() : this.setState(st => ({ failed: false, tries: st.tries + 1 })))} />;
  }
}
