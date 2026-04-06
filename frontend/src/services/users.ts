import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buildUrl, fetchJson } from './api'

export type User = {
  id: number
  person_id?: number | null
  username: string
  email: string
  active: boolean
}

export type UserCreatePayload = {
  username: string
  email: string
  password: string
  person_id?: number | null
  active: boolean
}

export type UserUpdatePayload = {
  username: string
  email: string
  password?: string
  person_id?: number | null
  active: boolean
}

const USERS_KEY = ['users']

export function useUsers() {
  return useQuery<User[]>({
    queryKey: USERS_KEY,
    queryFn: () => fetchJson<User[]>(buildUrl('security', '/users')),
    staleTime: 30_000,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserCreatePayload) =>
      fetchJson<User>(buildUrl('security', '/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdatePayload }) =>
      fetchJson<User>(buildUrl('security', `/users/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      fetchJson<{ deleted: boolean; id: number }>(buildUrl('security', `/users/${id}`), {
        method: 'DELETE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
