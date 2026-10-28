import { BlocksProvider } from '@blockle/blocks';
import { momotaro } from '@blockle/blocks-theme-momotaro';
import { act, type RenderOptions, render } from '@testing-library/react';
import { Component, type ReactElement, type ReactNode } from 'react';

export function renderWithTheme(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => (
      <BlocksProvider theme={momotaro} colorMode="light">
        {children}
      </BlocksProvider>
    ),
    ...options,
  });
}

/**
 * Renders a page once the content it streams in behind a Suspense boundary
 * has loaded. Pass what the page returns, `await Page(props)`, not
 * `<Page />`: a page runs once on the server, so its data promises are made
 * once, and a re-render would only make new ones.
 */
export async function renderPage(page: ReactElement) {
  await act(async () => {
    renderWithTheme(page);
  });
}

/**
 * Renders a page and resolves with the error it throws, such as
 * `notFound()`'s from content it streams in behind a Suspense boundary.
 */
export async function renderPageError(page: ReactElement): Promise<unknown> {
  let caught: unknown;
  await act(async () => {
    renderWithTheme(
      <CatchError
        onError={(error) => {
          caught = error;
        }}
      >
        {page}
      </CatchError>,
    );
  });
  return caught;
}

type CatchErrorProps = {
  onError: (error: unknown) => void;
  children: ReactNode;
};

// An error boundary has to be a class component.
class CatchError extends Component<CatchErrorProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
