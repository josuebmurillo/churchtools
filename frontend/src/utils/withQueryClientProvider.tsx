import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../store/queryClient';

export function withQueryClientProvider<T extends object>(Component: React.ComponentType<T>) {
  return function Wrapper(props: T) {
    return (
      <QueryClientProvider client={queryClient}>
        <Component {...props as T} />
      </QueryClientProvider>
    );
  };
}
