import React from "react";
import { Box } from "@twilio-paste/core/box";
import { Heading } from "@twilio-paste/core/heading";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Optional: Log errors for diagnostics
    console.error("ErrorBoundary caught an error", error, errorInfo);
    if (typeof this.props.onError === "function") {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <Box padding="space60">
            <Heading as="h2" variant="heading20">
              Something went wrong.
            </Heading>
          </Box>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
