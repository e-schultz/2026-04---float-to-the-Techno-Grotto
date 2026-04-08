import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
}

export class WebGLErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "#050808",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "monospace",
              color: "rgba(0,180,170,0.6)",
              fontSize: "11px",
              letterSpacing: "0.2em",
              textAlign: "center",
              gap: "16px",
            }}
          >
            <div style={{ opacity: 0.4 }}>WebGL unavailable in this environment.</div>
            <div style={{ opacity: 0.25, fontSize: "9px" }}>
              Open in a modern browser for the full experience.
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
