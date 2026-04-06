import { useQuery } from '@tanstack/react-query';
import { buildUrl, fetchJson } from '../services/api';

export type User = {
  id: number;
  person_id?: number;
  username: string;
  email: string;
  activo: boolean;
};

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetchJson<User[]>(buildUrl('security', '/users')),
    staleTime: 60_000,
  });
}
