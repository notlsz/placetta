import { Component, type ReactNode } from "react";

/* One part that throws while drawing must never take the whole app to a white page. Around the bot it shows nothing
   (the chat carries on); around the app it shows a short message with a reload, and the error goes to the console. */
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
    const zh = typeof navigator !== "undefined" && /^zh/i.test(navigator.language);
    return (
      <div role="alert" style={{ padding: "48px 24px", maxWidth: 480, margin: "0 auto", fontFamily: "inherit" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{zh ? "页面出了点问题" : "Something on this page broke"}</h1>
        <p style={{ margin: "0 0 16px", opacity: 0.75 }}>{zh ? "您的工作已保存。重新加载即可继续。" : "Your work is saved. Reload to carry on."}</p>
        <button type="button" onClick={() => location.reload()}>{zh ? "重新加载" : "Reload"}</button>
      </div>
    );
  }
}
